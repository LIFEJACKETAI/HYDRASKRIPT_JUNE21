# 📚 HydraSkript: AI Co-Authoring Studio

HydraSkript is a professional-grade, full-stack AI platform that transforms a simple idea into a fully produced book. Unlike traditional AI generators, HydraSkript implements a **Co-Authoring Workflow**, allowing authors to steer the narrative, approve blueprints, and ensure visual consistency across every page.

---

## 🌟 The Studio Experience

HydraSkript moves beyond the "black box" of AI generation. It implements a **Director's Chair** philosophy:

- **The Story Blueprint**: Instead of jumping straight to writing, HydraSkript generates a detailed outline. The author can edit plot points, adjust chapter targets, and refine the narrative arc before a single word is written.
- **Iterative Steering**: The AI writes one chapter at a time. The author reviews the draft, provides feedback, and approves the chapter before the AI proceeds.
- **Continuity Engine**:HYDRASKRIPT_JUNE21 Every approved chapter is fed back into the AI's memory, ensuring that plot twists and character developments are remembered throughout the book.
- **Visual Identity**: Specialized pipelines for children's and coloring books ensure that characters remain visually consistent from the first page to the last.

---

## 🛠 Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript 5.3+
- **Database**: Supabase (PostgreSQL 15 + `pgvector` for style embeddings)
- **Queue/Persistence**: Custom Postgres-backed Persistent Queue (Replacing volatile Redis)
- **AI Orchestration**: OpenRouter (GLM 5.2), Google AI Studio (Gemini TTS), HF/Replicate/FAL (Tiered Images)
- **Media Processing**: FFmpeg (Audiobook assembly)
- **Storage**: Cloudflare R2 (S3 Compatible)

---

## 🚀 Deployment Guide

### 1. Infrastructure Setup

#### A. Supabase (Database & Auth)
1. Create a new Supabase project.
2. Run the following SQL in the Supabase SQL Editor to enable the vector extension:
   ```sql
   create extension if not exists vector;
   ```
3. Apply the schema provided in `prisma/schema.prisma` using `npm run db:push`.

#### B. Cloudflare R2 (Storage)
1. Create an R2 bucket named `hydraskript`.
2. Generate an R2 API Token with **Edit** permissions.
3. Configure a **Public Bucket Domain** (e.g., `cdn.yourdomain.com`).

#### C. Server Environment
If deploying to a VPS or Docker, **FFmpeg must be installed** on the host machine for audiobook functionality:
```bash
sudo apt update && sudo apt install -y ffmpeg
```

### 2. Environment Configuration

Create a `.env.local` file in the root directory:

| Variable | Description | Source |
| :--- | :--- | :--- |
| `DATABASE_URL` | Connection string for Postgres | Supabase Settings |
| `NEXT_PUBLIC_SUPABASE_URL` | Your project URL | Supabase Settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your public anon key | Supabase Settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key for admin bypass | Supabase Settings |
| `OPENROUTER_API_KEY` | Key for LLM access | OpenRouter |
| `GOOGLE_AI_API_KEY` | Key for Gemini TTS & Embeddings | Google AI Studio |
| `HF_API_KEY` | Primary image generation key | Hugging Face |
| `REPLICATE_API_TOKEN` | Fallback image generation key | Replicate |
| `FAL_API_KEY` | Fallback 2 (optional) | FAL.ai |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 Access Key | Cloudflare Dashboard |
| `R2_SECRET_FONT_KEY` | Cloudflare R2 Secret Key | Cloudflare Dashboard |
| `R2_BUCKET_NAME` | Name of your R2 bucket | Cloudflare Dashboard |
| `R2_ENDPOINT` | Your R2 account endpoint | Cloudflare Dashboard |
| `R2_PUBLIC_DOMAIN` | Your public CDN URL | Cloudflare Dashboard |
| `STRIPE_SECRET_KEY` | Stripe API secret | Stripe Dashboard |

### 3. Launch Sequence

```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma Client
npm run db:generate

# 3. Push database schema
npm run db:push

# 4. Start development server
npm run dev
```

---

## ⚙️ System Architecture

### The State-Driven Pipeline
HydraSkript utilizes a persistent state machine to manage the creative process:

1. **Draft** $\rightarrow$ User defines idea and style.
2. **Outlining** $\rightarrow$ AI generates the "Story Blueprint."
3. **Awaiting Outline Approval** $\rightarrow$ User edits and approves the blueprint.
4. **Writing** $\rightarrow$ AI writes chapters iteratively.
5. **Awaiting Chapter Approval** $\rightarrow$ User reviews and steers each chapter.
6. **Finalizing** $\rightarrow$ System generates cover art and assembles the final PDF/Audiobook.
7. **Completed** $\rightarrow$ Artifacts are delivered to the user.

### The Persistent Queue
Unlike traditional in-memory queues, HydraSkript uses a **Postgres-backed Queue**. Jobs are claimed atomically using database transactions, ensuring that no work is lost during server restarts and that scaling to multiple workers is seamless.

---

## 📄 License
Proprietary - Developed for HydraSkript.
# HYDRASKRIPT_190626
