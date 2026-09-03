/** 
 * (marketing)/page.tsx - Composed 7-section landing page
 * 
 * Structure per PDF plan:
 * 1. Hero: "Your Book. All the Way Through." — two CTAs
 * 2. Section 2 – The Problem
 * 3. Section 3 – Journey visual: IDEA → STORY → WRITE → REVIEW → REFINE → PRODUCE → PUBLISH → SELL
 * 4. Section 4 – Differentiator: "We're not another AI writing tool."
 * 5. Section 5 – "Already have a book?" prominent upload block
 * 6. Section 6 – Starting from an idea
 * 7. Section 7 – Emotional final CTA: "Your story shouldn't spend another year sitting in a folder."
 * 
 * Removes fabricated stats (50K books / 12K authors / 4.9★)
 * Retains dark/gradient aesthetic, framer-motion, Button, Card
 */

"use client"
import { LandingHero } from '@/components/marketing/LandingHero'
import { Problem } from '@/components/marketing/Problem'
import { JourneyPipeline } from '@/components/marketing/JourneyPipeline'
import { Differentiators } from '@/components/marketing/Differentiators'
import { ManuscriptDoor } from '@/components/marketing/ManuscriptDoor'
import { FinalCTA } from '@/components/marketing/FinalCTA'

export default function MarketingPage() {
  return (
    <section className="bg-black">
      <LandingHero />
      <Problem />
      <JourneyPipeline />
      <Differentiators />
      <ManuscriptDoor />
      <FinalCTA />
    </section>
  )
}