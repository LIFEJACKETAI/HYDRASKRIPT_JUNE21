/**
 * FinalCTA - Emotional final CTA
 */

'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function FinalCTA() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-black border-t border-white/5 py-24"
    >
      <div className="max-w-2xl mx-auto px-6 text-center">
        <h2 className="text-4xl font-bold text-white mb-4">
          Your story shouldn&apos;t spend another year sitting in a folder.
        </h2>
        <p className="text-gray-500 mb-8">
          Start your journey today — and hold your finished book in your hands sooner than you think.
        </p>
        <Button asChild className="btn-gradient">
          <Link href="/login?mode=signup&next=/dashboard">Start Creating Free</Link>
        </Button>
      </div>
    </motion.div>
  );
}
