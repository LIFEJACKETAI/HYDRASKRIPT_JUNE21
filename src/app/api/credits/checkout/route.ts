import { NextRequest, NextResponse } from 'next/server';
import { requireProfile, isUnauthorizedError, unauthorizedResponse } from '@/lib/api-auth';
import { CreditPurchaseSchema, validateOrThrow } from '@/lib/llm/schema';
import {
  getStripePriceId,
  createPendingPayment,
  getStripeClient,
  getAppBaseUrl,
} from '@/lib/stripe';
import { PRICING_CONFIG } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);
    const body = await request.json();
    const { pricingKey } = validateOrThrow(CreditPurchaseSchema, body);

    const pricing = PRICING_CONFIG[pricingKey];
    if (!pricing) {
      return NextResponse.json({ success: false, error: 'Invalid pricing key' }, { status: 400 });
    }

    const stripe = getStripeClient();
    const priceId = getStripePriceId(pricingKey);
    const pendingPayment = await createPendingPayment({
      profileId: profile.id,
      pricingKey,
      mode: pricing.mode,
      amountCents: pricing.price * 100,
    });

    const baseUrl = getAppBaseUrl();
    const session = await stripe.checkout.sessions.create({
      mode: pricing.mode,
      customer_email: profile.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/?checkout=success`,
      cancel_url: `${baseUrl}/?checkout=cancelled`,
      metadata: {
        paymentId: pendingPayment.id,
        pricingKey,
        profileId: profile.id,
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        checkoutUrl: session.url,
        sessionId: session.id,
      },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Create checkout failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
