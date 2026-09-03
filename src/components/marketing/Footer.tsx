/** 
 * Footer - Footer for marketing pages
 */

"use client"
import { motion } from 'framer-motion'

export function Footer() {
  return (
    <footer className="bg-[#050505] border-t border-white/5 py-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12">
          <div>
            <h4 className="font-bold text-white mb-4">HydraSkript</h4>
            <p className="text-gray-400 text-sm">
              AI-powered book publishing from idea to bookshelf.
            </p>
          </div>

          <div>
            <h5 className="font-bold text-white mb-4">Product</h5>
            <ul className="space-y-2">
              <li>
                <a href="/(marketing)/features" className="text-gray-400 hover:text-white transition-colors text-sm">
                  Features
                </a>
              </li>
              <li>
                <a href="/(marketing)/pricing" className="text-gray-400 hover:text-white transition-colors text-sm">
                  Pricing
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h5 className="font-bold text-white mb-4">Resources</h5>
            <ul className="space-y-2">
              <li>
                <a href="/(marketing)/story-bible" className="text-gray-400 hover:text-white transition-colors text-sm">
                  Story Bible
                </a>
              </li>
              <li>
                <a href="/(marketing)/series" className="text-gray-400 hover:text-white transition-colors text-sm">
                  Series Builder
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h5 className="font-bold text-white mb-4">Company</h5>
            <ul className="space-y-2">
              <li>
                <a href="/(marketing)/editorial-review" className="text-gray-400 hover:text-white transition-colors text-sm">
                  Editorial Review
                </a>
              </li>
              <li>
                <a href="/(marketing)/audiobooks" className="text-gray-400 hover:text-white transition-colors text-sm">
                  Audiobooks
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-white/10 text-center">
          <p className="text-gray-500 text-sm">
            2026 HydraSkript. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}