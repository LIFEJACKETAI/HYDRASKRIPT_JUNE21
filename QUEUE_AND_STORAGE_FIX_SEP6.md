# Fix — Create-Book flow: 500 crash, chapters stalling at ~6, outline/character drift

Date: 2026-09-06. Symptoms reported: (1) chapters created but ignoring the approved
outline and mixing characters up, (2) generation stopping after 6 chapters,
(3) Vercel 500s and `Failed to start job queue loop` with
`ENOENT mkdir '/var/task/public/assets/covers'`.

## Root causes

### 1. 500 + dead queue loop — writing images into `public/` on serverless
On Vercel the function filesystem (`/var/task`) is read-only and `public/` is
served from the CDN (not present at runtime). The image-save fallback tried to
`mkdir public/assets/covers`, which threw. In the older deployment that
`mkdir` also ran at module/instrumentation scope, so **every** function whose
import graph touched the storage module threw at boot — including the
instrumentation job-queue loop (`Failed to start job queue loop`).

Fix:
- `src/lib/utils/storage.ts` — on serverless the local-disk fallback now writes
  to the writable `/tmp/hydraskript-assets` instead of `public/assets`. Local
  dev still writes to `public/assets` (so files show at `/assets/...`).
- **Action required (production): set Supabase Storage env vars so uploads are
  persistent** (a `/tmp` file is ephemeral and not publicly served):
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_STORAGE_BUCKET` (default `hydraskript-assets`), and create the
  bucket with public read. When these are set, covers/illustrations/audio go to
  Supabase and nothing touches the local disk.

### 2. Stops after ~6 chapters — no durable driver on serverless
Chapter generation was an in-process chain (each job created and `startJob`’d
the next within the same function invocation). A serverless function is frozen
after it finishes responding and is killed at its timeout (~60s Hobby / 300s
Pro). 6 chapters ≈ one function lifetime; then the instance froze mid-chain and
nothing re-drove the queue — the rest stayed `Pending` forever.

Fix:
- New durable driver route `src/app/api/queue/pump/route.ts` (`GET` for cron,
  `POST` for self-kicks). It recovers expired leases, reconciles stuck books,
  claims and runs **one** job, then re-kicks itself over HTTP — each kick lands
  on a fresh warm instance with a full timeout, so the chain walks chapter after
  chapter across invocations.
- `src/lib/workers/queue.ts`:
  - `startJob()` now kicks the HTTP pump on serverless (in-process loop is kept
    for local/Docker).
  - Job claims are **atomic** (`updateMany ... WHERE status='queued'`), so
    overlapping pumps can never run the same job twice.
  - New `processOneQueuedJob()` used by the pump; old loop delegates to it.
- `vercel.json` — daily cron backstop to `/api/queue/pump` (Hobby allows daily;
  on Pro you can raise it to every minute: `"*/1 * * * *"`). For faster than
  daily recovery on Hobby, point an external scheduler (cron-job.org, etc.) at
  the pump URL.

**Action required (production):**
- Set `CRON_SECRET` (Vercel auto-injects it once a cron exists; also used to
  authenticate self-kicks).
- Set `NEXT_PUBLIC_APP_URL=https://www.hydraskript.com` so self-kicks hit the
  canonical host (defaults to the deployment URL otherwise).
- Make sure the function can call itself (no auth/edge rule blocking
  `/api/queue/pump` with the `x-queue-pump-secret` header).

### 3. Ignoring outline / mixing characters
- **Continuity memory was fake.** The prose path hardcoded
  `charactersIntroduced: []` and stitched a "summary" from the first + last
  sentence, so by chapter 3 the model had no reliable cast/plot memory.
  Fix: `bookGenerator.ts` now runs a cheap recap pass after each chapter
  (`buildChapterRecap`) that extracts the named cast + a 2–3 sentence plot
  recap (with a heuristic fallback). These feed later chapters via a
  "CHARACTERS ALREADY INTRODUCED" block.
- **Outline was truncated mid-book.** The full outline was sliced to 4000 chars,
  which dropped later chapters' briefs for long books. Raised to 12000 and the
  chapter brief to 2000 (`src/lib/llm/prompts.ts`), plus an explicit
  "STRICT ADHERENCE" section.
- **Weak/broken model defaults.** `NVIDIA_NIM_MODEL` defaulted to `minimax-3.0`
  (not a real NIM id) and prose used an 8B model that ignores long instructions;
  OpenRouter defaults were also fake ids. Fixed to `meta/llama-3.1-70b-instruct`
  / `meta-llama/llama-3.1-70b-instruct:free` (`src/lib/llm/fallback.ts`).
  Override with `NVIDIA_NIM_MODEL` / `OPENROUTER_MODEL` env vars.

## Files changed
- `src/app/api/queue/pump/route.ts` (new)
- `src/lib/workers/queue.ts` (atomic claims, pump kick, processOneQueuedJob)
- `src/lib/utils/storage.ts` (serverless → /tmp, no public/ writes)
- `src/lib/services/bookGenerator.ts` (real chapter recaps + introduced cast)
- `src/lib/llm/prompts.ts` (introduced-cast block, full outline, strict brief)
- `src/lib/llm/fallback.ts` (valid, capable model defaults)
- `src/lib/workers/writeChapterWorker.ts` (enqueue-only, no auto-chain in-process)
- `vercel.json` (daily cron backstop)

## Deploy checklist
1. Push to `main` (Vercel deploys).
2. Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SUPABASE_STORAGE_BUCKET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`.
3. Create/verify the public Supabase bucket.
4. (Pro) tighten cron to every minute; (Hobby) optional external scheduler.
5. Start a new book and confirm chapters walk to completion across approvals.
