import type { AppView } from '@/lib/store';

/**
 * Full-viewport studio backdrop.
 * Renders a fixed photographic layer behind the dashboard content area
 * with dark gradients so glass cards and light text stay readable.
 * Photos live in `public/backgrounds/` (free Pexels photography).
 */
export const STUDIO_BACKGROUNDS: Record<string, string> = {
  dashboard: '/backgrounds/dashboard.jpg',
  'create-book': '/backgrounds/ebook-wizard.jpg',
  'book-detail': '/backgrounds/home.jpg',
  'story-bible': '/backgrounds/ebook-wizard.jpg',
  universe: '/backgrounds/home.jpg',
  'ideas-lab': '/backgrounds/coloring-book.jpg',
  audiobook: '/backgrounds/audiobook.jpg',
  'style-training': '/backgrounds/voice-cloning.jpg',
  'export-hub': '/backgrounds/dashboard.jpg',
  bookstore: '/backgrounds/kids-book.jpg',
  credits: '/backgrounds/pricing.jpg',
  pricing: '/backgrounds/pricing.jpg',
  admin: '/backgrounds/dashboard.jpg',
  'ai-cover-designer': '/backgrounds/coloring-book.jpg',
  landing: '/backgrounds/dashboard.jpg',
};

export function studioBackgroundForView(view: AppView): string {
  return STUDIO_BACKGROUNDS[view] ?? STUDIO_BACKGROUNDS.dashboard;
}

export default function StudioBackground({ image }: { image: string }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-35"
        style={{ backgroundImage: `url(${image})` }}
      />
      {/* Readability gradients — darker at the top under the navbar, heaviest at the bottom */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#09090b]/75 via-[#09090b]/85 to-[#09090b]/95" />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, transparent 40%, rgba(9,9,11,0.55) 100%)',
        }}
      />
    </div>
  );
}
