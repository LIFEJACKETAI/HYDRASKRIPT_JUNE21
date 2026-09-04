import type { ReactNode } from 'react'

/**
 * Dark-theme page background: a cover-scaled photo layered behind page
 * content with a dark overlay so light text stays readable.
 * Photos live in `public/backgrounds/` (free Pexels photography).
 */
type OverlayStrength = 'subtle' | 'light' | 'strong' | 'none'

const overlayClasses: Record<OverlayStrength, string> = {
  subtle: 'bg-black/45',
  light: 'bg-black/60',
  strong: 'bg-black/75',
  none: 'hidden',
}

export function PageBackground({
  image,
  overlay = 'light',
  className = '',
  children,
}: {
  image: string
  overlay?: OverlayStrength
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`relative min-h-screen bg-[#050505] ${className}`}>
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${image})` }}
      />
      <div
        aria-hidden="true"
        className={`absolute inset-0 z-0 ${overlayClasses[overlay]}`}
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
