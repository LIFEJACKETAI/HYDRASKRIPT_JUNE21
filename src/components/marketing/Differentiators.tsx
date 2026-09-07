/** 
 * Differentiators - Four cards showing why HydraSkript is not "just another AI writing tool"
 * 
 * Copy per PDF plan: "We're not another AI writing tool. AI generates words. 
 * HydraSkript builds a book." — 4 cards: Story Intelligence / Build Your Universe / 
 * AI Editorial Review / Publishing Workflow.
 */

"use client"
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function Differentiators() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="py-24"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            We're Not Just Another AI Writing Tool
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            AI generates words. HydraSkript builds a book. Every stage — from intelligence to
            publication — is governed by your vision, not a text box.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Story Intelligence</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm leading-relaxed">
              Other tools forget your characters between sessions. HydraSkript&apos;s Story Bible
              remembers every relationship, every location, every timeline detail — across your
              entire series.
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Build Your Universe</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm leading-relaxed">
              Write one book or twenty. Series continuity, world-building, character genealogies,
              and timeline tracking — all connected, all automatic.
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">AI Editorial Review</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm leading-relaxed">
              Catch the plot hole your beta readers missed. Our AI reviews for timeline gaps,
              structural issues, and continuity errors before your readers do.
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Publishing Workflow</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm leading-relaxed">
              One click from manuscript to market. EPUB, PDF, DOCX, audiobook, cover design,
              and bookstore listing — all from one dashboard.
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  )
}