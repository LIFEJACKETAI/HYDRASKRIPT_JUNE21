# HydraSkript — AI Co-Authoring Studio

HydraSkript is a professional-grade, full-stack AI platform that transforms a simple idea into a fully produced book. It implements a **Co-Authoring Workflow** — authors steer the narrative, approve blueprints, and ensure visual consistency across every page.

---

## The Studio Experience

- **Story Blueprint** — AI generates a detailed outline first. Author edits plot points, chapter targets, and arc before a single word is written.
- **Iterative Steering** — AI writes one chapter at a time. Author reviews, provides feedback, and approves before proceeding.
- **Continuity Engine** — Every approved chapter feeds back into AI memory, so plot and character remain consistent throughout.
- **Visual Identity** — Specialized pipelines for children's and coloring books keep characters visually consistent page to page.
- **Export Hub** — One-click export to PDF, EPUB, and DOCX. All generated from scratch, no third-party export services required.
- **UI Gallery** — 60 stitch HTML UI templates browsable in-app with category filters and fullscreen preview.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Database | Supabase (PostgreSQL via Prisma) |
| Auth | Supabase Auth + `@supabase/ssr` (session cookies, edge middleware) |
| Queue | Custom Postgres-backed Persistent Queue (atomic DB transactions, crash recovery) |
| AI / LLM | OpenRouter (GLM 5.2 / configurable) |
| Images | Hugging Face → Replicate → FAL.ai (tiered fallback) |
| Audio | Google AI Studio (Gemini TTS) + FFmpeg |
| Storage | Local filesystem (`/public/assets`) — swap for R2/S3 in production |
| Payments | Stripe (credits system) |

---

## Security

- **Edge Middleware** (`src/middleware.ts`) validates the Supabase session on every request
- All `/api/*` routes return `401 JSON` immediately if no valid session cookie exists
- Protected pages redirect to `/login?next=...`
- Session cookies are refreshed automatically on every request (required by `@supabase/ssr`)
- No demo email fallbacks — every route requires a verified Supabase user

---

## Environment Variables

Create `.env.local` in the project root:

```env
# Supabase
DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

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

> **Note:** Storage defaults to local filesystem. To use Cloudflare R2 in production, add `R2_ACCESS_KEY_ID`, `R2_SECRET_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`, and `R2_PUBLIC_DOMAIN`, then update `src/lib/utils/storage.ts`.

---

## Local Development

```bash
# 1. Clone
git clone https://github.com/LIFEJACKETAI/HYDRASKRIPT_JUNE21.git
cd HYDRASKRIPT_JUNE21

# 2. Install dependencies
npm install

# 3. Generate Prisma client
npm run db:generate

# 4. Push schema to your Supabase DB
npm run db:push

# 5. Start dev server
npm run dev
```

App runs at `http://localhost:3000`.

---

## Deployment — Railway (Recommended)

Railway is the recommended host. The repo includes a `Dockerfile` for containerised deployment.

### Steps

1. **Create a Railway project** — connect your GitHub repo (`LIFEJACKETAI/HYDRASKRIPT_JUNE21`)
2. **Add environment variables** — paste all variables from `.env.local` into Railway's environment panel
3. **Add a Postgres database** (optional — or point `DATABASE_URL` at your Supabase instance)
4. **Deploy** — Railway auto-detects the `Dockerfile` and builds

> FFmpeg is included in the Docker image. No manual install needed.

### Docker (manual)

```bash
docker build -t hydraskript .
docker run -p 3000:3000 --env-file .env.local hydraskript
```

---

## Deployment — Vercel

Vercel works with some caveats:

- The **Persistent Queue** runs in-process. On Vercel's serverless functions, long-running jobs may hit the 60s timeout. Use Railway or a VPS for production workloads with heavy generation.
- Set all environment variables in the Vercel dashboard.
- The `Dockerfile` is ignored — Vercel uses its own Next.js build.

```bash
vercel --prod
```

---

## Database Schema

Schema lives in `prisma/schema.prisma`. Key models:

| Model | Purpose |
| :--- | :--- |
| `Profile` | User account, credits balance, admin flag |
| `Book` | Book metadata, status, outline, genre, audience |
| `Chapter` | Individual chapters with content, illustrations, audio |
| `Job` | Queue entries — tracks generation jobs with status/progress |
| `StyleProfile` | Custom AI writing style training data |
| `MediaAsset` | References to all generated files (PDFs, EPUBs, DOCXs, images, audio) |

Apply schema changes:

```bash
npm run db:push        # push schema to DB (no migration file)
npm run db:generate    # regenerate Prisma client after schema changes
```

---

## Book Generation Pipeline

```
Draft → Outlining → Awaiting Outline Approval → Writing → Awaiting Chapter Approval → Finalizing → Completed
```

1. User creates a book (title, genre, audience, character names, style profile)
2. AI generates a story outline — user edits and approves
3. AI writes each chapter iteratively — user steers and approves per chapter
4. On completion: cover art generated, book exported to PDF/EPUB/DOCX
5. Audiobook pipeline (optional): Gemini TTS narrates each chapter, FFmpeg assembles the final MP3

---

## Export Formats

All exports are generated server-side with zero external export dependencies:

| Format | Implementation | Location |
| :--- | :--- | :--- |
| PDF | PDFKit | `src/lib/services/exportService.ts` |
| EPUB | Custom EPUB 3.0 ZIP builder (pure Node `zlib`) | `src/lib/services/epubService.ts` |
| DOCX | Custom Office Open XML ZIP builder (pure Node `zlib`) | `src/lib/services/docxService.ts` |

Exports are saved to `/public/assets/exports/` and returned as download URLs.

---

## Admin Access

Navigate to the app and sign in with an account that has `isAdmin: true` in the `Profile` table. The Admin panel is visible in the sidebar only for admin users. To grant admin:

```sql
UPDATE "Profile" SET "isAdmin" = true WHERE email = 'your@email.com';
```

---

## UI Gallery

60 stitch HTML UI templates are served as static files from `/public/stitch/`. Access them in-app via **UI Gallery** in the sidebar. Templates are categorised (AI Tools, Audio, Dashboard, Editor, Export, Landing, Marketing, Components) with search and fullscreen preview.

---

## Known Limitations

- Storage is local filesystem by default — files are lost on container restarts unless a persistent volume is mounted at `/public/assets`
- The Persistent Queue is in-process — not suitable for multi-instance horizontal scaling without switching to a proper queue (Redis/BullMQ)
- Audiobook generation requires FFmpeg available in the deployment environment (included in the provided `Dockerfile`)

---

## License

Proprietary — developed for HydraSkript / LIFEJACKETAI.
