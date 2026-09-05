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
<PageBackground image="/backgrounds/home.jpg" overlay="light">
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
          <p className="text-gray-500 max-w-xl mx-auto">
            Get comprehensive editorial feedback on your manuscript — plot holes, timeline gaps,
            structure issues, and continuity errors detected by our AI.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Plot Hole Detection</CardTitle>
            </CardHeader>
            <CardContent>
              AI identifies logical inconsistencies and plot holes in your narrative.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              Check for timeline inconsistencies and chronological errors.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Structure Review</CardTitle>
            </CardHeader>
            <CardContent>
              Feedback on chapter structure, pacing, and narrative flow.
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
