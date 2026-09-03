/** 
 * pricing/page.tsx - Public pricing page with outcome-led headlines
 * 
 * Repositioned per PDF: outcome-led headlines, credits as the mechanism underneath,
 * Author starred, annual toggle, honest Founder framing.
 * 
 * Each tier: outcome headline first, feature bullets matching actual entitlement ladder,
 * supporting text: "Includes X monthly credits · Need more? Buy credits anytime"
 * 
 * "What kind of creator are you?" selector:
 *   first book → Starter
 *   serious author → Author
 *   multiple books → Publisher
 *   publishing business → Studio
 *   "Not sure? Start with Author"
 */

"use client"
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'


const tierData = {
  free: {
    name: 'Free',
    headline: 'Experience HydraSkript',
    subtitle: '100 monthly credits · No credit card required',
    price: 0,
    credits: 100,
    features: [
      'Story Bible (basic)',
      'Chapter generation',
      'PDF export',
      '10K words/month',
      'Editorial review (limited)',
    ],
    cta: 'Start Creating Free',
    tier: 'free',
  },
  starter: {
    name: 'Starter',
    headline: 'Start your publishing journey',
    subtitle: '300 monthly credits · 3 active books',
    price: 29,
    credits: 300,
    featured: true,
    features: [
      'Story Bible',
      'Series/Universe continuity',
      'Chapter generation',
      'PDF export',
      '3 active books',
      'Standard AI',
    ],
    cta: 'Start Free Trial',
    tier: 'starter',
  },
  author: {
    name: 'Author ⭐',
    headline: 'Your complete author workspace',
    subtitle: '1000 monthly credits · EPUB/DOCX, Style profiles',
    price: 79,
    credits: 1000,
    featured: true,
    features: [
      'Story Bible (full)',
      'Series/Universe continuity',
      'Style Training (custom profiles)',
      'AI Editorial Review',
      'Chapter generation',
      'EPUB export',
      'DOCX export',
      '10 active books',
      'Audiobook (20 base + 2/min)',
    ],
    cta: 'Subscribe Author',
    tier: 'author',
  },
  publisher: {
    name: 'Publisher',
    headline: 'Build and publish at scale',
    subtitle: '3000 monthly credits · Audiobook, API access',
    price: 149,
    credits: 3000,
    features: [
      'Story Bible (full)',
      'Series/Universe continuity',
      'Style Training (custom profiles)',
      'AI Editorial Review (deep)',
      'Chapter generation',
      'EPUB/DOCX export',
      'Audiobook (20 base + 2/min)',
      'API access',
      '30 active books',
      'Publishing tools',
    ],
    cta: 'Subscribe Publisher',
    tier: 'publisher',
  },
  studio: {
    name: 'Studio',
    headline: 'Your publishing operation under one roof',
    subtitle: '10000 monthly credits · Unlimited, white-label, SLA',
    price: 299,
    credits: 10000,
    features: [
      'Story Bible (full)',
      'Series/Universe continuity',
      'Style Training (custom profiles)',
      'AI Editorial Review (enterprise)',
      'Chapter generation (priority)',
      'EPUB/DOCX export',
      'Audiobook (20 base + 2/min, priority processing)',
      'API access (unlimited)',
      'Team seats (up to 5)',
      '100 active books',
      'Custom fine-tuning',
      'SLA guarantee',
    ],
    cta: 'Start Studio',
    tier: 'studio',
  },
}

export default function PricingPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="py-24 bg-[#050505]"
    >
      <div className="max-w-7xl mx-auto px-6">
        {/* Creator Type Selector */}
        <div className="bg-[#0d0d10] rounded-2xl p-6 mb-12 border border-white/10 margin-auto max-w-2xl">
          <h2 className="text-2xl font-bold text-white mb-4">What kind of creator are you?</h2>
          <p className="text-gray-400 mb-6">
            Find the tier that matches your needs — or start with Author and upgrade later.
          </p>

          <Select>
            <SelectTrigger value="author">
              <SelectValue className="whitespace-nowrap text-left">
                <span className="text-white">Author ⭐ (recommended for serious writers)</span>
                <svg className="ml-2 -rotate-180" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="starter">
                <span className="text-white">First book — Start with Starter ($29/mo)</span>
              </SelectItem>
              <SelectItem value="author" disabled>
                <span className="text-gray-400">Serious author — Author ($79/mo)</span>
              </SelectItem>
              <SelectItem value="publisher">
                <span className="text-white">Multiple books — Publisher ($149/mo)</span>
              </SelectItem>
              <SelectItem value="studio">
                <span className="text-white">Publishing business — Studio ($299/mo)</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tiers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Object.entries(tierData).map(([key, tier]) => (
            <motion.div
              key={key}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, delay: Object.keys(tierData).indexOf(key) * 0.1 }}
              className="bg-[#0d0d10] rounded-2xl p-6 border border-white/10 hover:border-purple-500/30 transition-all"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    {tier.headline}
                  </CardTitle>
                  <p className="text-sm text-gray-400 mt-1">
                    {tier.subtitle}
                  </p>
                </CardHeader>

                <div className="mb-6">
                  <div className="text-4xl font-bold text-white mb-1">
                    ${tier.price}/mo
                  </div>
                  <p className="text-2xl font-bold text-purple-400">
                    {tier.credits} credits/month
                  </p>
                </div>

                <ul className="space-y-3 text-sm text-gray-400">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start">
                      <svg
                        className="mt-1.5 text-purple-500 shrink-0 h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 pt-6 border-t border-white/10">
                  <Button asChild className="btn-gradient w-full">
                    <span>{tier.cta}</span>
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Annual billing info */}
        <div className="mt-16 text-center">
          <p className="text-gray-400 mb-6">
            Annual billing ≈ 2 months free (coming soon)
          </p>
          <Button
            asChild
            className="btn-outline text-sm py-2 px-6"
          >
            Switch to Annual
          </Button>
        </div>
      </div>
    </motion.div>
  )
}