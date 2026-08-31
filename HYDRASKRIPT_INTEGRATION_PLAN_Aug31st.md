# HydraSkript — Marketing & Pricing Integration Plan
**Prepared:** Aug 30, 2026 · **Sources:** `HYDRASCRIPT, MARKETING AND PRICING, AUGUST 30, 2026.pdf` + repo `LIFEJACKETAI/HYDRASKRIPT_JUNE21`

---

## 0. What this plan actually is

The attached PDF is **not** a feature spec — it's a **positioning + messaging + pricing strategy** for the HydraSkript product. "Integrating it with the platform" therefore means turning that strategy into working, revenue-bearing code:

1. **Reposition the marketing site** ("Your Book. All the Way Through." / idea-to-publication journey, two front doors: *I have an idea* / *I already have a manuscript*).
2. **Align the pricing page** to the doc's outcome-led ladder (`$29 / $79 / $149 / $299` + credit packs + Founder) and remove internal contradictions.
3. **Make the tiers real in the product** — features promised on the pricing page must actually be gated/enforced by tier in code (today they mostly aren't).
4. **Wire billing correctly** — Stripe prices, webhooks, annual billing, credit grants.
5. **Audit unit economics** (the PDF itself flags this as a launch blocker).

The good news: **almost every capability the PDF promises already exists in the repo** — Story Bible, Universe Architect, Style Training, Ideas Lab, Editorial Review, Audiobook, Export (PDF/EPUB/DOCX), Bookstore, and a Founder offer. The work is primarily **messaging, page structure, pricing reconciliation, and entitlement enforcement** — not building features from scratch.

---

## 1. Reconciliation — Stripe (source of truth) vs. code vs. PDF

> **RESOLVED with live Stripe data (Aug 30, 2026).** Stripe products/prices are authoritative:
> STARTER $29 / AUTHOR $79 / PUBLISHER $149 / STUDIO $299 (all *per month*);
> PACK 100 $15 / PACK 500 $60 / PACK 1000 $100 (one-time); EARLY BIRD FOUNDER $399 (first 100) / FOUNDERS $499.
> Because the Stripe **product names embed the credit counts** ("PACK 100/500/1000"), the real grants are **100 / 500 / 1,000 credits**. The marketing advisor's "500 / 2,000 / 5,000 credits" figures in the PDF were a **misread of the screenshot** — do **not** implement them. The code's `PRICING_CONFIG` and pricing-page UI already match Stripe; the contradictions were confined to two unused legacy tables, which Phase 0 removed.

There were historically **three definitions of the same pricing** in code; they are now being collapsed to **one source of truth** (`PRICING_CONFIG`), which is what Stripe fulfillment actually reads.

### 1a. Subscription tiers

| Tier | PDF / pricing-page screenshot | `CreditsView()` UI (`src/app/page.tsx`, ~L465) | `PRICING_CONFIG` (`src/types/index.ts`, ~L379) | `TIER_CONFIG` (`src/types/index.ts`, ~L355) |
|---|---|---|---|---|
| Free | $0, "genuinely experience the product" | (signup says **100** free credits; `TIER_CONFIG.free` = **25**) | — | **25** credits |
| Starter | **$29** | $29 · **300** cr · "3 active books, Standard AI, PDF only" | $29 · **300** cr | $29 · **200** cr |
| Author ⭐ | **$79**, Most Popular | $79 · **1,000** cr · EPUB/DOCX, Style profiles | $79 · **1,000** cr | $79 · **700** cr |
| Publisher | **$149** | $149 · **3,000** cr · Audiobook, API access | $149 · **3,000** cr | $149 · **1,500** cr |
| Studio | **$299** | $299 · **10,000** cr · "Unlimited, white-label, SLA" | $299 · **10,000** cr | $299 · **3,500** cr |

**Problems**
- Three competing credit numbers per tier (`TIER_CONFIG` is dead/legacy and contradicts the two that actually drive Stripe grants).
- Free credits: UI promises **100**, DB/config grants **25**.
- `studio` advertises *"Unlimited everything / white-label / SLA / custom fine-tuning"* — **none of these exist in code** and 10,000 credits is very far from "unlimited." Either build/define them or remove them from the card.
- The PDF's feature ladder (Story Bible ✓ on all; Style Training from Author; Series Universe limited at Pro; Audiobook from Author; Publishing tools from Publisher; Team at Studio) does **not** match the bullets shown in the UI.

### 1b. Credit packs — ✅ RESOLVED by Stripe

| Stripe product | Price | Credits (from product name + code) | Per credit |
|---|---|---|---|
| A-LA-CARTE PACK 100 | $15 | **100** | $0.15 |
| A-LA-CARTE PACK 500 | $60 | **500** | $0.12 |
| A-LA-CARTE PACK 1000 | $100 | **1,000** | $0.10 |

Stripe grants `PRICING_CONFIG[key].credits`, so customers receive **100 / 500 / 1,000** — matching the pricing-page UI and the Stripe product names. The PDF's "500 / 2,000 / 5,000" was a misread and is discarded. *(The pricing page itself should make these credit counts and the volume discount clear — that's a Phase 3 copy task.)*

### 1c. What a credit actually costs today (`CREDIT_COSTS`, `src/types/index.ts` ~L59)

| Operation | Credit cost | Notes |
|---|---|---|
| Chapter prose | **5 / 1,000 words** | |
| Outline ("Story Blueprint") | **5** | |
| Image / illustration | **10 each** | |
| Audiobook | **20 base + 2 / minute** | (comment in `credits.ts` says 50 base / 1 per min — stale) |
| PDF export | **5** | |

This table is the input to the **unit-economics audit the PDF demands** (revenue − inference − images − TTS − storage − Stripe fees = margin). It currently lives in code with **no cost-per-credit telemetry**, so margin cannot be measured yet (see Phase 4).

### 1d. Founder offer — already built, needs messaging alignment

`src/config/founderPack.ts` + `src/components/pricing/FounderPackCTA.tsx` + `src/app/api/checkout/founder/route.ts` implement: **500 slots**, Early Bird **$399** (first 100) then **$499**, **500 monthly credits**, Founder badge/number, lifetime access, **audiobook NOT included**. This matches the PDF's "exploit Founder during launch with real, honest scarcity" guidance. Remaining work is purely the PDF's messaging asks: lead with *"Become one of the first HydraSkript Founders — lock benefits before public launch,"* list genuine benefits, and only show "limited places" because it genuinely is (it is — slot counting is implemented).

---

## 2. Capability map — PDF promise ↔ existing code

You do **not** need to build these; they exist and need to be surfaced/marketed.

| PDF pillar / section | Code that already backs it |
|---|---|
| Start from an idea (Ideas Lab: titles, concepts, genres, chapter structures) | `src/components/book/IdeasLab.tsx`, `src/app/api/ideas/route.ts` |
| Bring your manuscript (upload → analyze/structure/review) | `src/app/api/story-bible/import-manuscript/route.ts`, `src/components/book/CreateBookForm.tsx`, `mammoth`/`pdf-parse` |
| Story Intelligence / Story Bible (characters, locations, history, continuity) | `src/components/book/StoryBible.tsx`, `src/app/api/story-bible/*` |
| Build Your Universe / series continuity | `src/components/book/UniverseArchitect.tsx`, `src/app/api/universe/review/*` |
| Write in your own voice / Style Training | `src/components/book/StyleUploader.tsx`, `src/lib/services/styleAnalyzer.ts`, `src/app/api/training/style-profile/route.ts` |
| AI Editorial Review (plot holes, timeline, continuity, structure) | `src/lib/services/editorialReview.ts`, `src/lib/workers/editorialReviewWorker.ts`, `src/app/api/universe/review/*` |
| Turn manuscript into a book — EPUB / PDF / DOCX | `src/lib/services/epubService.ts`, `exportService.ts` (PDFKit), `docxService.ts`, `src/app/api/books/[id]/export/*` |
| Cover concepts / illustrations / package | `src/components/book/AICoverDesigner.tsx`, `src/app/api/cover/generate/route.ts`, `src/lib/services/imageService.ts` |
| Audiobook Studio | `src/components/book/AudiobookGenerator.tsx`, `src/lib/services/audioService.ts`, `generateAudiobookWorker.ts`, `src/app/api/books/[id]/generate-audio/*` |
| Bookstore / "sell your book" ecosystem | `src/app/api/bookstore/listings/route.ts`, `BookstoreView` in `page.tsx` |
| Founder offer | `src/config/founderPack.ts`, `FounderPackCTA.tsx`, `checkout/founder` route |
| Publishing paths (traditional query materials vs. indie) | **Partial** — query/marketing-metadata generation not a distinct feature; closest is Ideas Lab + export |

### Things the PDF implies that are genuinely missing / thin
- **No dedicated marketing routes.** Everything is one state-driven SPA in a **1,381-line `src/app/page.tsx`** (`landing` vs. app `view`s switched in Zustand). The PDF's internal pages (`/features`, `/editorial-review`, `/story-bible`, `/series`, `/audiobooks`, `/publishing`, `/bookstore`, `/pricing`, `/resources`) **do not exist as real routes** — only `/`, `/login`, `/auth/*`, and a static `/stitch` preview.
- **Tier gating is not enforced.** Nothing in code checks "Author tier required for Style Training" or "Publisher required for Audiobook/API." The pricing page makes promises the app does not honor or withhold.
- **No annual billing.** PDF asks for monthly/annual toggle (≈2 months free). Stripe config is monthly subscription only.
- **Stripe webhook is a stub** (`src/app/api/stripe/webhook/route.ts` exists but per `AUDIT_REPORT.md` is not fully wired). Subscriptions/renewals won't grant credits reliably until this is verified.
- **No cost telemetry** for the margin audit.
- Landing copy still leads with the old positioning ("Create, Edit & Publish E-Books & Audiobooks with AI", "Write full books in a prompt", fake stats like "50K+ books / 12K authors") — exactly the "AI writing toy" framing the PDF says to retire.

---

## 3. Target architecture decisions (settle before building)

1. **One pricing source of truth.** Drive both the public pricing page and Stripe grant logic from a single, corrected `PRICING_CONFIG` (in `src/types/index.ts` or a new `src/config/plans.ts`). Delete or regenerate the divergent `TIER_CONFIG` / `CREDIT_PACK_CONFIG` so there is exactly one number per plan.
2. **Marketing pages as real routes, not SPA views.** The logged-out site should be server-rendered marketing pages (better SEO, shareable, matches the PDF's URL plan); the logged-in app stays the current dashboard SPA. The stitch mockups (`hydraskript_stitch_50_50_1/2`, served at `/stitch`) are the visual reference for these pages.
3. **Entitlements enforced server-side.** Add a `tier → capabilities` map and a `requireCapability()` guard used by both API routes and the UI, so the ladder on the pricing page is actually true.
4. **Keep the Founder offer and 4-tier ladder** exactly as the PDF's final recommendation states: `$29 / $79 / $149 / $299`, Author = Most Popular, credit packs as overage, Founder for launch.

---

## 4. Phased implementation

### Phase 0 — Freeze the truth (½ day) · *blocks everything billing-related* — ✅ DONE
- [x] **Business decision:** Stripe is authoritative. Tiers $29/$79/$149/$299; packs 100/500/1,000 cr @ $15/$60/$100; Founder $399/$499. (PDF advisor's 500/2k/5k pack figures were a misread — discarded.)
- [x] Collapsed the legacy tables: **deleted `TIER_CONFIG` and `CREDIT_PACK_CONFIG`** from `src/types/index.ts` and removed their dead import in `src/app/api/credits/route.ts`. `PRICING_CONFIG` is now the single source Stripe fulfillment reads.
- [x] Free-credit promise reconciled: added canonical `FREE_SIGNUP_CREDITS = 100`; `getOrCreateProfile` now seeds **100** credits and tier **`free`** (was incorrectly `tier: 'starter'`, the paid tier); the previously-dead `grantFreeTierCredits` now also uses 100.
- [x] Fixed a real pricing bug: `calculateAudiobookCost()` used hard-coded `10 base + 5/min` while the canonical `CREDIT_COSTS` is **20 base + 2/min** — and that function drives both the quote and the charge. It now reads from `CREDIT_COSTS`, so users are no longer over-quoted on long audiobooks.
- [ ] Remove promises the product can't keep from the Studio card (white-label/SLA/"unlimited"/fine-tuning) until they're real — *carried to Phase 3 (pricing copy).*
- [ ] Note for ops: Stripe shows **no annual prices yet** — create `STRIPE_PRICE_*_ANNUAL` when annual billing ships (Phase 3). Starter uses tax code `txcd_10103000` while others use `txcd_10103100/101`; reconcile tax treatment at Stripe if unintentional.

**Files changed in Phase 0:** `src/types/index.ts`, `src/app/api/credits/route.ts`, `src/lib/utils/bookHelpers.ts`, `src/lib/utils/credits.ts`.
> ⚠️ Run `npm install && npx tsc --noEmit && npm run build` to confirm in your environment (node_modules aren't installed in this workspace).

---

### Phase 1 — Reposition the landing page (2–3 days) · *highest marketing impact*
Rebuild the logged-out homepage to the PDF's 7-section structure, replacing the current generic hero/4-feature/CTA in `LandingPage()` (`src/app/page.tsx` ~L82–293).

- [ ] **Hero:** headline **"Your Book. All the Way Through."** sub: idea-or-manuscript → publication-ready. Tagline under logo. Two CTAs: **[Start Creating Free]** and **[Already Have a Manuscript? Upload It]** (the second routes to the manuscript-upload flow — a key differentiator). Feature strip: `Writing • Story Intelligence • Editorial Review • Formatting • Audiobook • Publishing`.
- [ ] **Section 2 – The Problem:** editing/continuity/formatting/cover/metadata/audiobook/publishing/distribution; "fifteen services, six logins."
- [ ] **Section 3 – The Journey visual:** `IDEA → STORY → WRITE → REVIEW → REFINE → PRODUCE → PUBLISH → SELL`, one short sentence per stage.
- [ ] **Section 4 – Differentiator:** "We're not another AI writing tool. AI generates words. HydraSkript builds a book." 4 cards: Story Intelligence / Build Your Universe / AI Editorial Review / Publishing Workflow.
- [ ] **Section 5 – "Already have a book?"** prominent upload block: *"Your book doesn't have to start here. It just has to finish here."*
- [ ] **Section 6 – Starting from an idea:** concept → Characters → Story → Chapters → Manuscript → Finished Book.
- [ ] **Section 7 – Emotional final CTA:** *"Your story shouldn't spend another year sitting in a folder."*
- [ ] Remove fabricated stats (50K books / 12K authors / 4.9★) unless real; retire "write 150-page books in seconds"-style framing.
- [ ] Keep the dark/gradient aesthetic already in place; reuse `framer-motion`, `Button`, `Card`.

**Files:** extract `LandingPage` into `src/components/marketing/LandingHero.tsx`, `Problem.tsx`, `JourneyPipeline.tsx`, `Differentiators.tsx`, `ManuscriptDoor.tsx`, `FinalCTA.tsx`. Compose on a new `src/app/(marketing)/page.tsx`.

---

### Phase 2 — Internal marketing pages as real routes (3–4 days)
Create the PDF's URL plan as App Router routes, using stitch mockups as design reference and linking to the real features.

- [ ] `src/app/(marketing)/features/page.tsx`
- [ ] `/editorial-review` (map to editorialReview service)
- [ ] `/story-bible` (StoryBible component)
- [ ] `/series` (UniverseArchitect)
- [ ] `/audiobooks` (AudiobookGenerator + audioService)
- [ ] `/publishing` (exports: EPUB/PDF/DOCX, covers, metadata)
- [ ] `/bookstore` (public storefront — link into the existing BookstoreView/API)
- [ ] `/pricing` (see Phase 3)
- [ ] Shared `(marketing)/layout.tsx` with public navbar/footer + the two CTAs.
- [ ] Add the **comparison table** from the PDF ("Traditional AI writing tool vs HydraSkript": persistent Story Bible, series/universe, style training, editorial review, production exports, integrated audio, bookstore) — strong conversion asset.
- [ ] Wire manuscript-upload CTA to the existing `import-manuscript` flow with auth gate.

---

### Phase 3 — Pricing page overhaul + billing correctness (3–5 days)
Reposition pricing per the PDF: **outcome-led headlines, credits as the mechanism underneath**, Author starred, annual toggle, honest Founder framing.

- [ ] Rebuild `CreditsView` pricing into a public `/pricing` page (marketing) and keep a compact "manage plan/billing" view in the app.
- [ ] Each tier: outcome headline first ("Start your publishing journey" / "Your complete author workspace" / "Build and publish at scale" / "Your publishing operation under one roof"), feature bullets matching the **actual entitlement ladder**, and **"Includes X monthly credits · Need more? Buy credits anytime"** as supporting text — not the headline.
- [ ] Add the "**What kind of creator are you?**" selector (first book → Starter; serious author → Author; multiple books → Publisher; publishing business → Studio; "Not sure? Start with Author").
- [ ] **Annual billing toggle** (monthly vs. annual ≈ 2 months free): create annual Stripe Prices (`STRIPE_PRICE_*_ANNUAL`), pass `mode: 'subscription'` with annual price; extend `PRICING_CONFIG` with `annualPrice`/`annualCredits`.
- [ ] Reword Founder to benefit/lock-in framing with honest slot scarcity (`getFounderOfferStatus` already computes remaining slots).
- [ ] **Verify Stripe webhook end-to-end** (`src/app/api/stripe/webhook/route.ts`): checkout completed → `fulfillPaymentBySession`; subscription renewal → `fulfillSubscriptionRenewal` (already written, needs the webhook to actually call it); founder → `fulfillFounderSale`. Test with Stripe CLI (`stripe listen`).
- [ ] Confirm every `STRIPE_PRICE_*` env var in `.env.example` maps to a real Stripe Price in both test and live mode.

**Files:** `src/app/(marketing)/pricing/page.tsx`, `src/components/pricing/*`, `src/types/index.ts` (PRICING_CONFIG), `src/lib/stripe.ts`, `src/app/api/stripe/webhook/route.ts`, `src/app/api/credits/checkout/route.ts`, `.env.example`.

---

### Phase 4 — Entitlements / tier gating (2–3 days)
Make the pricing ladder *true* in the product (this is also what lets you eventually "charge for publishing capacity," per the PDF).

- [ ] Add `src/config/entitlements.ts`: map each tier to caps/booleans (active books, style training, editorial review depth, series/universe, audiobook, export formats, publishing tools, team seats, monthly images/words). Mirror numbers already implied by Founder config (`monthlyLimits` in `founderPack.ts`).
- [ ] Add `requireCapability(profile, capability)` server guard; apply to API routes (style-profile, editorial review, generate-audio, export epub/docx, cover, API access).
- [ ] Enforce hard caps server-side (e.g., children's page limits, max active books, monthly image/word quotas) — `AUDIT_REPORT.md` notes these exist in UI but aren't enforced.
- [ ] Frontend: disable/upsell gated features with a "Requires {tier}" → link to `/pricing`, instead of silently failing.
- [ ] Free tier: give enough credits to genuinely experience the product (PDF's explicit ask), not a "pathetic 3-generation demo."

---

### Phase 5 — Unit economics & cost telemetry (2–3 days) · *PDF launch blocker*
The PDF is emphatic: *don't launch pricing until you know revenue − inference − images − TTS − storage − fees = margin per plan.*

- [ ] Record **actual provider cost per job** on the `Job`/`CreditLedger` (tokens in/out for NVIDIA NIM/OpenRouter, image-generator cost, Gemini TTS minutes). Extend Prisma schema (`estimatedCostCents`, `actualCostCents`) + migration.
- [ ] Build an admin margin view (`AdminView` + `/api/admin`) showing: credits granted vs. consumed per tier, and **$ cost delivered vs. $ charged** per plan/pack.
- [ ] Use it to validate: a `$29` plan can't allow `~$80` of inference/audio. Tune `CREDIT_COSTS` and per-tier allowances to hit a target gross margin **before** launch.
- [ ] Add hard monthly usage ceilings per tier (protection against the "SaaS becomes a charity" scenario) as backstop even within credit limits.

**Files:** `prisma/schema.prisma`, workers (`writeChapterWorker`, `generateImageWorker`, `generateAudiobookWorker`, `editorialReviewWorker`), LLM clients (`src/lib/llm/*`), `src/app/api/admin/route.ts`, AdminView.

---

### Phase 6 — Production hardening (parallel / ongoing)
These come from the repo's own `AUDIT_REPORT.md` / `DEPLOYMENT_GAP_ANALYSIS.md` and gate a real launch of the repositioned product:
- [ ] **Auth security (release blocker):** ensure all protected routes derive identity from the server session, not a client `x-user-email` header; verify root `src/middleware.ts` covers `/api/*`.
- [ ] **Durable storage:** move generated assets off local `public/assets` to **Cloudflare R2/S3** (env vars already stubbed in `.env.example`; `src/lib/utils/storage.ts`). Required so exports/audiobooks survive redeploy.
- [ ] **Queue hardening:** run `npm run db:generate && npm run db:push` to activate lease/retry fields; complete lease-backed recovery (or move to BullMQ + Upstash Redis per audit).
- [ ] Turn **off** `ignoreBuildErrors` in `next.config.js`; enforce `tsc`/`eslint`/`build` in CI.
- [ ] Split the monolithic `page.tsx` (1,381 lines) into the routed components above as you touch each view.
- [ ] Remove committed artifacts from history (`*.log`, `dev.db`, `*.swp`, `cookies.txt`) — note `cookies.txt` in repo root should be checked for secrets.

---

## 5. Suggested sequencing & effort

| Phase | Outcome | Rough effort | Depends on |
|---|---|---|---|
| 0 | Single pricing truth + business numbers locked | ½ day | — |
| 1 | New "journey" landing page | 2–3 days | — |
| 3 (early) | Pricing page + Stripe/webhook/annual verified | 3–5 days | Phase 0 |
| 2 | Internal marketing routes + comparison table | 3–4 days | Phase 1 |
| 4 | Tier entitlements enforced (pricing becomes true) | 2–3 days | Phase 0 |
| 5 | Cost telemetry + margin validation | 2–3 days | Phase 0 |
| 6 | Security/storage/queue/CI hardening | ongoing | — |

A sensible order: **0 → 1 → 3 → 2 → 4 → 5**, with Phase 6 running in parallel. Launch the repositioned site + corrected billing as a **private beta** (the repo's own gap analysis recommends "secure single-instance beta" before scaling).

---

## 6. Decisions log
1. ~~Credit quantities & value~~ — **RESOLVED:** Stripe is authoritative; packs = 100/500/1,000 cr @ $15/$60/$100 (PDF's 500/2k/5k was a misread). Tier grants stay 300/1,000/3,000/10,000 per `PRICING_CONFIG`.
2. **Studio tier (open):** define/build the promised premium features (team seats, priority processing, commercial/white-label, API) or trim the card to what exists in Phase 3.
3. ~~Free tier size~~ — **RESOLVED (interim):** 100 signup credits on tier `free` (matches the public promise). Revisit after Phase 5 cost telemetry.
4. **Annual discount depth (open):** PDF suggests ~2 months free. No annual prices exist in Stripe yet — create them when building Phase 3.
5. **Marketing site vs. app (open):** proposed moving public pages to real SEO-friendly routes, keeping the dashboard SPA for logged-in users — confirm before Phase 2.

### Still worth a quick Stripe check
- Starter is tagged tax code `txcd_10103000` (personal use) vs. `txcd_10103100/101` on everything else — confirm that's intentional.
- Ensure the env vars `STRIPE_PRICE_STARTER/AUTHOR/PUBLISHER/STUDIO`, `STRIPE_PRICE_PACK_100/500/1000`, and `STRIPE_PRICE_FOUNDER_399/499` hold the **recurring** vs **one-time** Price IDs matching these products.

---

### Bottom line
The strategy in the PDF is sound and the product largely already exists to back it — **the gap is not features, it's alignment.** Fix the contradictory pricing numbers first (they're a billing/reputation risk), rebuild the landing page around the "all the way through" journey with the two front doors, make the pricing page outcome-led and the tiers actually enforced, and instrument costs so the $29 plan can't quietly cost you $80. Then harden auth/storage/queue for a single-instance beta launch.
