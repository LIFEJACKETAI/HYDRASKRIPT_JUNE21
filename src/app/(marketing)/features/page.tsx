/** 
 * features/page.tsx - Features page with comparison table
 * 
 * Includes the PDF's comparison table: "Traditional AI writing tool vs HydraSkript":
 * Persistent Story Bible, series/universe, style training, editorial review, 
 * production exports, integrated audio, bookstore
 */

"use client"
import { motion } from 'framer-motion'
import { PageBackground } from '@/components/PageBackground'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell } from '@/components/ui/table'

export function FeaturesPage() {
  const comparison = [
    { feature: 'Persistent Story Bible', traditional: '✗', hydraskript: '✓' },
    { feature: 'Series/Universe Continuity', traditional: '✗', hydraskript: '✓' },
    { feature: 'Style Training (Your Voice)', traditional: '✗', hydraskript: '✓' },
    { feature: 'AI Editorial Review', traditional: '✗', hydraskript: '✓' },
    { feature: 'Production Exports (EPUB/PDF/DOCX)', traditional: '✗', hydraskript: '✓' },
    { feature: 'Integrated Audiobook (TTS)', traditional: '✗', hydraskript: '✓' },
    { feature: 'AI Cover & Illustrations', traditional: '✗', hydraskript: '✓' },
    { feature: 'Public Bookstore', traditional: '✗', hydraskript: '✓' },
    { feature: 'Manuscript Upload & Analysis', traditional: '✗', hydraskript: '✓' },
    { feature: 'Coloring Book Generation', traditional: '✗', hydraskript: '✓' },
    { feature: 'Kids Storybook Mode', traditional: '✗', hydraskript: '✓' },
  ]

  const benefits = [
    'Persistent Story Bible on all plans',
    'Series/universe continuity tracking',
    'Custom style profiles — write in your voice, not the AI\'s',
    'Plot hole, timeline & structure detection',
    'EPUB, PDF, DOCX export in one click',
    'AI-generated audiobook with multiple voices',
    'AI cover designer and chapter illustrations',
    'Public bookstore to sell your book',
    'Upload any manuscript for instant analysis',
    'Coloring book generation (kids & adult)',
    'Kids storybook mode with age-appropriate content',
  ]

  return (
<PageBackground image="/backgrounds/coloring-book.jpg" overlay="light">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="py-24"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            Why Authors Choose HydraSkript
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            See what you get with HydraSkript that generic AI writing tools simply can&apos;t offer.
          </p>
        </div>

        {/* Comparison Table */}
        <div className="bg-[#050505] rounded-2xl p-8 mb-12 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell className="font-bold text-white">Feature</TableCell>
                <TableCell className="font-bold text-white text-center">Traditional AI Tool</TableCell>
                <TableCell className="font-bold text-white text-center">HydraSkript</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.map((row) => (
                <TableRow key={row.feature}>
                  <TableCell className="font-medium text-white">{row.feature}</TableCell>
                  <TableCell className="text-center text-red-500">{row.traditional}</TableCell>
                  <TableCell className="text-center text-green-500">{row.hydraskript}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* HydraSkript Benefits */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((benefit, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="bg-[#0d0d10] rounded-2xl p-6 border border-white/10 hover:border-purple-500/30 transition-all"
            >
              <span className="text-purple-400 text-3xl mb-3">{i + 1}</span>
              <h3 className="font-bold text-white mb-2">{benefit}</h3>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <Button asChild className="btn-gradient">
            <a href="/pricing">View Pricing</a>
          </Button>
        </div>
      </div>
    </motion.div>
    </PageBackground>
  )
}

export default FeaturesPage