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
          <p className="text-gray-500 max-w-xl mx-auto">
            Writing a book shouldn't require juggling fifteen different services and six logins. From
            story intelligence to editorial review, formatting to audiobook production, every step
            today is fragmented.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Editing & Continuity</CardTitle>
            </CardHeader>
            <CardContent>
              Story intelligence, plot hole detection, timeline consistency
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Formatting & Export</CardTitle>
            </CardHeader>
            <CardContent>
              PDF, EPUB, DOCX, print-ready formatting
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cover & Illustrations</CardTitle>
            </CardHeader>
            <CardContent>
              AI cover designer, chapter illustrations
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Publishing & Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              Bookstore, metadata, metadata, audiobook publishing
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  )
}