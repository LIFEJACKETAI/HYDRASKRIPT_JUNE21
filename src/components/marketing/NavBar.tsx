/** 
 * NavBar - Simple navbar for marketing pages
 */

"use client"
import { motion } from 'framer-motion'
import Link from 'next/link'

export function NavBar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/5 bg-black/80 backdrop-blur-md px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="overflow-hidden rounded-xl shadow-[0_0_24px_rgba(122,252,255,0.18),0_0_48px_rgba(184,140,255,0.15)]"
          >
            <img
              src="/HYDRASKRIPT_LOGO.png"
              alt="HYDRASKRIPT"
              width={160}
              height={44}
              className="h-9 w-auto object-contain"
            />
          </motion.div>
        </div>

        <div className="hidden lg:flex items-center gap-8">
          <Link
            href="/(marketing)/features"
            className="text-white text-sm hover:text-purple-300 transition-colors"
          >
            Features
          </Link>
          <Link
            href="/(marketing)/pricing"
            className="text-white text-sm hover:text-purple-300 transition-colors"
          >
            Pricing
          </Link>
        </div>
      </div>
    </nav>
  )
}