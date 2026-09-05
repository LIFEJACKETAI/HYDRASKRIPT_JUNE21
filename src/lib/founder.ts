// HydraSkript - Founder Lifetime helpers (server-only)
// Confirmed sales drive founder_number. Pending checkouts reserve slots
// for 30 minutes so two people cannot claim the last Early Bird seat.

import type Stripe from 'stripe';
import { db } from '@/lib/db';
import { FOUNDER_PACK, getFounderOfferStatus, type FounderOfferStatus } from '@/config/founderPack';

const RESERVATION_WINDOW_MS = 30 * 60 * 1000;

export async function countConfirmedFounderSales(): Promise<number> {
  return db.founderSale.count();
}

export async function countFounderCommitments(): Promise<{
  soldCount: number;
  reservedCount: number;
  commitmentCount: number;
}> {
  const windowStart = new Date(Date.now() - RESERVATION_WINDOW_MS);
  const [soldCount, reservedCount] = await Promise.all([
    db.founderSale.count(),
    db.payment.count({
      where: {
        pricingKey: 'founder',
        status: 'pending',
        createdAt: { gte: windowStart },
      },
    }),
  ]);
  return {
    soldCount,
    reservedCount,
    commitmentCount: soldCount + reservedCount,
  };
}

export async function getLiveFounderOffer(): Promise<FounderOfferStatus & { reservedCount: number }> {
  const { soldCount, reservedCount, commitmentCount } = await countFounderCommitments();
  const offer = getFounderOfferStatus(commitmentCount);
  return { ...offer, soldCount, reservedCount };
}

export function getFounderStripeLineItem(
  offer: Extract<FounderOfferStatus, { available: true }>
): Stripe.Checkout.SessionCreateParams.LineItem {
  const envPriceId = process.env[offer.stripePriceEnvKey];
  if (envPriceId) {
    return { price: envPriceId, quantity: 1 as const };
  }

  const productName =
    offer.phase === 'early_bird'
      ? 'HydraSkript Founder Lifetime (Early Bird)'
      : 'HydraSkript Founder Lifetime';

  return {
    quantity: 1 as const,
    price_data: {
      currency: 'usd',
      unit_amount: offer.priceCents,
      product_data: {
        name: productName,
        description: `${FOUNDER_PACK.monthlyCredits} credits every month for life. Audiobooks not included.`,
      },
    },
  };
}
