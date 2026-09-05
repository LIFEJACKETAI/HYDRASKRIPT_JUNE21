// HydraSkript - Founder Checkout API
// POST /api/checkout/founder - Stripe Checkout in payment mode (not subscription)
// Price is decided on the server from confirmed sales + reserved sessions.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthEmail } from '@/lib/auth-helpers';
import { getOrCreateProfile } from '@/lib/utils/bookHelpers';
import { getLiveFounderOffer, getFounderStripeLineItem } from '@/lib/founder';
import { db } from '@/lib/db';
import { getAppBaseUrl, getStripeClient } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const email = await getAuthEmail(request);
    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Sign in to become a Founder.', loginRequired: true },
        { status: 401 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { success: false, error: 'Payments are not configured yet. Set STRIPE_SECRET_KEY to enable Founder checkout.' },
        { status: 503 }
      );
    }

    const profile = await getOrCreateProfile(email);

    if (profile.tier === 'founder' || profile.isLifetime) {
      return NextResponse.json(
        { success: false, error: 'This account is already a Founder member.' },
        { status: 400 }
      );
    }

    const existingSale = await db.founderSale.findUnique({ where: { profileId: profile.id } });
    if (existingSale) {
      return NextResponse.json(
        { success: false, error: 'This account already holds a Founder seat.' },
        { status: 400 }
      );
    }

    const offer = await getLiveFounderOffer();
    if (!offer.available) {
      return NextResponse.json(
        { success: false, error: 'Founder offer closed. All 500 slots have been claimed.' },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();
    const baseUrl = getAppBaseUrl();
    const lineItem = getFounderStripeLineItem(offer);

    const pendingPayment = await db.payment.create({
      data: {
        profileId: profile.id,
        pricingKey: 'founder',
        provider: 'stripe',
        mode: 'payment',
        status: 'pending',
        amountCents: offer.priceCents,
        creditsGranted: 500,
        tierApplied: 'founder',
      },
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: profile.email,
      line_items: [lineItem],
      success_url: `${baseUrl}/dashboard?checkout=success`,
      cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
      metadata: {
        paymentId: pendingPayment.id,
        profileId: profile.id,
        founderPrice: offer.priceCents.toString(),
        founderPhase: offer.phase,
      },
      allow_promotion_codes: true,
    });

    await db.payment.update({
      where: { id: pendingPayment.id },
      data: { stripeSessionId: session.id },
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
