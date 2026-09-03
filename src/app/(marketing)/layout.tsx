/** 
 * (marketing)/layout.tsx - Shared layout for marketing routes
 * Public navbar/footer + the two front-door CTAs
 */

import { motion } from 'framer-motion'
import Link from 'next/link'
import { NavBar } from '@/components/marketing/NavBar'
import { Footer } from '@/components/marketing/Footer'

export const metadata = {
  title: 'HydraSkript - Your Book. All the Way Through.',
  description: 'AI-powered book publishing from idea to bookshelf — Story Intelligence, Editorial Review, Formatting, Audiobook, and more.',
}

export default function MarketingLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-black text-white">
      <body className="min-h-screen">
        <NavBar />

        <main className="py-16">
          <div className="max-w-7xl mx-auto px-6">
            {children}
          </div>
        </main>

        <Footer />
      </body>
    </html>
  )
}