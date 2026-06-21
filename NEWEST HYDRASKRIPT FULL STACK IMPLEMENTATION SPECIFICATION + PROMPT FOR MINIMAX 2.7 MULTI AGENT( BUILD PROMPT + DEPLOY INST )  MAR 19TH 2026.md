# ***NEWEST HYDRASKRIPT FULL STACK IMPLEMENTATION SPECIFICATION \+ PROMPT***


# **HYDRASKRIPT**

**\*\*\*\*\*\*\*\*\*\*\*IMPORTANT\*\*\*\*\*\*\*\*\*\*\***

**I RUN A BOOTSTRAPPING CHANNEL WHERE I TEACH USER TO CREATE APP / PLATFORS & BUSINESSES FOR NO OR VERY LITTLE MONEY, SO WHEREVER POSSIBLE USE FREE API’S. GENERALLY I USE OPENROUTER, OLLAMA, HUGGINFACE ETC.**

You are  the principal architect and full-stack developer for HydraSkript.   
Your task: Generate a complete, deployable, production-ready codebase for a book generation platform.

ABSOLUTE CONSTRAINTS (These override all other instructions):  
1\. Use ONLY open-source or low-cost APIs: OpenRouter (for GLM 5.2), Google AI Studio (Gemini TTS), Replicate/FAL (image fallbacks), Hugging Face Inference (free tier).  
2\. No placeholders. Every function must be implemented. Every env var must be used.  
3\. Credits are atomic: Deduct ONLY inside a database transaction that commits ONLY after final artifact upload succeeds. If any step fails, ROLLBACK credits, refund user.  
4\. No silent failures. Every catch block must log to ErrorTracking (console.error) AND update Job status to 'failed' AND trigger refund.  
5\. Deterministic idempotency: Every BullMQ job must check "Has this step already completed?" via unique constraint on (jobId, stepIndex) before executing.

TECHNOLOGY STACK (Non-negotiable):  
\- Next.js 15 App Router (Route Handlers, not Pages Router)  
\- TypeScript 5.3+ (strict mode)  
\- Tailwind CSS (exact palette specified below)  
\- Supabase (PostgreSQL 15, pgvector extension, Row Level Security enabled)  
\- BullMQ (Redis) for job queues  
\- Zustand (client state)  
\- Zod (runtime validation)  
\- OpenRouter SDK (for GLM-4/5 access)  
\- FFmpeg-static (bundled binary)  
\- Replicate \+ @huggingface/inference (tiered images)

DATABASE SCHEMA (Generate migration SQL):  
\-- Enable extensions  
create extension if not exists vector;

\-- Users/Auth handled by Supabase Auth, but we track credits here  
create table profiles (  
  id uuid references auth.users primary key,  
  credits integer not null default 0,  
  tier text not null check (tier in ('starter', 'author', 'publisher', 'studio')),  
  created\_at timestamptz default now(),  
  updated\_at timestamptz default now()  
);

\-- Style profiles (RAG-based, not fine-tuning)  
create table style\_profiles (  
  id uuid default gen\_random\_uuid() primary key,  
  owner\_id uuid references profiles(id) not null,  
  name text not null,  
  exemplar\_texts text\[\] not null, \-- Raw uploaded samples  
  embedding vector(768), \-- Average embedding of samples (Gemini/Gecko)  
  system\_prompt text not null, \-- Generated "Write like this" instruction  
  created\_at timestamptz default now()  
);

\-- Books (universal container)  
create table books (  
  id uuid default gen\_random\_uuid() primary key,  
  owner\_id uuid references profiles(id) not null,  
  title text not null,  
  genre text not null,  
  target\_audience text not null check (target\_audience in ('adult', '0-5', '6-9', '10-14')),  
  max\_pages integer generated always as (  
    case target\_audience  
      when '0-5' then 8  
      when '6-9' then 15  
      when '10-14' then 25  
      else 600  
    end  
  ) stored,  
  style\_profile\_id uuid references style\_profiles(id),  
  status text not null default 'draft' check (status in ('draft', 'generating', 'completed', 'failed')),  
  total\_credits\_estimated integer not null,  
  total\_credits\_charged integer default 0,  
  created\_at timestamptz default now()  
);

\-- Chapters (atomic units of generation)  
create table chapters (  
  id uuid default gen\_random\_uuid() primary key,  
  book\_id uuid references books(id) on delete cascade not null,  
  index integer not null, \-- 0-based  
  title text not null,  
  content text not null default '',  
  word\_count integer generated always as (array\_length(regexp\_split\_to\_array(content, '\\s+'), 1)) stored,  
  status text not null default 'pending' check (status in ('pending', 'writing', 'reviewing', 'completed', 'failed')),  
  \-- Idempotency: prevents double-generation if worker retries  
  generation\_job\_id text,  
  unique(book\_id, index)  
);

\-- Media assets (images, audio, PDFs)  
create table media\_assets (  
  id uuid default gen\_random\_uuid() primary key,  
  owner\_id uuid references profiles(id) not null,  
  book\_id uuid references books(id) on delete cascade,  
  asset\_type text not null check (asset\_type in ('cover', 'illustration', 'coloring\_page', 'audiobook\_chapter', 'audiobook\_complete', 'pdf\_export')),  
  storage\_path text not null, \-- R2 key  
  public\_url text not null,  
  metadata jsonb default '{}', \-- {duration, dimensions, chapter\_index, etc}  
  created\_at timestamptz default now()  
);

\-- Jobs (BullMQ tracking \+ business logic)  
create table jobs (  
  id uuid default gen\_random\_uuid() primary key,  
  book\_id uuid references books(id),  
  owner\_id uuid references profiles(id) not null,  
  job\_type text not null check (job\_type in ('write\_chapter', 'generate\_image', 'generate\_audiobook', 'export\_pdf')),  
  status text not null default 'queued' check (status in ('queued', 'active', 'completed', 'failed')),  
  progress\_message text not null default 'Queued...',  
  progress\_percent integer not null default 0 check (progress\_percent between 0 and 100),  
  credits\_reserved integer not null, \-- Held in escrow  
  credits\_consumed integer default 0,  
  error\_message text,  
  started\_at timestamptz,  
  completed\_at timestamptz,  
  created\_at timestamptz default now()  
);

\-- Credit ledger (immutable, append-only)  
create table credit\_ledger (  
  id uuid default gen\_random\_uuid() primary key,  
  profile\_id uuid references profiles(id) not null,  
  amount integer not null, \-- negative for spend, positive for purchase/refund  
  reason text not null,  
  job\_id uuid references jobs(id),  
  created\_at timestamptz default now()  
);

\-- RLS Policies (Critical)  
alter table profiles enable row level security;  
create policy "Users can only see own profile" on profiles for all using (auth.uid() \= id);

alter table books enable row level security;  
create policy "Users can only see own books" on books for all using (auth.uid() \= owner\_id);

alter table chapters enable row level security;  
create policy "Users can only see chapters of own books" on chapters for all using (  
  exists (select 1 from books where books.id \= chapters.book\_id and books.owner\_id \= auth.uid())  
);

\-- Function: Atomic credit consumption (succeeds only if sufficient credits)  
create or replace function consume\_credits(  
  p\_profile\_id uuid,  
  p\_amount integer,  
  p\_job\_id uuid,  
  p\_reason text  
) returns boolean as $$  
declare  
  current\_credits integer;  
begin  
  \-- Lock the row  
  select credits into current\_credits from profiles where id \= p\_profile\_id for update;  
    
  if current\_credits \< p\_amount then  
    return false; \-- Insufficient funds  
  end if;  
    
  \-- Deduct  
  update profiles set credits \= credits \- p\_amount where id \= p\_profile\_id;  
    
  \-- Record  
  insert into credit\_ledger (profile\_id, amount, job\_id, reason)   
  values (p\_profile\_id, \-p\_amount, p\_job\_id, p\_reason);  
    
  return true;  
end;  
$$ language plpgsql;

\-- Function: Refund credits (idempotent)  
create or replace function refund\_credits(  
  p\_job\_id uuid,  
  p\_reason text  
) returns void as $$  
declare  
  v\_profile\_id uuid;  
  v\_amount integer;  
begin  
  \-- Check if already refunded  
  if exists (select 1 from credit\_ledger where job\_id \= p\_job\_id and amount \> 0\) then  
    return; \-- Already refunded  
  end if;  
    
  select owner\_id, credits\_reserved into v\_profile\_id, v\_amount   
  from jobs where id \= p\_job\_id;  
    
  if v\_profile\_id is not null then  
    update profiles set credits \= credits \+ v\_amount where id \= v\_profile\_id;  
    insert into credit\_ledger (profile\_id, amount, job\_id, reason)   
    values (v\_profile\_id, v\_amount, p\_job\_id, p\_reason);  
  end if;  
end;  
$$ language plpgsql;

DIRECTORY STRUCTURE:  
src/  
├── app/                          \# Next.js 15 App Router  
│   ├── api/  
│   │   ├── auth/                 \# Supabase auth callbacks  
│   │   ├── books/  
│   │   │   ├── route.ts          \# POST create book  
│   │   │   └── \[id\]/  
│   │   │       ├── route.ts      \# GET/PUT book  
│   │   │       ├── generate.ts   \# POST start generation  
│   │   │       └── export/  
│   │   │           └── route.ts  \# PDF/EPUB export  
│   │   ├── jobs/  
│   │   │   └── \[id\]/progress.ts  \# SSE or polling endpoint  
│   │   ├── webhooks/  
│   │   │   └── stripe.ts         \# Payment webhooks  
│   │   └── training/  
│   │       └── style-profile.ts  \# Upload exemplars  
│   ├── dashboard/  
│   │   ├── layout.tsx            \# Auth wrapper  
│   │   ├── page.tsx              \# Book list  
│   │   ├── books/  
│   │   │   ├── new/  
│   │   │   │   └── page.tsx      \# Create book form  
│   │   │   └── \[id\]/  
│   │   │       └── page.tsx      \# Editor/viewer  
│   │   └── training/  
│   │       └── page.tsx          \# Style profile management  
│   ├── layout.tsx                \# Root with providers  
│   └── page.tsx                  \# Marketing landing (from spec)  
├── components/  
│   ├── ui/                       \# Shadcn/ui components (button, card, etc)  
│   ├── book/                     \# Book-specific components  
│   │   ├── ChapterEditor.tsx  
│   │   ├── IllustrationGrid.tsx  
│   │   └── GenerationProgress.tsx  
│   └── layout/                   \# Navbar, Footer (from spec)  
├── lib/  
│   ├── db/  
│   │   ├── prisma.ts             \# Actually use Supabase client  
│   │   └── schema.prisma         \# If using Prisma, otherwise raw SQL  
│   ├── llm/  
│   │   ├── openrouter.ts         \# GLM 5.2 client  
│   │   ├── prompts.ts            \# All system prompts  
│   │   └── schema.ts             \# Zod schemas for GLM outputs  
│   ├── services/  
│   │   ├── bookGenerator.ts      \# Orchestration logic (not LangGraph)  
│   │   ├── styleAnalyzer.ts      \# Extract style from exemplars  
│   │   ├── imageService.ts       \# Tiered HF-\>Replicate-\>FAL  
│   │   ├── audioService.ts       \# Gemini TTS \+ FFmpeg  
│   │   └── exportService.ts      \# PDF/EPUB generation  
│   ├── workers/  
│   │   ├── queue.ts              \# BullMQ setup  
│   │   ├── writeChapterWorker.ts  
│   │   ├── generateImageWorker.ts  
│   │   └── generateAudiobookWorker.ts  
│   └── utils/  
│       ├── credits.ts            \# Credit management helpers  
│       └── storage.ts            \# R2 upload/download  
└── types/  
    └── index.ts                  \# Shared TypeScript interfaces

IMPLEMENTATION DETAILS BY MODULE:

1\. LLM CLIENT (src/lib/llm/openrouter.ts)  
\- Use model: "thudm/glm-4-9b-chat" or "thudm/glm-4" via OpenRouter  
\- Temperature: 0.7 for creative, 0.2 for JSON extraction  
\- Always set response\_format: { type: "json\_object" } when parsing needed  
\- Implement retry with exponential backoff (3 attempts) at HTTP level, not business logic level

2\. STYLE TRAINING (src/lib/services/styleAnalyzer.ts)  
\- Input: Array of text samples (uploaded by user)  
\- Process:  
  a. Use Gemini Embedding API (free/low cost) to embed each sample (768 dims)  
  b. Store average vector in style\_profiles.embedding  
  c. Generate system\_prompt via GLM 5.2: "Analyze these writing samples and output a 200-word instruction for mimicking this voice: \[samples\]"  
\- Usage: Prepend the system\_prompt to every chapter generation call

3\. BOOK GENERATION ORCHESTRATION (Deterministic, not agentic)  
State Machine:  
  INIT \-\> OUTLINE \-\> \[CHAPTER\_1 \-\> CHAPTER\_2 \-\> ... \-\> CHAPTER\_N\] \-\> ASSEMBLE \-\> COMPLETE

Each state transition is a BullMQ job. If any job fails, trigger refund\_credits(jobId).

Outline Generation:  
\- Input: Genre, style\_profile\_id, target\_audience  
\- GLM 5.2 Prompt: "Create JSON outline with title, chapters: \[{title, synopsis, word\_target}\]"  
\- Zod Schema: OutlineSchema \= z.object({ title: z.string(), chapters: z.array(z.object({ title: z.string(), synopsis: z.string(), word\_target: z.number() })) })

Chapter Writing Worker (src/lib/workers/writeChapterWorker.ts):  
\- Input: chapterId, previousChapterSummary (for continuity)  
\- Check: If chapter.content is not empty and generation\_job\_id matches current job, return (idempotent)  
\- GLM 5.2 Prompt Structure:  
  System: \[style\_profile.system\_prompt\] \+ "You are writing chapter \[N\] of \[BookTitle\]. Previous chapter ended with: \[summary\]. Maintain continuity."  
  User: "Write 1500 words. Genre: \[genre\]. Synopsis: \[synopsis\]. Output JSON: {content: string, characters\_introduced: string\[\], summary\_for\_next\_chapter: string}"  
\- On success: Update chapter.content, queue Image Generation job if children's book (auto-illustrate)  
\- Progress: Update jobs table progress\_percent \= (current\_chapter / total\_chapters) \* 100

4\. IMAGE GENERATION (src/lib/services/imageService.ts)  
Tiered fallback with circuit breakers:  
\- Tier 1: Hugging Face Inference API (model: jbilcke-hf/sdxl-modern-pixar)  
  \- If rate limit (429) or timeout: wait 2s, try Tier 2  
\- Tier 2: Replicate (stability-ai/sdxl with same LoRA)  
  \- If fails: Tier 3  
\- Tier 3: FAL.ai (fast-sdxl)  
  \- If fails: Throw error, trigger refund

For Children's Books:  
\- Cover: style='pixar', prompt="Book cover: \[title\]. \[description\]. Modern Pixar style, vibrant, no text"  
\- Chapter Illustrations: Extract key visual moment from chapter.content using GLM 5.2 (1-sentence summary), then generate  
\- Layout: Top half image, bottom half text (handled in PDF export, not generation)

Coloring Books:  
\- style='lineart' (explicit config in STYLE\_CONFIG)  
\- prompt \= "Coloring book page for children, black and white line art, clean outlines, no shading, no color, \[subject\]"

5\. AUDIOBOOK GENERATION (src/lib/workers/generateAudiobookWorker.ts)  
Strict implementation:  
\- Chunking: Split chapter.content by sentences, max 4000 chars per chunk (Gemini TTS limit is \~5k, stay safe)  
\- TTS: Google AI Studio (Gemini) with voice mapping:  
  \- Female: 'en-US-Neural2-C', 'en-US-Neural2-E', 'en-GB-Neural2-A', 'en-AU-Neural2-A', 'en-IN-Neural2-D'  
  \- Male: 'en-US-Neural2-D', 'en-US-Neural2-A', 'en-GB-Neural2-B', 'en-AU-Neural2-B', 'en-IN-Neural2-C'  
\- Pipeline:  
  1\. Chunk text  
  2\. Parallel TTS calls (max 5 concurrent) to Gemini  
  3\. Save MP3 chunks to temp  
  4\. FFmpeg concat demuxer (file list) to single chapter MP3  
  5\. FFmpeg concat with chapter metadata to final M4B  
  6\. Upload to R2 with metadata: {chapters: \[{title, startTime, duration}\]}  
\- Cleanup: Finally block deletes all temp files regardless of success/failure

6\. PDF/EPUB EXPORT (src/lib/services/exportService.ts)  
\- Children's Books: A4 pages, top 50% image (if exists), bottom 50% text. Use PDFKit or Playwright+Paged.js  
\- Adult Books: Standard EPUB3 (zip with XHTML) or PDF  
\- Include generated cover image as first page

7\. CREDIT MANAGEMENT (src/lib/utils/credits.ts)  
Cost Table (credits):  
\- Chapter generation: 5 credits per 1000 words (round up)  
\- Image (Pixar/Lineart): 10 credits each  
\- Audiobook: 50 credits base \+ 1 credit per minute of audio  
\- Export (PDF/EPUB): 2 credits

Transaction Flow:  
1\. User clicks "Generate Book" → Calculate total cost → Call reserve\_credits()  
2\. Create job record with credits\_reserved  
3\. Worker executes  
4\. On completion: consume\_credits() (convert reserved to consumed)  
5\. On failure: refund\_credits() (return reserved)

8\. FRONTEND UI (Tailwind Specification)  
Strict adherence to color palette:  
\- Background: bg-black (\#000000)  
\- Cards: bg-\[\#2a2a2a\]  
\- Primary Gradient: from-purple-500 to-cyan-500 (buttons, headings)  
\- Text: text-white (headings), text-gray-300 (body)  
\- Borders: border-gray-800

Components to build:  
\- \<GenerationProgress jobId={id} /\>: Uses Supabase Realtime to listen to jobs table updates, displays progress\_message and progress\_percent with contextual flavor text ("Arya is sneaking through the castle..." based on genre)  
\- \<CreditDisplay /\>: Shows current credits, warns if low  
\- \<StyleUploader /\>: Drag-drop text files, previews extracted style profile

9\. ADMIN DASHBOARD  
Route: /admin (protected by middleware checking for admin role in profiles)  
Features:  
\- View all jobs with filters (status, type)  
\- Manual refund button (calls refund\_credits)  
\- Analytics: Credits consumed per day, success/failure rates by worker type  
\- User impersonation (for support)

10\. ERROR HANDLING & MONITORING  
Every worker must:  
\- Wrap entire function in try/catch  
\- In catch:   
  \- console.error with full stack  
  \- await refund\_credits(job.id, \`Worker failed: ${err.message}\`)  
  \- await prisma.job.update({ where: {id: job.id}, data: {status: 'failed', error\_message: err.message} })  
  \- throw err; // Let BullMQ mark as failed for retry logic

ENVIRONMENT VARIABLES (.env.local):  
\# Database  
DATABASE\_URL="postgresql://postgres:\[password\]@db.\[project\].supabase.co:5432/postgres"  
NEXT\_PUBLIC\_SUPABASE\_URL="https://\[project\].supabase.co"  
NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY="\[anon\]"  
SUPABASE\_SERVICE\_ROLE\_KEY="\[service\_role\]"

\# LLM  
OPENROUTER\_API\_KEY="sk-or-v1-..." \# For GLM 5.2  
OPENROUTER\_MODEL="thudm/glm-4-9b-chat" \# or thudm/glm-4

\# Audio (Google AI Studio)  
GOOGLE\_AI\_API\_KEY="..." \# Gemini TTS & Embeddings

\# Image Generation  
HF\_API\_KEY="hf\_..." \# Free tier primary  
REPLICATE\_API\_TOKEN="r8\_..." \# Fallback 1  
FAL\_API\_KEY="..." \# Fallback 2 (optional)

\# Storage (Cloudflare R2 \- S3 compatible)  
R2\_ACCESS\_KEY\_ID="..."  
R2\_SECRET\_ACCESS\_KEY="..."  
R2\_BUCKET\_NAME="hydraskript"  
R2\_ENDPOINT="https://\[accountid\].r2.cloudflarestorage.com"  
R2\_PUBLIC\_DOMAIN="https://cdn.yourdomain.com"

\# Queue  
REDIS\_URL="redis://localhost:6379" \# or Upstash/Redis Cloud

\# Payments  
STRIPE\_SECRET\_KEY="sk\_test\_..."  
STRIPE\_WEBHOOK\_SECRET="whsec\_..."  
NEXT\_PUBLIC\_STRIPE\_PUBLISHABLE\_KEY="pk\_test\_..."

GO/NO-GO TESTS (Must pass before deployment):  
1\. \[ \] Create book with 0 credits → Proper error message, no crash  
2\. \[ \] Kill worker mid-chapter (SIGTERM) → Restart worker, resumes from checkpoint without double-charging  
3\. \[ \] Upload 3 style samples → Embedding generates, subsequent chapters use style  
4\. \[ \] Generate children's book (age 6-9) → Exactly 15 pages, 15 illustrations, cover, correct layout  
5\. \[ \] HF API rate limited → Automatic fallback to Replicate, user sees no error (maybe slower)  
6\. \[ \] Generate audiobook for 50-page book → M4B plays in Apple Books with working chapter skip  
7\. \[ \] Cancel job mid-generation → Credits refunded within 5 seconds  
8\. \[ \] Concurrent generation of 3 books by same user → Credit balance accurate (no race conditions)

OUTPUT INSTRUCTIONS:  
Generate the complete codebase following the above. Start with the database migration SQL, then the TypeScript type definitions, then the core services (LLM, Image, Audio), then the workers, then the API routes, then the React components. 

Do not use "TODO" or "FIXME". Every function must be fully implemented with error handling. Use the exact color hex codes provided. Ensure the credit system uses database transactions (or Supabase RPC calls) to prevent race conditions.

Remember: This is for a YouTube audience learning to build. Code must be clean, commented, and educational where logic is complex.

