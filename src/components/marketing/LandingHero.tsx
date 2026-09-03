/** 
 * LandingHero - Main hero section with headline and two front doors
 * 
 * Copy per PDF plan: "Your Book. All the Way Through."
 * Two CTAs: [Start Creating Free] and [Already Have a Manuscript? Upload It]
 */

"use client"
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { Sparkles, Coins, Mouse, PenTool, Upload } from 'lucide-react'

export function LandingHero() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="space-y-8"
    >
      {/* Gradient badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-semibold">
        <Sparkles className="h-3 w-3" /> AI-Powered Book Publishing
      </div>

      <h1 className="text-5xl lg:text-7xl font-bold leading-[1.08] tracking-tight text-white">
        Your Book.{' '}
        <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400">
          All the Way Through
        </span>
      </h1>

      <p className="text-lg text-gray-400 max-w-xl leading-relaxed">
        From idea to publication-ready book. Choose your path below.
      </p>

      {/* Two front-door CTAs */}
      <div className="flex flex-wrap gap-4">
        <Button
          asChild
          className="btn-gradient h-12 px-6 shrink-0"
        >
          <span className="inline-flex items-center">
            <Coins className="h-4 w-4 mr-2" /> Start Creating Free
          </span>
        </Button>

        <Button
          asChild
          className="btn-outline h-12 px-6 shrink-0"
        >
          <span className="inline-flex items-center">
            <Upload className="h-4 w-4 mr-2" /> Already Have a Manuscript? Upload It
          </span>
        </Button>
      </div>
    </motion.div>
  )
}