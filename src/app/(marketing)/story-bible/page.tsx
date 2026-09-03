/** 
 * story-bible page - Story Bible component
 */

import { motion } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function StoryBiblePage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="py-24 bg-[#050505]"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            Story Bible
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Create and maintain your story's bible — characters, locations, history, and continuity
            all in one place, accessible throughout your series.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Characters</CardTitle>
            </CardHeader>
            <CardContent>
              Track characters, arcs, motivations, and relationships.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Locations</CardTitle>
            </CardHeader>
            <CardContent>
              Document places, geographies, and setting details.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History & Continuity</CardTitle>
            </CardHeader>
            <CardContent>
              Maintain consistency across books — timeline, events, references.
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 text-center">
          <Button asChild className="btn-gradient">
            <span>Create Story Bible</span>
          </Button>
        </div>
      </div>
    </motion.div>
  )
}