/** 
 * story-bible page - Story Bible component
 */

"use client"
import { motion } from 'framer-motion'
import { PageBackground } from '@/components/PageBackground'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function StoryBiblePage() {
  return (
<PageBackground image="/backgrounds/ebook-wizard.jpg" overlay="light">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="py-24"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            Story Bible
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg leading-relaxed">
            Every series dies from continuity errors. Story Bible makes sure yours doesn&apos;t.
            Create and maintain your story&apos;s canonical lore — characters, locations, history,
            and themes — all in one place, accessible throughout your entire series.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Characters</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm leading-relaxed">
              Track characters, arcs, motivations, and relationships. Never forget who knows whom
              or why they betrayed them in Chapter 12.
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Locations</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm leading-relaxed">
              Document places, geographies, and setting details. Your world stays consistent whether
              you&apos;re on page 50 or page 500.
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">History & Continuity</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm leading-relaxed">
              Maintain consistency across books — timeline, events, and references. Your AI editor
              reads the bible before every chapter it writes.
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 border-t border-white/5 pt-12 max-w-2xl mx-auto text-center">
          <h3 className="text-xl font-bold text-white mb-3">Already have a manuscript?</h3>
          <p className="text-gray-400 text-sm mb-6">
            Upload it and we&apos;ll build your Story Bible automatically — extracting characters,
            locations, themes, and history in minutes, not weeks.
          </p>
          <Button asChild className="btn-gradient">
            <a href={`/login?mode=signup&next=${encodeURIComponent('/dashboard?intent=manuscript')}`}>Upload Manuscript</a>
          </Button>
        </div>
      </div>
    </motion.div>
    </PageBackground>
  )
}

export default StoryBiblePage
