'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { PageBackground } from '@/components/PageBackground';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FounderPackCTA } from '@/components/pricing/FounderPackCTA';
import { startFounderCheckout, startPlanCheckout } from '@/lib/checkout-client';
import { PRICING_CONFIG, type PricingKey } from '@/types';
import { toast } from '@/hooks/use-toast';
import Link from 'next/link';

const tierData = {
  free: {
    name: 'Free',
    headline: 'Experience HydraSkript',
    subtitle: '100 signup credits · No credit card required',
    price: 0,
    credits: 100,
    features: [
      'Story Bible (basic)',
      'Chapter generation',
      'PDF export',
      '1 active book',
      'Editorial review (limited)',
    ],
    cta: 'Start Creating Free',
    key: 'free' as const,
  },
  starter: {
    name: 'Starter',
    headline: 'Start your publishing journey',
    subtitle: '300 monthly credits · 3 active books',
    price: 29,
    credits: 300,
    features: [
      'Story Bible',
      'Series/Universe continuity',
      'Chapter generation',
      'PDF + EPUB export',
      '3 active books',
      'Standard AI',
    ],
    cta: 'Subscribe Starter',
    key: 'starter' as const,
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
    key: 'author' as const,
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
    key: 'publisher' as const,
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
      'Audiobook (priority processing)',
      'API access (unlimited)',
      'Team seats (up to 5)',
      'Unlimited active books',
      'Custom fine-tuning',
      'SLA guarantee',
    ],
    cta: 'Start Studio',
    key: 'studio' as const,
  },
};

const CREATOR_COPY: Record<string, string> = {
  starter: 'First book — Start with Starter ($29/mo)',
  author: 'Serious author — Author ($79/mo) ⭐ recommended',
  publisher: 'Multiple books — Publisher ($149/mo)',
  studio: 'Publishing business — Studio ($299/mo)',
};

export function PricingClient({ soldCount }: { soldCount: number }) {
  const searchParams = useSearchParams();
  const [creator, setCreator] = useState('author');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const autoStarted = useRef(false);

  const runCheckout = async (key: string) => {
    setBusyKey(key);
    const error =
      key === 'founder' ? await startFounderCheckout() : await startPlanCheckout(key);
    if (error) {
      toast({ title: 'Checkout failed', description: error, variant: 'destructive' });
    }
    setBusyKey(null);
  };

  useEffect(() => {
    if (autoStarted.current) return;
    const checkout = searchParams.get('checkout');
    if (!checkout || checkout === 'cancelled' || checkout === 'success') {
      if (checkout === 'cancelled') {
        toast({ title: 'Checkout cancelled', description: 'No charge was made.' });
      }
      return;
    }
    autoStarted.current = true;
    void runCheckout(checkout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleCreatorChange = (value: string) => {
    setCreator(value);
    const el = document.getElementById(`plan-${value}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const packs = (['pack_100', 'pack_500', 'pack_1000'] as PricingKey[]).map((key) => PRICING_CONFIG[key]);

  return (
    <PageBackground image="/backgrounds/pricing.jpg" overlay="light">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="py-16"
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <p className="text-cyan-300 text-sm font-semibold uppercase tracking-widest mb-3">
              Pricing
            </p>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
              Start your publishing journey
            </h1>
            <p className="text-gray-400 max-w-2xl mx-auto">
              One Founder payment for lifetime access — or a monthly plan that matches how you write.
              Extra credits are always available à la carte.
            </p>
          </div>

          <FounderPackCTA soldCount={soldCount} />

          <div className="bg-[#0d0d10] rounded-2xl p-6 mb-12 border border-white/10 mx-auto max-w-2xl mt-12">
            <h2 className="text-2xl font-bold text-white mb-4">What kind of creator are you?</h2>
            <p className="text-gray-400 mb-6">
              Find the monthly tier that matches your needs — or start with Author and upgrade later.
            </p>
            <Select value={creator} onValueChange={handleCreatorChange}>
              <SelectTrigger className="w-full bg-black border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0d0d10] border-white/10 text-white">
                {Object.entries(CREATOR_COPY).map(([value, label]) => (
                  <SelectItem key={value} value={value} className="text-white">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {Object.entries(tierData).map(([key, tier], index) => (
              <motion.div
                key={key}
                id={`plan-${key}`}
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className={`bg-[#0d0d10] rounded-2xl p-6 border transition-all ${
                  creator === key || ('featured' in tier && tier.featured && creator === 'author')
                    ? 'border-purple-500/50 ring-1 ring-purple-500/20'
                    : 'border-white/10 hover:border-purple-500/30'
                }`}
              >
                <Card className="bg-transparent border-0 shadow-none">
                  <CardHeader className="p-0">
                    <p className="text-xs uppercase tracking-widest text-cyan-300 mb-2">{tier.name}</p>
                    <CardTitle className="text-lg font-semibold text-white">{tier.headline}</CardTitle>
                    <p className="text-sm text-gray-400 mt-1">{tier.subtitle}</p>
                  </CardHeader>
                  <CardContent className="p-0 mt-6">
                    <div className="mb-6">
                      <div className="text-4xl font-bold text-white mb-1">
                        {tier.price === 0 ? 'Free' : `$${tier.price}`}
                        {tier.price > 0 && <span className="text-base text-gray-500 font-medium">/mo</span>}
                      </div>
                      <p className="text-lg font-bold text-purple-400">{tier.credits} credits</p>
                    </div>
                    <ul className="space-y-3 text-sm text-gray-400 mb-6">
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                          <span className="text-cyan-400 mt-0.5">✓</span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    {tier.key === 'free' ? (
                      <Button asChild className="btn-gradient w-full">
                        <Link href="/login?mode=signup&next=/dashboard">{tier.cta}</Link>
                      </Button>
                    ) : (
                      <Button
                        className="btn-gradient w-full"
                        disabled={busyKey === tier.key}
                        onClick={() => runCheckout(tier.key)}
                      >
                        {busyKey === tier.key ? 'Starting checkout…' : tier.cta}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="mt-16">
            <h2 className="text-2xl font-bold text-white mb-2 text-center">Need extra credits?</h2>
            <p className="text-gray-400 text-center mb-8">
              100 credits = $15 · 500 credits = $60 · 1000 credits = $100. Packs never expire.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {packs.map((pack) => (
                <div key={pack.key} className="rounded-2xl border border-white/10 bg-[#0d0d10] p-6 text-center">
                  <p className="text-white font-bold">{pack.label}</p>
                  <p className="text-3xl font-bold text-white mt-2">${pack.price}</p>
                  <Button
                    className="btn-gradient w-full mt-4"
                    disabled={busyKey === pack.key}
                    onClick={() => runCheckout(pack.key)}
                  >
                    {busyKey === pack.key ? 'Starting checkout…' : 'Buy credits'}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-16 text-center">
            <p className="text-gray-400 mb-4">Annual billing ≈ 2 months free (coming soon)</p>
            <Button
              className="btn-outline text-sm py-2 px-6"
              onClick={() =>
                toast({
                  title: 'Annual billing is on the way',
                  description: 'Monthly plans and the Founder Lifetime offer are available today.',
                })
              }
            >
              Switch to Annual
            </Button>
          </div>
        </div>
      </motion.div>
    </PageBackground>
  );
}
