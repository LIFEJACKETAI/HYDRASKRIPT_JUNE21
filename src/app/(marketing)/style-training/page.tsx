/**
 * style-training page - Write in Your Voice
 *
 * Key differentiator: HydraSkript learns YOUR writing style and generates
 * chapters that sound like you, not like AI.
 */

"use client"
import { motion } from 'framer-motion'
import { PageBackground } from '@/components/PageBackground'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function StyleTrainingPage() {
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
            Write in <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">Your Voice</span>
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg leading-relaxed">
            Most AI writing tools produce generic, soulless prose. HydraSkript learns your unique
            voice — your sentence rhythm, your word choices, your tone — and writes chapters that
            sound like you wrote them.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Upload Your Exemplars</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm leading-relaxed">
              Feed HydraSkript your existing writing — previous books, blog posts, sample chapters.
              The AI analyzes your style and replicates it.
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Style Profile</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm leading-relaxed">
              Your style profile captures vocabulary, sentence length, dialogue patterns, pacing,
              and narrative voice — then applies it to every chapter it writes.
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0d0d10]">
            <CardHeader>
              <CardTitle className="text-white">Consistent Voice</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400 text-sm leading-relaxed">
              Whether it&apos;s chapter 1 or chapter 30, your voice stays consistent. No more
              &ldquo;AI drift&rdquo; where chapters suddenly sound different.
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 text-center">
          <Button asChild className="btn-gradient">
            <a href="/login?mode=signup&next=/dashboard">Train Your Style</a>
          </Button>
        </div>
      </div>
    </motion.div>
    </PageBackground>
  )
}

export default StyleTrainingPage
