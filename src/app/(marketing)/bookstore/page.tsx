/** 
 * bookstore page - Public storefront
 * 
 * Link into the existing BookstoreView/API
 */

"use client"
import { motion } from 'framer-motion'
import { PageBackground } from '@/components/PageBackground'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function BookstorePage() {
  return (
<PageBackground image="/backgrounds/kids-book.jpg" overlay="light">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="py-24"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">
            Bookstore
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Discover and read books published by the HydraSkript community. Browse titles,
            sample chapters, and purchase or download finished works.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Featured Books</CardTitle>
            </CardHeader>
            <CardContent>
              Hand-picked selections from the community.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Browse by Genre</CardTitle>
            </CardHeader>
            <CardContent>
              Fiction, non-fiction, fantasy, sci-fi, children's books, and more.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Free Chapters</CardTitle>
            </CardHeader>
            <CardContent>
              Sample chapters from published books.
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 text-center">
          <Button asChild className="btn-gradient">
            <span>Browse Bookstore</span>
          </Button>
        </div>
      </div>
    </motion.div>
    </PageBackground>
  )
}