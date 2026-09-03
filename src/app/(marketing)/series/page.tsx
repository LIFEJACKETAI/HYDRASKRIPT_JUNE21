/** 
 * series page - Universe Architect
 * 
 * Series continuity, world-building, genealogies, timeline tracking
 */

import { motion } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function SeriesPage() {
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
            Build Your Universe
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Track series continuity, family trees, faction relationships, and timeline events across
            multiple books in your world.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Series Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              Chronological events across all books in your series.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Faction & Family Trees</CardTitle>
            </CardHeader>
            <CardContent>
              Map relationships between families, factions, and organizations.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>World Building</CardTitle>
            </CardHeader>
            <CardContent>
              Geography, politics, religions, and cultural details.
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 text-center">
          <Button asChild className="btn-gradient">
            <span>Build Universe</span>
          </Button>
        </div>
      </div>
    </motion.div>
  )
}