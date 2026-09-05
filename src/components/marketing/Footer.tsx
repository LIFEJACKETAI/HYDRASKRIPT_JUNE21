/**
 * Footer - Footer for marketing pages
 */

'use client';

import Link from 'next/link';

const LINKS = {
  Product: [
    { href: '/features', label: 'Features' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/audiobooks', label: 'Audiobooks' },
  ],
  Resources: [
    { href: '/story-bible', label: 'Story Bible' },
    { href: '/series', label: 'Series Builder' },
    { href: '/publishing', label: 'Publishing' },
  ],
  Company: [
    { href: '/editorial-review', label: 'Editorial Review' },
    { href: '/bookstore', label: 'Bookstore' },
    { href: '/login?mode=signup&next=/dashboard', label: 'Create account' },
  ],
};

export function Footer() {
  return (
    <footer className="bg-[#050505] border-t border-white/5 py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12">
          <div>
            <h4 className="font-bold text-white mb-4">HydraSkript</h4>
            <p className="text-gray-400 text-sm">
              AI-powered book publishing from idea to bookshelf.
            </p>
          </div>

          {Object.entries(LINKS).map(([heading, items]) => (
            <div key={heading}>
              <h5 className="font-bold text-white mb-4">{heading}</h5>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="text-gray-400 hover:text-white transition-colors text-sm">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 pt-8 border-t border-white/10 text-center">
          <p className="text-gray-500 text-sm">2026 HydraSkript. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
