/** 
 * Problem - Section explaining the problem HydraSkript solves
 * 
 * Copy per PDF plan: editing/continuity/formatting/cover/metadata/audiobook/publishing/distribution;
 * "fifteen services, six logins."
 */

"use client"
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function Problem() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-[#050505] border-t border-white/5 py-24"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            The Problem
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg leading-relaxed">
            You&apos;ve finished your manuscript. Congratulations — that&apos;s the easy part. Now you need
            an editor, a formatter, a cover designer, an audio producer, a distributor, and a marketer.
            That&apos;s six logins, five invoices, and months of coordination.
          </p>
          <p className="text-gray-500 max-w-xl mx-auto mt-3">
            Or you could use one platform that does all of it.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Editing & Continuity</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm">
              Story intelligence, plot hole detection, timeline consistency across chapters and series.
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Formatting & Export</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm">
              PDF, EPUB, DOCX — print-ready formatting in one click, not three freelancers.
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Cover & Illustrations</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm">
              AI cover designer and chapter illustrations — no designer needed.
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Publishing & Distribution</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm">
              Bookstore listing, metadata generation, and audiobook production — all built in.
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  )
}