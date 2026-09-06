import type { ReactNode } from 'react'

/**
 * Dark-theme page background: a cover-scaled photo layered behind page content
 * with a rich GRADIENT overlay (base brand tint + vertical darkening + radial
 * vignette) so even bright, high-key photos read as a subtle, textured backdrop
 * and light text stays fully readable.
 *
 * Photos live in `public/backgrounds/` (free Pexels photography). Use the
 * overlay strength to tune how much the image shows through:
 *   - 'subtle': hero/landing pages where the art should be more present
 *   - 'light':  default for content/marketing pages
 *   - 'strong': dense app UI (dashboard) where text legibility is paramount
 *   - 'none':   no overlay (raw image — rarely used)
 *
 * `gradient` optionally adds a brand-colored top wash (e.g. 'from-purple-900/40').
 */
type OverlayStrength = 'subtle' | 'light' | 'strong' | 'none'

// Each layer is a stack: a brand-tinted top wash, a vertical scrim that is
// darkest behind the main content column, and a radial vignette that pulls
// focus to the center. Opacities increase with strength.
const overlayLayers: Record<Exclude<OverlayStrength, 'none'>, { scrim: string; vignette: string }> = {
  subtle: { scrim: 'bg-gradient-to-b from-[#050505]/70 via-[#050505]/80 to-[#050505]/90', vignette: 'bg-[radial-gradient(ellipse_at_center,_rgba(5,5,5,0.35)_0%,_rgba(5,5,5,0.75)_75%,_rgba(5,5,5,0.92)_100%)]' },
  light: { scrim: 'bg-gradient-to-b from-[#050505]/80 via-[#050505]/88 to-[#050505]/95', vignette: 'bg-[radial-gradient(ellipse_at_center,_rgba(5,5,5,0.45)_0%,_rgba(5,5,5,0.82)_75%,_rgba(5,5,5,0.96)_100%)]' },
  strong: { scrim: 'bg-gradient-to-b from-[#050505]/90 via-[#050505]/94 to-[#050505]/98', vignette: 'bg-[radial-gradient(ellipse_at_center,_rgba(5,5,5,0.6)_0%,_rgba(5,5,5,0.9)_75%,_rgba(5,5,5,0.99)_100%)]' },
}

export function PageBackground({
  image,
  overlay = 'light',
  gradient,
  className = '',
  children,
}: {
  image: string
  overlay?: OverlayStrength
  /** Optional brand-tinted top wash, e.g. 'from-purple-900/40 to-transparent'. */
  gradient?: string
  className?: string
  children: ReactNode
}) {
  const layers = overlay === 'none' ? null : overlayLayers[overlay]

  return (
    <div className={`relative min-h-screen overflow-hidden bg-[#050505] ${className}`}>
      {/* Base photo */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${image})` }}
      />
      {/* Optional brand gradient wash */}
      {gradient && (
        <div aria-hidden="true" className={`absolute inset-0 z-0 bg-gradient-to-b ${gradient}`} />
      )}
      {/* Vertical scrim for readability */}
      {layers && <div aria-hidden="true" className={`absolute inset-0 z-0 ${layers.scrim}`} />}
      {/* Radial vignette to focus the center column */}
      {layers && <div aria-hidden="true" className={`absolute inset-0 z-0 ${layers.vignette}`} />}

      <div className="relative z-10">{children}</div>
    </div>
  )
}
