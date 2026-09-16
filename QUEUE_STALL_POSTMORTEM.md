# Book generation stuck on "Queued..." — postmortem + fix notes

Date: 2026-09-16
Reported symptom: book generation never leaves **Queued...** in the Studio progress
panel. Vercel logs (Sep 15, 13:08–13:15) also show `POST /api/story-bible/import-manuscript`
→ 500 and `GET /api/story-bible` → 500 "Book not found".

---

## 0. The single most important finding: **production is not running your code**

```
gh api repos/LIFEJACKETAI/HYDRASKRIPT_JUNE21/commits/main/status
→ { "state": "failure", "description": "Deployment failed.", "context": "Vercel" }
```

- `main` is `a5b60728` = _"Merge pull request #14 — fix: unstick manuscript import and
  book generation on Vercel"_, merged **2026-09-15 20:17 UTC**.
- Its Vercel deployment went red **4 seconds later** (i.e. before any compile), and the
  newest _successful_ production deployment is its **parent** `aec810f0` (17:55 UTC).
- The logs you pasted are from **13:08–13:15**, i.e. an even older build
  (`915b4b56`, deployed 08:22). That build predates the whole pump-based queue.

Proof in the logs themselves — the deployed code and the repo disagree:

| Log line (production)                                                  | Current `main` code                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `[Queue] Background poll loop started (poll 5000ms, recovery 60000ms)` | `startLoop()` returns early on serverless and logs `Skipping in-process poll loop on serverless` |
| `Direct upload failed: Book not found` → **500**                       | mapped to **404** before that log line is ever reached                                           |

**So: the in-process poll loop you are running in production only ticks while a
request is being served.** On Vercel the instance freezes the moment the response is
sent, so `setInterval` never fires again. Your own log shows it exactly: 20 polls of
`/api/jobs/f9774d9d…` every 5 seconds, each returning `200 queued`, each one giving the
frozen loop a few milliseconds of CPU — and the job's `progressMessage` never advances
past `Queued...`. That is not a hung generation, it is a queue with no driver.

Everything below is about (a) the two things that blocked PR #14 from deploying and
(b) the bugs in that "fix" which would have re-created the same stall after the next deploy.

---

## 1. Two deploy blockers (why `main` never shipped)

### 1a. `vercel.json` platform config — Vercel rejects the deploy before it builds

PR #14 changed the pump cron to `* * * * *`. On a Hobby project Vercel refuses to create
the deployment at all:

> Hobby accounts are limited to daily Cron Jobs. This cron expression (\* \* \* \* \*)
> would run more than once per day.

This fails **before** any build step, which matches the 4-second red status on `main`.
It also explains a second data point: after the cron was made daily, the _branch_
deployment still failed **at the same second it was created** (`created_at ==
updated_at == 02:38:16Z`), i.e. again nothing compiled. Both fields in `vercel.json` that
Vercel validates at deploy time — `crons` (plan-limited) and `regions` (Pro-only on some
accounts) — are therefore **removed**; the file now contains only framework/build keys.

The pump does not need cron: job creation forces a kick, each claim self-kicks the pump
after it, and `after()` keeps work alive past the response. `iad1` was already the default
region. If you want the backstop anyway, prefer the dashboard (Settings → Cron Jobs, where
the plan limit is visible) over `vercel.json`; the equivalent file form is:

```json
"crons": [{ "path": "/api/queue/pump", "schedule": "0 6 * * *" }]
```

On Pro, `* * * * *` is fine there and recovers interrupted chains within a minute.

> **If the next deploy also fails within seconds of being created, it is account-level,
> not code-level.** Vercel's own hint is the fastest look:
> `npx vercel inspect dpl_7vVQWFRKZjjkAvj1etcC14zSwUAC --logs`
> (or open the deployment URL from the failing commit status). Common instant rejections:
> project paused for usage, cron slots exhausted, or deployment concurrency on Hobby.

For the record, the app **does** compile: a local `next build` gets through webpack for all
routes (`Compiled with warnings`, the warnings being only the intentional dynamic
`require.resolve` in `manuscript.ts`); it stops at `tsc` solely because the Prisma client
cannot be generated in a sandbox without network access to `binaries.prisma.sh`. On Pro you can tighten it again.

### 1b. `src/app/api/queue/pump/route.ts` called a non-existent global

```ts
after(() => runPump()); // TS2304: Cannot find name 'after'.
```

`after` is **not** a global; it must be imported from `next/server`. This alone fails
`next build` (the project does not set `typescript.ignoreBuildErrors`). At runtime it
would also have thrown `ReferenceError`, silently pushing every pump request onto the
slow inline path.

**Fixed:** `import { after, NextRequest, NextResponse } from 'next/server'`.

---

## 2. The stall mechanisms still present in `main` (fixed here)

1. **Head-of-line starvation.** `maxConcurrent = 1` per instance and
   `processOneQueuedJob()` returns `'busy'` while the instance runs anything at all — and
   the pump **`break`ed** out of its loop on `'busy'`. One `editorial_review` (started
   13:11:42, still writing 2 minutes later in your log) therefore blocks every queued
   book on that warm instance, and every kick from the UI bounces.
   → added `queue.waitForCapacity()`; the pump now waits for the slot (3 waits, ≤60s each).

2. **Lease (15 min) vs function budget (300 s).** When an instance was frozen mid-job the
   job stayed `active` with a valid lease for up to 15 minutes, so _nothing_ could re-drive
   it. → `QUEUE_LEASE_MS` default 120 s with a 30 s heartbeat (renewed while alive, so a
   live job can never be stolen); stale heartbeats also trigger recovery.

3. **LLM retry storm ate the whole invocation.** `[LLM] NVIDIA NIM Attempt 1/3 … 503
Service Unavailable - Service temporarily overloaded` — each attempt allowed 300 s,
   3 attempts, then 4 providers × ~3 models. One overloaded burst = a job that cannot
   finish before Vercel kills it = an orphaned lease = "Queued…".
   → new `src/lib/llm/budget.ts`: the queue gives each claim a work window
   (`JOB_BUDGET_MS`, 240 s on serverless); providers clamp their per-attempt timeout to
   what's left, use jittered backoff, and bail with `LlmBudgetExceededError`. The queue
   turns that (and any 503/429/5xx) into a **re-queue with backoff**
   (`QUEUE_BACKOFF_MS`, default 30 s × attempt) instead of a silent wedge, and after
   `maxRetries` a **clean failure + credit refund** with the message
   _"All AI providers are temporarily overloaded (HTTP 503/429)…"_.

4. **P2028 — the queue starved itself of DB connections.**
   - `reconcileStuckBooks()` ran on **every** pump kick (i.e. every 5 s poll) and did
     `include: { chapters: true }` for up to 50 books — every chapter's full prose,
     megabytes per kick, holding a pooled connection.
   - every `GET /api/jobs/[id]` kicked the pump → a kick storm of lambdas, each opening a
     3-connection pool against a Supabase transaction pooler.
   - `PRISMA_TRANSACTION_MAX_WAIT` (10 s) was _shorter_ than the pg connect timeout, so
     Prisma gave up first with "Unable to start a transaction in the given time".
     → reconcile now `select`s only `id/index/status/approvalStatus` and is throttled to one
     pass per 45 s; poll-driven kicks are throttled to 12 s (`QUEUE_KICK_THROTTLE_MS`) with
     `forceKickQueuePump()` for freshly-created jobs; pool defaults raised
     (`max 3`, `connectionTimeout 20 s`, `maxWait 25 s`, `keepAlive`); a claim query that was
     sorting the whole queued set now has `@@index([status, createdAt])`.

5. **Lost terminal status writes = a finished book showing "Queued".**
   `updateJobStatus()` retried 3× with a 2 s cap and, for non-status updates, swallowed the
   error — so a `completed` write lost to one P2028 left the row `active` forever.
   → terminal transitions go through `settleJobStatus()` (8 escalating retries, loud
   `CRITICAL` log if the DB still refuses), claims bump `progressPercent` to ≥5 so the UI can
   tell "claimed and working" from "nobody has picked this up", and a worker that returns
   without settling its job is settled by the dispatcher.

6. **Orphaned job rows.** A job whose book is already `completed`/`failed` (or deleted) can
   never make progress, but the UI reads `queued|active` as "still generating".
   → the pump closes such jobs (`settleOrphanedGenerationJobs`, ≥10 min old only).

## 3. The two 500s in your logs

- `POST /api/story-bible/import-manuscript` — _"Setting up fake worker failed: Cannot find
  module `/var/task/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`"_. Not a corrupt
  PDF: pdf.js loads its worker **at runtime**, webpack can't see it, so Vercel's file
  tracing never copied it into the lambda. → `next.config.js` now lists `pdfjs-dist` as a
  server external **and** `outputFileTracingIncludes` ships `pdfjs-dist` + `pdf-parse` +
  `pdfkit` for the routes that need them; `src/lib/manuscript.ts` points `PDFParse` at the
  absolute worker path (verified locally: a 26 k-char PDF parses fine, and
  `Invalid PDF structure.` is reported as a _file_ problem). `PdfReadError.infrastructure`
  now separates "this deployment is missing the worker" (503) from "this PDF is
  unreadable" (400), so users are never told to re-export a good file again. The audiobook
  upload had a private copy of the same bug and now shares the extractor.
- `GET /api/story-bible` → 500 "Book not found". That is a **client holding a deleted
  book id** (you deleted `f4b7d8ef…` at 13:14:34, and the next two requests 500'd).
  `assertBookOwnership` throws a plain `Error`, and every route turned it into a 500.
  → shared `bookAccessFailure()` maps it to 404/403 in the story-bible list route and
  `/api/universe/review`, which keeps your error rate honest.

---

## 4. To ship it

1. `git push` this branch → PR → merge to `main`.
2. Vercel → Project settings → Environment Variables, set (values from `.env.example`):
   `DATABASE_POOL_MAX=3`, `PRISMA_TRANSACTION_MAX_WAIT=25000`,
   `PRISMA_TRANSACTION_TIMEOUT=30000`, `PRISMA_CONNECTION_TIMEOUT=20000`,
   `CRON_SECRET` (or `QUEUE_PUMP_SECRET`) so cron and self-kicks are authorized,
   `APP_URL` only if you want self-kicks to target a specific host — on Vercel the code
   prefers `VERCEL_URL` (the deployment's own hostname) so a preview deployment can never
   drive production's queue.
   _If the account is Hobby, also set `QUEUE_PUMP_DEADLINE_MS=30000` and
   `JOB_BUDGET_MS=40000` to fit the 60 s function cap._
3. **Enable the Supabase vars for _every_ env scope**, not just Production:
   Vercel → Settings → Environment Variables → edit `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` → tick **Production / Preview / Development**.
   Leave **Sensitive OFF** for the anon key (it is a public client key, and _Sensitive vars are
   withheld from builds entirely_). Without them, `next build` fails before it can ship any of
   the above — see §7. This is the step that bit us: the _code_ was fine, the _preview env_ wasn't.
4. Apply the new index against the production DB: `npx prisma db push` (or
   `prisma migrate deploy` — `prisma/migrations/20260916_add_job_claim_index/migration.sql`).
5. Redeploy any **stuck** book: its `book.status` is still `outlining|writing|finalizing`,
   so the pump's reconcile pass will re-enqueue it; no data repair needed.

## 5. Verify

```bash
# queue depth + oldest queued job + effective deadline, without claiming anything
curl -s -H "x-queue-pump-secret: $CRON_SECRET" \
  'https://www.hydraskript.com/api/queue/pump?stats=1'
```

Healthy generation now logs, in order:
`[API] Generation started …` → `[Queue] Job <id> signaled for processing` →
`[QueuePump] …`/`[Queue] Executing generate_outline job <id>` → progress messages
(`Generating story blueprint…`) → `Blueprint complete!`. If you see `Retrying (1/3)` or
`Providers busy — re-queued`, the queue is working as designed and the providers were the
problem; if you see nothing after "signaled", check the pump's authorization/`APP_URL` first.

## 6. Recommended follow-ups (not done here)

- A real consumer (Worker/BullMQ on Fly/Railway, or SQS+Lambda) removes the whole
  "keep the chain alive across frozen lambdas" class of bugs; the DB queue is fine at
  current volume but every fix in §2 is serverless damage control.
- Provider health: `503` from NVIDIA NIM was the trigger. Consider making OpenRouter or
  Gemini primary during NVIDIA incidents (one env var each in `.env.example`).
- Supabase connection count: `SELECT count(*) FROM pg_stat_activity` while generating; if
  warm lambdas approach the pooler's client limit, raise `DATABASE_POOL_MAX` _down_ rather
  than up and keep `PRISMA_TRANSACTION_MAX_WAIT` generous.
- `jobs.result` stores up to 500 k chars per manuscript-import job; move window text to its
  own table if import jobs stay frequent.

---

## 7. Reading the Vercel build log (`npx vercel inspect dpl_... --logs`)

Three distinct failure classes showed up while shipping this, and they looked identical
from the outside ("Deployment failed"):

1. **Rejected at deploy creation** — `vercel.json` `crons` (Hobby allows one _daily_ cron) plus a
   `regions` list. No build log exists. Fixed by removing both.
2. **Failed during static generation** — `npx vercel inspect dpl_... --logs` showed install,
   `prisma generate`, webpack compile and lint all green, then
   `Generating static pages (0/37)` → `Error occurred prerendering page "/_not-found"` →
   `@supabase/ssr: Your project's URL and API key are required`. The root layout renders
   `<RecoveryHandler />`, which constructed a browser Supabase client _during render_, so on this
   branch's **preview** env scope (no `NEXT_PUBLIC_SUPABASE_*`) every prerendered page threw.
   Fixed in code (`src/lib/supabase/client.ts`, `src/components/auth/RecoveryHandler.tsx`,
   `src/lib/supabase.ts` construct lazily / degrade to an inert stub) **and** by step 3 in §4.
   Reproduced both ways in this repo: `next build` with the vars unset fails with exactly this
   error, and passes `37/37` static pages with the fix.
3. **Anything below** — still worth knowing how to read. What each candidate looks like:

| Log says                                                                                                                                        | Meaning                                                                                                                                                                                                             | Fix                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Serverless Functions must have a maxDuration between 1 and 60 for plan hobby` / `Builder returned invalid maxDuration value`                   | the project is on the **legacy (non-Fluid) runtime**, where 300 s is not declarable on Hobby. Note `aec810f0` shipped fine with `maxDuration = 300` on the pump, so this is only possible if that setting regressed | Vercel → Settings → Functions → **enable Fluid Compute** (300 s on Hobby, and I/O wait isn't billed — ideal for LLM calls). Do **not** lower `maxDuration` in code: the pump's 270 s deadline and `JOB_BUDGET_MS` assume ≥300 s |
| `TransactionTimeout`/`Command "npx prisma generate" exited with 1`, `Failed to download binary`                                                 | build-time Prisma failure (engine download / schema)                                                                                                                                                                | re-run deploy; if the schema is at fault, `npx prisma validate` locally. `prisma generate` needs no DB, so `DATABASE_URL` is not the cause                                                                                      |
| `Killed` / `JavaScript heap out of memory`                                                                                                      | build OOM (this repo is large)                                                                                                                                                                                      | Settings → Functions → higher build machine, or set `NODE_OPTIONS=--max-old-space-size=8192` in build env vars                                                                                                                  |
| `Failed to compile.` + a `TS####` line                                                                                                          | a real type error in the build env (my sandbox can't run `prisma generate`, so Prisma-typed errors are invisible locally)                                                                                           | paste it here — one line is enough                                                                                                                                                                                              |
| `Error occurred prerendering page "/_not-found"` + `@supabase/ssr: Your project's URL and API key are required` (or `supabaseUrl is required.`) | an env-scope gap, not a code bug: something reachable from the root layout or an imported route module built a Supabase client at import/render time, and Preview/Development doesn't carry the vars                | tick the vars for Preview/Development (and don't mark the anon key Sensitive); the branch now also degrades instead of throwing                                                                                                 |
| `npm error ERESOLVE` / lockfile mismatch                                                                                                        | `installCommand: npm install` fighting a stale lock                                                                                                                                                                 | switch the project's install command to `npm ci`, or commit the refreshed lockfile                                                                                                                                              |
| no build log at all, "Deployment failed" instantly                                                                                              | account-level: usage cap, paused project, or cron slots                                                                                                                                                             | Settings → Usage / Cron Jobs                                                                                                                                                                                                    |

If it's a `TS####` from code in this PR: the two places worth eyeballing are the
`select`-shaped claim in `src/lib/workers/queue.ts` and the `book: { is: null }`
filter in `src/app/api/queue/pump/route.ts` — both typecheck only against a
_generated_ Prisma client, which is exactly what the sandbox lacks.
