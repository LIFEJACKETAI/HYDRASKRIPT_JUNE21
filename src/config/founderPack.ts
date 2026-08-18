// HydraSkript - Founder Lifetime Pack Configuration
// Centralized configuration for the Founder Lifetime offer

export const FOUNDER_PACK = {
  enabled: true,
  totalSlots: 500,
  earlyBird: {
    slots: 100,
    priceCents: 39900,
    displayPrice: '$399',
    stripePriceEnvKey: 'STRIPE_PRICE_FOUNDER_399',
  },
  standard: {
    slots: 400,
    priceCents: 49900,
    displayPrice: '$499',
    stripePriceEnvKey: 'STRIPE_PRICE_FOUNDER_499',
  },
  monthlyCredits: 500,
  valueComparison: {
    alaCarteCredits: 500,
    alaCarteValueCents: 6000,
    alaCarteDisplayValue: '$60/month',
    earlyBirdBreakEvenMonths: 6.7,
    standardBreakEvenMonths: 8.4,
  },
  monthlyLimits: {
    maxActiveGenerationJobsPerDay: 5,
    maxGeneratedImagesPerMonth: 50,
    maxCompletedBooksPerMonth: 5,
    maxGeneratedWordsPerMonth: 100_000,
    audiobooksIncluded: false,
    creditsRollover: false,
  },
  includes: [
    '500 credits every month',
    'Lifetime access to all core book generation features',
    'Generate novels, children\'s books, coloring books, and educational books',
    'Create style profiles',
    'Generate covers and illustrations using included credits',
    'Export PDF/EPUB files',
    'Commercial rights to your generated books',
    'Founder badge',
    'Early access to selected new features',
    'Extra credits available anytime from the a-la-carte menu',
  ],
  excludes: [
    'Audiobook generation',
    'Unlimited generation',
    'Agency/resale use unless upgraded',
    'Guaranteed access to expensive third-party APIs if provider pricing changes',
  ],
  legalTerms: [
    'Founder Lifetime access means lifetime access to the HydraSkript platform for the life of the product.',
    'Founder monthly credits refresh each month and do not roll over.',
    'Founder credits may be used for eligible book generation, image generation, and export features.',
    'Audiobook generation is not included and requires separate credits or add-on purchase.',
    'HydraSkript reserves the right to adjust credit costs if third-party API pricing materially changes.',
    'Founder accounts are non-transferable and may not be resold.',
    'Abuse, automation, account sharing, scraping, or resale of the service may result in suspension.',
    'Founder Lifetime is intended for individual creators, not agencies or high-volume commercial production unless explicitly stated.',
  ],
} as const;

export type FounderOfferStatus =
  | {
      available: true;
      phase: 'early_bird' | 'standard';
      priceCents: number;
      displayPrice: string;
      remainingSlots: number;
      soldCount: number;
      totalSlots: number;
      stripePriceEnvKey: string;
    }
  | {
      available: false;
      phase: 'closed';
      soldCount: number;
      totalSlots: number;
      remainingSlots: 0;
    };

export function getFounderOfferStatus(soldCount: number): FounderOfferStatus {
  const safeSoldCount = Math.max(0, soldCount);
  if (safeSoldCount >= FOUNDER_PACK.totalSlots) {
    return {
      available: false,
      phase: 'closed',
      soldCount: safeSoldCount,
      totalSlots: FOUNDER_PACK.totalSlots,
      remainingSlots: 0,
    };
  }
  if (safeSoldCount < FOUNDER_PACK.earlyBird.slots) {
    return {
      available: true,
      phase: 'early_bird',
      priceCents: FOUNDER_PACK.earlyBird.priceCents,
      displayPrice: FOUNDER_PACK.earlyBird.displayPrice,
      remainingSlots: FOUNDER_PACK.earlyBird.slots - safeSoldCount,
      soldCount: safeSoldCount,
      totalSlots: FOUNDER_PACK.totalSlots,
      stripePriceEnvKey: FOUNDER_PACK.earlyBird.stripePriceEnvKey,
    };
  }
  return {
    available: true,
    phase: 'standard',
    priceCents: FOUNDER_PACK.standard.priceCents,
    displayPrice: FOUNDER_PACK.standard.displayPrice,
    remainingSlots: FOUNDER_PACK.totalSlots - safeSoldCount,
    soldCount: safeSoldCount,
    totalSlots: FOUNDER_PACK.totalSlots,
    stripePriceEnvKey: FOUNDER_PACK.standard.stripePriceEnvKey,
  };
}