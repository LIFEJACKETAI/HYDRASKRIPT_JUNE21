/** 
 * publishing page - Exports: EPUB/PDF/DOCX, covers, metadata
 */

import { motion } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function PublishingPage() {
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
            Publishing
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Export your book in multiple formats, design a professional cover, and add metadata
            for discoverability.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>EPUB Export</CardTitle>
            </CardHeader>
            <CardContent>
              Reflowable ebook format for most e-readers and devices.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>PDF Export</CardTitle>
            </CardHeader>
            <CardContent>
              Print-ready PDF formatting for professional results.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>DOCX Export</CardTitle>
            </CardHeader>
            <CardContent>
              Microsoft Word .docx format for editors and collaborators.
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Cover Design</CardTitle>
            </CardHeader>
            <CardContent>
              AI-powered cover designer with customizable templates.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              ISBN, ASIN, description, categories, author bio for discoverability.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bookstore Listing</CardTitle>
            </CardHeader>
            <CardContent>
              Publish to the HydraSkript bookstore or export for Amazon, Barnes & Noble.
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 text-center">
          <Button asChild className="btn-gradient">
            <span>Export My Book</span>
          </Button>
        </div>
      </div>
    </motion.div>
  )
}