# HydraSkript Deployment Gap Analysis

## Summary

This report compares the current implementation in `HYDRASKRIPT_JUNE21/` against the product/build instructions in:

- `NEWEST HYDRASKRIPT FULL STACK IMPLEMENTATION SPECIFICATION + PROMPT FOR MINIMAX 2.7 MULTI AGENT( BUILD PROMPT + DEPLOY INST )  MAR 19TH 2026.md`

## Executive verdict

The current codebase is a strong prototype / private beta candidate, but it does **not** fully match the implementation spec yet. The largest gaps are:

1. **Auth and route security consistency**
2. **Queue hardening for production semantics, while preserving the current Supabase/Postgres SQL-backed design**
3. **Spec-required RLS/pgvector/Supabase-first database posture**
4. **Durable object storage instead of local filesystem assets**
5. **Strict production validation discipline**

## Comparison: spec vs current project

| Area | Spec says | Current repo | Status |
|---|---|---|---|
| Next.js App Router | Required | Present | ✅ |
| TypeScript strict mode | Required, production-clean | `ignoreBuildErrors: true` in `next.config.js` | ⚠️ |
| Supabase auth | Required | Present | ✅ |
| Global auth middleware | Required | Helper existed; real root middleware added in this audit pass | ✅/⚠️ |
| RLS enforced | Required | Not verifiable/enforced from app code; Prisma direct DB access bypasses RLS | ❌ |
| pgvector | Required | Not in Prisma schema; embedding stored as string | ❌ |
| BullMQ + Redis | Original spec required it | Custom Postgres/Supabase-style DB queue | ⚠️ intentionally different |
| Atomic credit functions in DB | Required | App-level logic primarily | ⚠️ |
| FFmpeg-backed audiobook flow | Required | Present in concept; current flow is simplified | ⚠️ |
| EPUB export | Required | Implemented | ✅ |
| DOCX export | Not central in spec but useful | Implemented | ✅ |
| Durable storage (R2) | Required | Local filesystem storage | ❌ |
| Admin dashboard | Required | Present | ✅ |
| Health endpoint | Needed for deployability | Added in this audit pass | ✅ |

## Highest-priority gaps

### 1. Security posture
Several protected API routes were trusting a client-provided `x-user-email` header instead of server-derived session state. This is the single most important production issue and should be treated as a release blocker.

### 2. Queue architecture
The original spec calls for BullMQ + Redis, but your current implementation clearly moved to a Supabase/Postgres SQL-backed queue model. That is a valid architectural choice for a lean single-instance deployment and I am treating it as intentional, not as an automatic defect. The real issue is not “lack of BullMQ”; it is that the current queue still needs stronger retry, backoff, crash recovery, leasing, and multi-instance coordination semantics to match production expectations.

### 3. Storage architecture
The current project stores generated assets under `public/assets`. This is acceptable for local testing but weak for production on ephemeral containers.

### 4. Data architecture mismatch
The spec expects Postgres-native constructs such as `vector`, RLS policies, and database-resident credit functions. The current codebase uses Prisma effectively, but the resulting posture is not equivalent to the spec.

## Recommended release phases

### Phase 1 — Secure single-instance beta
- Standardize all protected APIs on server-side session auth
- Keep one deployment target only
- Unify ports and health checks
- Turn off TypeScript build-error suppression
- Verify build and lint in CI

### Phase 2 — Durable production core
- Move storage to R2/S3-compatible object storage
- Add proper payment webhook flow
- Reduce noisy production logging
- Add rate limiting and abuse controls

### Phase 3 — Production queue and data hardening
- Run `npm run db:generate` and `npm run db:push` to activate the staged queue schema fields in the Prisma client and database
- Switch the queue from compatibility-mode retry parsing to native field-backed retry and lease accounting
- Add pgvector where actually needed
- Decide whether to enforce RLS via Supabase-native access patterns
- Move more credit guarantees into DB functions/transactions

## Opinionated product recommendations

If my name were attached to this product, I would prioritize:

1. **Trust and safety first**: secure auth, clear access boundaries, deterministic errors
2. **Monetization clarity**: credits should feel predictable and transparent in UI
3. **Asset durability**: exports and audiobooks must survive redeploys
4. **Faster perceived value**: Ideas Lab and exports are good conversion surfaces — keep improving them
5. **Operational simplicity**: ship a secure single-node beta before chasing distributed complexity
