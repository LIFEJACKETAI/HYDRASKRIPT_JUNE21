# HydraSkript UI Overhaul — Task Log

## STATUS: In Progress

## ✅ COMPLETED
1. `globals.css` — full design system: Space Grotesk, `.btn-gradient`, `.neo-border`, `.gradient-multi`, `.gradient-multi-border`, `.nav-active`, cover gradients, animations
2. `Navbar.tsx` — redesigned: gradient logo badge, credit pill with Zap icon, clean separator, sign out
3. `Sidebar.tsx` — fixed visibility bug (removed `md:-translate-x-full`), added Export Hub nav item, gradient active state, credits bar
4. `store.ts` — added `'export-hub'` | `'pricing'` to AppView union
5. `page.tsx` — full rebuild:
   - LandingPage: stitch_2 style — 2-col hero with AI terminal mockup, stats row, feature cards, dual CTA
   - DashboardView: stats row (4 cards), book grid, quick-actions bar, improved empty state
   - CreditsView: gradient border balance card, cleaner tier cards, transaction history
   - ExportHubView: new view from stitch_17 — format cards + export per book
   - AdminView: icon-bg stat cards, job queue grid, cleaner job list
   - renderView() — added `export-hub` case
6. `next.config.ts` — removed invalid `serverTimeout` from `experimental`
7. `@google/generative-ai` — installed (was missing)
8. Build check — ✅ CLEAN (no errors)

## ❌ STILL TODO (lower priority)
- Upgrade AudiobookGenerator.tsx using stitch_21 reference
- Upgrade StyleUploader.tsx using stitch_20 reference  
- Add `pricing` view (stitch_22) — currently falls through to dashboard
- Wire up Export Hub to actual API `/api/books/[id]/export`

## KEY DECISIONS
- Logo: `<Zap>` icon from lucide in gradient badge (no broken PNG)
- Sidebar: `sidebarOpen ? 'translate-x-0' : '-translate-x-full'` (no md: prefix)
- Colors: `#09090b` bg, `#0d0d10` cards, `#312839` borders, `#a855f7` purple, `#06b6d4` cyan
- No new npm packages, no API route changes
