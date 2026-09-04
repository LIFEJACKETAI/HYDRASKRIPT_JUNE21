/** 
 * ManuscriptDoor - Prominent upload block for authors who already have a manuscript
 * 
 * Copy per PDF plan: "Your book doesn't have to start here. It just has to finish here."
 */

"use client"
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Upload } from 'lucide-react'

export function ManuscriptDoor() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      id="manuscript"
      className="bg-[#050505] border-t border-white/5 py-24 scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            Your Book Doesn't Have to Start Here
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            "Your book doesn't have to start here. It just has to finish here."
          </p>
        </div>

        <div className="border-2 border-white/10 rounded-2xl p-8 text-center">
          <Upload className="w-16 h-16 mx-auto mb-6 text-purple-500" />
          <h3 className="text-2xl font-bold text-white mb-2">
            Upload Your Manuscript
          </h3>
          <p className="text-gray-400 mb-6">
            Bring your finished manuscript and we'll help you polish, format, and publish it.
          </p>

          <Button
            asChild
            className="btn-gradient w-full h-12 px-6"
          >
            <Link href="/login">Start With Manuscript</Link>
          </Button>
          <p className="text-xs text-gray-600 mt-4">
            Free account required to upload — 100 free credits on signup.
          </p>
        </div>
      </div>
    </motion.div>
  )
}
