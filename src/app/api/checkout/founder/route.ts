// HydraSkript - Founder Checkout API
// POST /api/checkout/founder - Create Stripe Checkout for Founder Lifetime

import { NextRequest, NextResponse } from 'next/server';
import { getAuthEmail } from '@/lib/auth-helpers';
import { getOrCreateProfile } from '@/lib/utils/bookHelpers';
import { getFounderOfferStatus, FOUNDER_PACK } from '@/config/founderPack';
import { db } from '@/lib/db';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10' as any,
});

export async function POST(request: NextRequest) {
  try {
    const email = await getAuthEmail(request);

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const profile = await getOrCreateProfile(email);

    // Check if already a Founder
    if (profile.tier === 'founder' || (profile as any).isLifetime) {
      return NextResponse.json(
        { success: false, error: 'Already a Founder member' },
        { status: 400 }
      );
    }

    // Get current Founder sales count
    const soldCount = await (db as any).founderSale.count({
      where: { pricePaidCents: { in: [39900, 49900] } },
    });

    const offer = getFounderOfferStatus(soldCount);

    if (!offer.available) {
      return NextResponse.json(
        { success: false, error: 'Founder offer closed. All 500 slots claimed.' },
        { status: 400 }
      );
    }

    // Create Stripe Checkout Session (payment mode, not subscription)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: profile.email,
      line_items: [{
        price: process.env[offer.stripePriceEnvKey]!,
        quantity: 1,
      }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'}/?checkout=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'}/?checkout=cancelled`,
      metadata: {
        profileId: profile.id,
        founderPrice: offer.priceCents.toString(),
        founderPhase: offer.phase,
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        checkoutUrl: session.url,
        sessionId: session.id,
        founderPhase: offer.phase,
        price: offer.displayPrice,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Founder checkout failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}