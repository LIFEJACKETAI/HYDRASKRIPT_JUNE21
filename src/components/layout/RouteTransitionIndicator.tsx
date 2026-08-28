'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';

/**
 * Branded replacement for the Next.js dev indicator. Shows a small HYDRASKRIPT
 * logo box (with a subtle "thinking" pulse) whenever the route changes.
 */
export default function RouteTransitionIndicator() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 650);
    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed bottom-4 left-4 z-[100] transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="flex items-center justify-center animate-pulse rounded-xl border border-white/10 bg-[#0d0d10]/90 p-2 shadow-[0_0_24px_rgba(122,252,255,0.18),0_0_48px_rgba(184,140,255,0.15)] backdrop-blur">
        <Image
          src="/HYDRASKRIPT_LOGO.png"
          alt=""
          width={20}
          height={20}
          className="h-5 w-5 rounded"
          priority
        />
      </div>
    </div>
  );
}
