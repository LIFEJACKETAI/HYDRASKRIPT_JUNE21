'use client';

import { useState } from 'react';

const STITCH_PAGES = [
  // Named pages from stitch_50_50_1
  { id: 'dashboard_and_authentication_1', label: 'Dashboard & Auth (v1)', category: 'Core' },
  { id: 'dashboard_and_authentication_2', label: 'Dashboard & Auth (v2)', category: 'Core' },
  { id: 'hydraskript_landing_page_1', label: 'Landing Page (v1)', category: 'Marketing' },
  { id: 'hydraskript_landing_page_2', label: 'Landing Page (v2)', category: 'Marketing' },
  { id: 'hydraskript_landing_page_3', label: 'Landing Page (v3)', category: 'Marketing' },
  { id: 'hydraskript_pricing_plans_1', label: 'Pricing Plans (v1)', category: 'Marketing' },
  { id: 'hydraskript_pricing_plans_2', label: 'Pricing Plans (v2)', category: 'Marketing' },
  { id: 'distraction-free_ai_editor_1', label: 'AI Editor (v1)', category: 'Editor' },
  { id: 'distraction-free_ai_editor_2', label: 'AI Editor (v2)', category: 'Editor' },
  { id: 'generation_and_consistency_monitor', label: 'Generation Monitor', category: 'Generation' },
  { id: 'narrative_timeline_monitor', label: 'Narrative Timeline', category: 'Generation' },
  { id: 'global_library_command_center', label: 'Global Library', category: 'Library' },
  { id: 'export_hub_with_live_preview', label: 'Export Hub', category: 'Export' },
  { id: 'audiobook_studio_&_mastering_suite', label: 'Audiobook Studio', category: 'Audio' },
  { id: 'audiobook_studio_and_export_hub', label: 'Audiobook Export Hub', category: 'Audio' },
  { id: 'ai_cover_designer', label: 'AI Cover Designer', category: 'Design' },
  { id: 'ai_style_library_marketplace', label: 'Style Library Marketplace', category: 'Design' },
  { id: 'ai-powered_support_&_documentation_1', label: 'AI Support & Docs (v1)', category: 'Support' },
  { id: 'ai-powered_support_&_documentation_2', label: 'AI Support & Docs (v2)', category: 'Support' },
  { id: 'book_marketing_kit_generator_1', label: 'Marketing Kit (v1)', category: 'Marketing' },
  { id: 'book_marketing_kit_generator_2', label: 'Marketing Kit (v2)', category: 'Marketing' },
  { id: 'direct-to-reader_author_storefront', label: 'Author Storefront', category: 'Marketing' },
  { id: 'internal_admin_dashboard', label: 'Internal Admin Dashboard', category: 'Admin' },
  { id: 'mobile_dashboard_view', label: 'Mobile Dashboard', category: 'Core' },
  // Named pages from stitch_50_50_2
  { id: 'style_training_center', label: 'Style Training Center', category: 'Design' },
  { id: 'style_match_comparison_tool', label: 'Style Match Comparison', category: 'Design' },
  { id: 'story_bible_profiles', label: 'Story Bible Profiles', category: 'Generation' },
  { id: 'universe_&_series_architect', label: 'Universe & Series Architect', category: 'Generation' },
  { id: 'new_project_setup_wizard', label: 'New Project Setup Wizard', category: 'Core' },
  { id: 'sentence_rhythm_&_flow_visualizer', label: 'Sentence Rhythm Visualizer', category: 'Editor' },
  // Numbered stitches
  ...Array.from({ length: 30 }, (_, i) => ({
    id: `stitch_hydraskript_${i + 1}`,
    label: `Stitch ${i + 1}`,
    category: 'Numbered',
  })),
];

const CATEGORIES = ['All', 'Core', 'Marketing', 'Editor', 'Generation', 'Library', 'Export', 'Audio', 'Design', 'Support', 'Admin', 'Numbered'];

export default function StitchGalleryPage() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [previewPage, setPreviewPage] = useState<string | null>(null);

  const filtered = STITCH_PAGES.filter(p => {
    const matchCat = selectedCategory === 'All' || p.category === selectedCategory;
    const matchSearch = p.label.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSearch;
  });

  if (previewPage) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3 bg-[#0d0d10] border-b border-white/10">
          <button
            onClick={() => setPreviewPage(null)}
            className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
          >
            ← Back to Gallery
          </button>
          <span className="text-white text-sm font-medium">{previewPage.replace(/_/g, ' ').replace(/-/g, ' ')}</span>
          <a
            href={`/stitch/${previewPage}.html`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 text-sm hover:bg-purple-500/30 transition-colors"
          >
            Open Full Screen ↗
          </a>
        </div>
        <iframe
          src={`/stitch/${previewPage}.html`}
          className="flex-1 w-full border-none"
          title={previewPage}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <div className="border-b border-white/5 bg-[#0d0d10] px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
              <span className="text-white text-xs font-bold">HS</span>
            </div>
            <h1 className="text-2xl font-bold text-white">HydraSkript — UI Stitch Gallery</h1>
          </div>
          <p className="text-sm text-slate-400 ml-11">
            {STITCH_PAGES.length} UI mockups from stitch sessions — integrated from hydraskript_stitch_50_50_1 & _2
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <input
            type="text"
            placeholder="Search pages..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-purple-500/50"
          />
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedCategory === cat
                    ? 'bg-purple-500 text-white'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(page => (
            <div
              key={page.id}
              className="group relative rounded-2xl bg-[#0d0d10] border border-[#312839] overflow-hidden hover:border-purple-500/40 transition-all cursor-pointer"
              onClick={() => setPreviewPage(page.id)}
            >
              {/* Thumbnail via iframe */}
              <div className="relative h-40 overflow-hidden bg-[#080808]">
                <iframe
                  src={`/stitch/${page.id}.html`}
                  className="absolute inset-0 w-full h-full border-none pointer-events-none"
                  style={{ transform: 'scale(0.35)', transformOrigin: 'top left', width: '285%', height: '285%' }}
                  title={page.label}
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d10] via-transparent to-transparent" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-purple-500/10 flex items-center justify-center">
                  <span className="px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-medium shadow-lg">
                    Preview →
                  </span>
                </div>
              </div>
              {/* Info */}
              <div className="p-4">
                <span className="text-[10px] uppercase tracking-widest text-purple-400 font-semibold">{page.category}</span>
                <p className="text-sm font-medium text-white mt-0.5 leading-snug">{page.label}</p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={e => { e.stopPropagation(); setPreviewPage(page.id); }}
                    className="flex-1 py-1.5 rounded-lg bg-white/5 text-xs text-slate-300 hover:bg-purple-500/20 hover:text-purple-300 transition-colors"
                  >
                    Preview
                  </button>
                  <a
                    href={`/stitch/${page.id}.html`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex-1 py-1.5 rounded-lg bg-white/5 text-xs text-slate-300 hover:bg-cyan-500/20 hover:text-cyan-300 transition-colors text-center"
                  >
                    Full Screen
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-slate-500">No pages match your filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
