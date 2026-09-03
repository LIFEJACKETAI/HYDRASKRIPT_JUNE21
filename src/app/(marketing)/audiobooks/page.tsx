/** 
 * audiobooks page - Audiobook generator
 * 
 * Audiobook Studio: AudiobookGenerator + audioService
 */

import { motion } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function AudiobooksPage() {
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
            Audiobook Studio
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Turn your book into an audiobook with professional TTS narration. 20 credit base + 2
            credits per minute. Choose from multiple narrator voices.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Narrator Selection</CardTitle>
            </CardHeader>
            <CardContent>
              Choose from multiple AI narrator voices with different styles and genders.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent>
              20 credit base + 2 credits per minute of finished audio.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Format Options</CardTitle>
            </CardHeader>
            <CardContent>
              MP3 + FLAC exports, chapter-by-chapter or full-length audio.
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 text-center">
          <Button asChild className="btn-gradient">
            <span>Generate Audiobook</span>
          </Button>
        </div>
      </div>
    </motion.div>
  )
}