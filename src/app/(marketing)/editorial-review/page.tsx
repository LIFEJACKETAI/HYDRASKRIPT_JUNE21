/** 
 * editorial-review page - Map to editorial review service
 */

"use client"
import { motion } from 'framer-motion'
import { PageBackground } from '@/components/PageBackground'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function EditorialReviewPage() {
  return (
<PageBackground image="/open_pages_book.jpg" overlay="light" gradient="from-cyan-950/30 via-transparent to-purple-950/20">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="py-24"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            AI Editorial Review
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg leading-relaxed">
            Catch the plot hole your beta readers missed. Our AI reviews your manuscript for
            timeline gaps, structural issues, and continuity errors — before your readers do.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Plot Hole Detection</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm leading-relaxed">
              AI identifies logical inconsistencies, unresolved subplots, and narrative gaps that
              weaken your story.
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Timeline Analysis</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm leading-relaxed">
              Check for timeline inconsistencies — characters aging wrong, events in impossible
              order, seasons that don&apos;t match.
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Structure Review</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm leading-relaxed">
              Feedback on chapter structure, pacing, and narrative flow. Know where readers will
              put the book down — and fix it.
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 text-center">
          <Button asChild className="btn-gradient">
            <a href="/login?mode=signup&next=/dashboard">Submit for Review</a>
          </Button>
        </div>
      </div>
    </motion.div>
    </PageBackground>
  )
}

export default EditorialReviewPage
