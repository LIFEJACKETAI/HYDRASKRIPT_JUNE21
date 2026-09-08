# Manuscript Import: 504 Fix (async job)

## What was broken

`POST /api/story-bible/import-manuscript` did **all** of the work inside a single
HTTP request:

```
auth → extract text → LLM entity extraction → write entities → enqueue review → respond
```

The LLM step had no effective time limit:

| Setting | Value | Where |
| --- | --- | --- |
| route `maxDuration` | 300s | `src/app/api/story-bible/import-manuscript/route.ts` |
| per-attempt fetch timeout | 300s | `openrouter.ts` / `google-gemini.ts` / `nvidia-nim.ts` |
| internal retries per provider | 3 | `withRetry(maxAttempts = 3)` |
| providers per cycle | 3 | OpenRouter → Gemini → NVIDIA NIM |
| full cycles | 2 | `MAX_CYCLES` in `llm/fallback.ts` |

Worst case ≈ 2 × 3 × 3 × 300s = **90 minutes**, while a single hung attempt
(300s) already equalled the whole function budget. Vercel therefore killed the
invocation and returned `504 FUNCTION_INVOCATION_TIMEOUT` with no body — the
browser only saw `Failed to fetch`. This affected `.txt` and `.pdf` alike, which
is the tell that the parser was never the problem: the LLM call was.

Two smaller issues rode along:

* The route accepted 15 MB uploads, but Vercel rejects any Serverless Function
  request body over **4.5 MB** before the handler runs, so the friendly message
  was unreachable.
* With no `bookId`, the draft Book was created **before** the LLM call, so every
  retry left another orphan draft book behind.

## What it does now

The import follows the same pattern `/api/universe/review` and `/api/audiobook`
already use.

1. `POST /api/story-bible/import-manuscript` — auth, validate, extract text,
   resolve/create the Book, create a `manuscript_import` job whose payload lives
   in `jobs.result`, and **respond in ~1–2s** with `{ jobId, bookId }`.
   The queue is then driven from `after()` (`src/lib/background.ts`), which keeps
   the invocation alive on Vercel instead of being frozen at the response.
2. `src/lib/services/manuscriptImport.ts` (run by
   `src/lib/workers/manuscriptImportWorker.ts`) — the LLM extraction, now with a
   hard budget: 20k chars in, 4k tokens out, 90s per provider attempt, **240s
   for the whole chain** so it always finishes inside one 300s invocation. It
   writes entities de-duplicated against what the book already has, so a
   reclaimed/retried job never creates duplicate characters, then auto-enqueues
   the Universe editorial review (non-fatal).
3. `GET /api/story-bible/import-manuscript/[jobId]` — progress + result. The
   client (`importManuscriptToStoryBible` in `src/lib/api.ts`) polls every 2.5s
   and drives a progress bar in `StoryBible.tsx`. Dropped polls are tolerated
   (5 in a row) because a Wi-Fi handover no longer kills the import.

New/changed supporting pieces:

* `src/lib/background.ts` — `runInBackground()` wrapper around Next's `after()`
  (stable since 15.1, backed by Vercel's `waitUntil`). Nothing in the repo used
  it before, so detached queue work was frozen at the response.
* `askLLMJSONWithFallback(..., options)` — now accepts `maxTokens`, `timeoutMs`,
  `retries`, `maxCycles` and `deadlineMs`. Every existing caller is untouched
  (all new arguments are optional), but any long path can now be given a real
  deadline.
* `jobQueue.drainOnce()` — awaits one claimed job, so `after()` has something to
  wait on. `claimNextJob` also passes `result` through to workers now (the
  `generate_image` worker was reading a field the queue never supplied).
* `src/lib/manuscript-import.ts` — pure payload/outcome contract shared by the
  two routes and the worker (no DB or LLM imports, so polling stays cheap).

## Deploy steps

**1. Add the job type to the database (once).** `JobType` is a native Postgres
enum in this project (`fix-db.sql` already does `ALTER TYPE "ChapterStatus" ...`),
so the new value has to exist before the code is deployed:

```bash
psql "$DATABASE_URL" -f scripts/sql/2026_09_08_add_manuscript_import_job_type.sql
```

or paste `prisma/migrations/20260908_add_manuscript_import_job_type/migration.sql`
into the Supabase SQL editor, or `npx prisma migrate deploy`. The statement is
idempotent and is a no-op on any database where `jobs."jobType"` is plain TEXT.

If this step is skipped the API answers `503` with an explicit "run the
migration" message instead of failing obscurely.

**2. Deploy.** `vercel.json` already runs `npx prisma generate && next build`, so
the client picks up the new enum value automatically. Locally: `npm run db:generate`.

**3. Check.** Upload a manuscript from the Story Bible tab. The request should
return in ~1–2s and the UI should show a progress bar
(`Reading… → Extracting… → Writing N entities… → Queuing the Universe review`).
In Vercel logs look for:

```
[API/story-bible/import-manuscript] Queued job <id> for "<file>" (<n> chars) → book <id>
[ManuscriptImport] job <id>: parsing "<file>" ...
[ManuscriptImport] job <id>: N created, M already present { CHARACTER: x, ... }
```

## Limits that remain

* **4.5 MB per upload** — a Vercel platform limit on request bodies, not an app
  choice. A text-only novel is normally 1–3 MB; scanned/image PDFs are the ones
  that blow past it. Raising this needs a direct-to-Blob client upload
  (`@vercel/blob` is already a dependency) plus URL-based extraction in the worker.
* **The head of the manuscript (20k chars) feeds entity extraction.** The full
  text still goes to the Universe editorial review. Extraction quality plateaus
  early while latency scales with length, and this is what keeps one job inside
  one function invocation.
* **Free-tier models are the slow path.** `OPENROUTER_MODEL` defaults to a
  `:free` model; if imports routinely hit the 240s deadline, point
  `OPENROUTER_MODEL` / `GEMINI_TEXT_MODEL` at a faster model rather than raising
  the budget.

## Tests

`tests/manuscript-import.test.ts` covers the payload contract (including that a
finished outcome is never re-run as pending work), text handling, and the
deadline behaviour — asserting the chain gives up in ~3s with a `timed out`
error and exactly one provider attempt, instead of burning 2 cycles × 3
providers × 60s.

```bash
npx jest tests/manuscript-import.test.ts
```
