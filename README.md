# HydraSkript — AI Co-Authoring Studio

HydraSkript is a full-stack AI publishing platform that helps authors turn an idea into a finished book with structured outlining, chapter-by-chapter approval, illustrations, export tooling, and audiobook generation.

This README has been updated to reflect the **current validated project state**.

---

## Current Status

The app currently validates with:

- `npx tsc --noEmit --incremental false` ✅
- `npx eslint src --ext .ts,.tsx` ✅
- `npm run build` ✅

### Important build note

`output: 'standalone'` was removed from `next.config.js` because the current Next 16 middleware build path was failing with a missing `middleware.js.nft.json` artifact during production builds.

HydraSkript now uses the stable production flow:

- `next build`
- `next start -p 3000`

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Database | Supabase PostgreSQL via Prisma |
| Auth | Supabase Auth + `@supabase/ssr` |
| Queue | Custom Supabase/Postgres-backed persistent queue |
| AI / LLM | OpenRouter |
| Images | Hugging Face / Replicate / FAL fallback design |
| Audio | Google AI Studio (Gemini TTS) + FFmpeg |
| Storage | Supabase Storage when configured, local fallback for development |
| Payments | Stripe (partially staged / verify before production) |

---

## Core Product Flow

HydraSkript is structured around a co-authoring workflow:

1. User creates a book
2. AI generates an outline
3. User edits / approves outline
4. AI writes one chapter at a time
5. User reviews / approves chapters
6. App finalizes exports and optional media

### Generation pipeline

```text
Draft → Outlining → Awaiting Outline Approval → Writing → Awaiting Chapter Approval → Finalizing → Completed
```

---

## Security Model

Current security posture includes:

- Root `middleware.ts` for protected session-aware routing
- Protected API routes return `401` JSON when unauthenticated
- Protected pages redirect through auth flow when needed
- Server-side auth helpers now back major protected routes
- Session refresh uses Supabase SSR patterns

### Important note

This is significantly improved from the original repo state, but you should still test:

- login flow
- session refresh
- protected API access
- admin-only paths

against your real Supabase project before public launch.

---

## Environment Variables

Create `.env.local` in the project root.

```env
# Database / Supabase
DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_STORAGE_BUCKET=hydraskript-assets

# AI
OPENROUTER_API_KEY=sk-or-...
GOOGLE_AI_API_KEY=AIza...
HF_API_KEY=hf_...
REPLICATE_API_TOKEN=r8_...
FAL_API_KEY=...

# Payments
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### Notes

- `DATABASE_URL` is required for Prisma.
- Supabase auth requires:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Some AI/media flows degrade or simulate behavior if keys are absent.
- Stripe should be considered **not production-complete until webhook and billing flows are verified end-to-end**.

### Storage note

The app now prefers **Supabase Storage** for generated assets when these are configured:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`

If they are not configured, it falls back to local filesystem storage under:

- `public/assets`

For production, create a public Supabase Storage bucket matching `SUPABASE_STORAGE_BUCKET`.
Local fallback remains useful for development, but should not be your primary production storage strategy.

---

## Local Development Setup

```bash
# 1. Clone
cd HYDRASKRIPT_JUNE21

# 2. Install dependencies
npm install

# 3. Generate Prisma client
npm run db:generate

# 4. Push schema to your DB
npm run db:push

# 5. Start development server
npm run dev
```

App runs at:

- `http://localhost:3000`

---

## Queue Activation

HydraSkript uses a **custom Supabase/Postgres-backed queue**, not BullMQ.

The current codebase already includes a hardened compatibility queue with:

- lazy bootstrap
- interrupted-job recovery
- basic retry handling in app logic
- no import-time DB side effects

### New staged queue fields

The `Job` model now includes:

- `retryCount`
- `maxRetries`
- `leaseExpiresAt`
- `lastHeartbeatAt`

### Activate those fields in your environment

Run:

```bash
npm run db:generate
npm run db:push
```

This updates:

- the Prisma client
- the target database schema

### After activation

The queue can be upgraded from compatibility mode to full field-backed lease/retry semantics.

See:

- `QUEUE_ACTIVATION_NOTES.md`

---

## Production Deployment Guide

## Recommended Host: Railway or VPS

This app is currently best suited to:

- Railway
- a single VPS
- a single container deployment with persistent storage

### Why not Vercel as primary?

Because the queue currently runs in-process and long-running media/generation workloads are not a great fit for serverless execution limits.

---

## Deployment Checklist

Before deploying, confirm all of the following:

- `npm install` completed successfully
- `npx tsc --noEmit --incremental false` passes
- `npx eslint src --ext .ts,.tsx` passes
- `npm run build` passes
- `.env.local` values are mirrored into the deployment platform
- Supabase project is configured correctly
- Prisma schema is synced:
  - `npm run db:generate`
  - `npm run db:push`
- FFmpeg is available in the deployment runtime
- Supabase Storage bucket exists and matches `SUPABASE_STORAGE_BUCKET` (or an intentional persistent-volume fallback is in place)

---

## Deploying with Docker

### Build image

```bash
docker build -t hydraskript .
```

### Run container

```bash
docker run -p 3000:3000 --env-file .env.local hydraskript
```

### Current Docker behavior

The Dockerfile:

- installs FFmpeg
- installs dependencies
- generates Prisma client
- runs `npm run build`
- starts with `npm start`

---

## Deploying with Railway

### Suggested process

1. Create a Railway project
2. Connect this repository
3. Add all required environment variables
4. Point `DATABASE_URL` to your Supabase database or Railway Postgres
5. Ensure schema/client sync has been run
6. Deploy

### Recommended extra checks after deploy

- open `/api/health`
- sign in through Supabase auth
- create a draft book
- hit one protected API route while logged in
- test one generation flow
- verify files appear where expected

---

## Docker Compose

A compose file is included.

### Start with compose

```bash
docker compose up --build
```

### Current compose behavior

- binds to `3000:3000`
- loads `.env`
- includes health check:
  - `http://localhost:3000/api/health`

---

## Vercel Caveats

You can deploy to Vercel, but it is **not the recommended primary production target** for the current architecture.

### Caveats

- custom queue is in-process
- long-running generation jobs may exceed function limits
- heavy generation/media workloads are better on Railway/VPS
- Dockerfile is ignored by Vercel

If you still use Vercel:

```bash
vercel --prod
```

---

## Database Notes

Schema lives in:

- `prisma/schema.prisma`

Key models:

- `Profile`
- `Book`
- `Chapter`
- `Job`
- `StyleProfile`
- `MediaAsset`
- `CreditLedger`

### Apply schema updates

```bash
npm run db:generate
npm run db:push
```

---

## Export Formats

HydraSkript currently supports:

| Format | Implementation | File |
| :--- | :--- | :--- |
| PDF | PDFKit | `src/lib/services/exportService.ts` |
| EPUB | custom EPUB 3 zip builder | `src/lib/services/epubService.ts` |
| DOCX | custom Office Open XML builder | `src/lib/services/docxService.ts` |

---

## Operational Limitations

These are the main remaining production limitations:

1. **Storage falls back to local filesystem if Supabase Storage is not configured**
   - generated files can still be lost on restart/redeploy if you rely on fallback storage instead of a real bucket

2. **Queue is single-instance oriented**
   - suitable for one-node deployments today
   - multi-instance coordination still needs final lease-backed activation

3. **Stripe/payment path should be verified before launch**
   - treat payments as staging until webhook/accounting flows are validated end-to-end

4. **Supabase / Prisma posture is functional, but not equivalent to full Supabase-native RLS enforcement**

---

## Post-Deploy Smoke Test

After deployment, test this order:

1. `GET /api/health`
2. Homepage loads
3. Login works
4. Protected route returns 401 when logged out
5. Protected route works when logged in
6. Create book works
7. Start generation works
8. Queue job status updates
9. Export works
10. Files persist where expected

---

## Known Build Note

The app intentionally does **not** use `output: 'standalone'` right now because of an upstream Next 16 middleware artifact issue affecting builds.

Current validated production flow is:

```bash
npm run build
npm run start
```

---

## Recommended Next Improvements

If you want to keep pushing toward production-grade readiness, the highest-value next steps are:

1. Run queue schema activation:
   - `npm run db:generate`
   - `npm run db:push`
2. Finish full lease-backed queue mode
3. Move storage to R2/S3
4. Verify Stripe/webhooks
5. Add a small production smoke test checklist to CI / ops docs

---

## License

Proprietary — developed for HydraSkript / LIFEJACKETAI.
