# 📚 HydraSkript

**AI-powered book generation platform.** Write full-length books with chapters, illustrations, and narrated audiobooks — all from a single prompt.

Built with **Next.js 15**, **TypeScript**, **Tailwind CSS**, **Prisma**, and **OpenRouter**.

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- [Bun](https://bun.sh) (Recommended) or Node.js 20+
- A basic understanding of TypeScript

### Installation
```bash
# 1. Clone the repository
git clone https://github.com/C-Jay69/HYDRASKRIPT_220526.git
cd HYDRASKRIPT_220526

# 2. Install dependencies
bun install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local and add your API keys (see Environment Variables section)

# 4. Initialize the database (SQLite by default)
bunx prisma db push

# 5. Start the development server
bun dev
```
Open [http://localhost:3000](http://localhost:3000) to start generating.

---

## 🌐 Production Deployment

### 1. Database Setup (Supabase/PostgreSQL)
For production, do not use SQLite. Use a managed PostgreSQL instance (e.g., Supabase).
1. Create a Supabase project.
2. Copy the **Transaction Connection String**.
3. Update `DATABASE_URL` in your production environment variables.
4. Run `bunx prisma db push` against the production DB.

### 2. File Storage (Cloudflare R2 / AWS S3)
By default, images and audio are stored locally. For production:
1. Set up a Cloudflare R2 bucket.
2. Configure the `R2_*` variables in your `.env`.
3. This ensures your generated books are persistent and accessible via CDN.

### 3. Deployment Platforms
- **Vercel (Recommended):** Connect your GitHub repo, add the environment variables, and deploy.
- **VPS (Docker/Bun):** 
  ```bash
  bun run build
  bun start
  ```

---

## 🔑 Environment Variables

Create a `.env.local` file in the root directory.

| Variable | Required | Description |
| :--- | :---: | :--- |
| `DATABASE_URL` | ✅ | SQLite (dev) or PostgreSQL connection string |
| `OPENROUTER_API_KEY` | ✅ | LLM text generation — [openrouter.ai/keys](https://openrouter.ai/keys) |
| `GOOGLE_AI_API_KEY` | ⚠️ | Audiobook TTS via Gemini — [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| `STRIPE_SECRET_KEY` | ⚠️ | Credit purchases — [dashboard.stripe.com](https://dashboard.stripe.com/apikeys) |
| `STRIPE_PUBLISHABLE_KEY` | ⚠️ | Stripe frontend key |
| `STRIPE_WEBHOOK_SECRET` | ⚠️ | Stripe webhook signature verification |
| `NEXTAUTH_SECRET` | ⚠️ | Auth security — run `openssl rand -base64 32` |
| `NEXTAUTH_URL` | ⚠️ | Your app's public URL (e.g. `https://yourdomain.com`) |
| `R2_ACCOUNT_ID` | ⚠️ | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | ⚠️ | Cloudflare R2 access key |
| `R2_SECRET_ACCESS_KEY` | ⚠️ | Cloudflare R2 secret key |
| `R2_BUCKET_NAME` | ⚠️ | R2 bucket name for image/audio storage |
| `R2_PUBLIC_URL` | ⚠️ | Public CDN URL for your R2 bucket |
| `NEXT_PUBLIC_APP_URL` | ⚠️ | App base URL for absolute links |

---

## 🛠️ Feature Matrix

| Feature | Status | Tech Used |
| :--- | :---: | :--- |
| **E-Book Generator** | ✅ | OpenRouter $\rightarrow$ Prisma |
| **Kids Book Generator** | ✅ | OpenRouter $\rightarrow$ ZAI Images |
| **Coloring Book Gen** | ✅ | Strict Line-Art Prompting |
| **Audiobook Gen** | ✅ | Google Gemini TTS |
| **Credit System** | ✅ | Simulated/Stripe |
| **Style Analysis** | ✅ | Custom LLM Analyzer |

---

## 🛡️ Admin Access
To grant admin rights to a specific user:
```sql
UPDATE profiles SET "isAdmin" = true WHERE email = 'your@email.com';
```
