/**
 * ideas-lab page - Start From an Idea
 *
 * Front door for users who don't have a manuscript yet.
 * Generate titles, concepts, chapter structures from a prompt.
 */

"use client"
import { motion } from 'framer-motion'
import { PageBackground } from '@/components/PageBackground'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function IdeasLabPage() {
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
            Start From an <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">Idea</span>
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg leading-relaxed">
            Don&apos;t have a manuscript yet? That&apos;s fine. Start with a title, a genre, a feeling.
            HydraSkript&apos;s Ideas Lab generates concepts, chapter structures, and character outlines
            — so you can go from &ldquo;I want to write a book&rdquo; to &ldquo;here&apos;s Chapter 1&rdquo;
            in minutes.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Title & Concept</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm leading-relaxed">
              Tell us a genre, a mood, a few keywords — and get a selection of book concepts
              with titles, loglines, and target audiences.
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Chapter Structure</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm leading-relaxed">
              Once you pick a concept, the Ideas Lab generates a full chapter outline with titles,
              synopses, and word targets — ready for AI writing.
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Character Seeds</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm leading-relaxed">
              Get character suggestions with names, roles, motivations, and arcs — all seeded from
              your concept and automatically added to your Story Bible.
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 text-center">
          <Button asChild className="btn-gradient">
            <a href="/login?mode=signup&next=/dashboard">Explore Ideas</a>
          </Button>
        </div>
      </div>
    </motion.div>
    </PageBackground>
  )
}

export default IdeasLabPage
