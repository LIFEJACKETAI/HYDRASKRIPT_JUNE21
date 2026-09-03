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
            AI generates words. HydraSkript builds a book. Every stage, from intelligence to
            publication, is governed by your vision.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Story Intelligence</CardTitle>
            </CardHeader>
            <CardContent>
              Story Bible, characters, locations, continuity, series/universe mapping
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Build Your Universe</CardTitle>
            </CardHeader>
            <CardContent>
              Series continuity, world-building, genealogies, timeline tracking
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI Editorial Review</CardTitle>
            </CardHeader>
            <CardContent>
              Plot holes, timeline gaps, structure issues, continuity errors detected
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Publishing Workflow</CardTitle>
            </CardHeader>
            <CardContent>
              EPUB/PDF/DOCX export, audiobook generation, bookstore listing, metadata
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  )
}