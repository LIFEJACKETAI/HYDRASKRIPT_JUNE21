import Stripe from 'stripe';
import { db } from '@/lib/db';
import { addCredits } from '@/lib/utils/credits';
import {
  PRICING_CONFIG,
  STRIPE_PRICE_ENV_KEYS,
  type PricingKey,
  type Tier,
} from '@/types';

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  return new Stripe(secretKey, {
    apiVersion: '2026-06-24.dahlia',
  });
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return secret;
}

export function getStripePriceId(pricingKey: PricingKey) {
  const envKey = STRIPE_PRICE_ENV_KEYS[pricingKey];
  const priceId = process.env[envKey];

  if (!priceId) {
    throw new Error(`Missing Stripe price ID environment variable: ${envKey}`);
  }

  return priceId;
}

export function getAppBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
}

export async function createPendingPayment(params: {
  profileId: string;
  pricingKey: PricingKey;
  mode: 'subscription' | 'payment';
  amountCents: number;
}) {
  const pricing = PRICING_CONFIG[params.pricingKey];

  return db.payment.create({
    data: {
      profileId: params.profileId,
      pricingKey: params.pricingKey,
      mode: params.mode,
      amountCents: params.amountCents,
      creditsGranted: pricing.credits,
      tierApplied: pricing.category === 'tier' ? params.pricingKey : null,
      status: 'pending',
    },
  });
}

export async function fulfillPaymentBySession(session: Stripe.Checkout.Session) {
  const paymentId = session.metadata?.paymentId;
  const pricingKey = session.metadata?.pricingKey as PricingKey | undefined;
  const profileId = session.metadata?.profileId;

  if (!paymentId || !pricingKey || !profileId) {
    throw new Error('Stripe session metadata is incomplete');
  }

  const pricing = PRICING_CONFIG[pricingKey];
  if (!pricing) {
    throw new Error(`Unknown pricing key: ${pricingKey}`);
  }

  const existingPayment = await db.payment.findUnique({
    where: { id: paymentId },
  });

  if (!existingPayment) {
    throw new Error(`Payment record not found for session ${session.id}`);
  }

  if (existingPayment.fulfilledAt) {
    return existingPayment;
  }

  const reason = pricing.category === 'pack'
    ? `Stripe pack purchase: ${pricing.label}`
    : `Stripe subscription payment: ${pricing.label}`;

  const creditsAdded = await addCredits(profileId, pricing.credits, reason);
  if (!creditsAdded) {
    throw new Error(`Failed to add credits for payment ${paymentId}`);
  }

  const tierUpdate = pricing.category === 'tier'
    ? { tier: pricingKey as Tier }
    : undefined;

  return db.$transaction(async (tx) => {
    if (tierUpdate) {
      await tx.profile.update({
        where: { id: profileId },
        data: tierUpdate,
      });
    }

    return tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'paid',
        stripeSessionId: session.id,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
        stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
        fulfilledAt: new Date(),
      },
    });
  });
}

export async function syncPaymentInvoice(params: {
  sessionId?: string | null;
  invoiceId?: string | null;
  subscriptionId?: string | null;
}) {
  if (!params.sessionId && !params.invoiceId) return null;

  const payment = await db.payment.findFirst({
    where: {
      OR: [
        ...(params.sessionId ? [{ stripeSessionId: params.sessionId }] : []),
        ...(params.invoiceId ? [{ stripeInvoiceId: params.invoiceId }] : []),
      ],
    },
  });

  if (!payment) return null;

  return db.payment.update({
    where: { id: payment.id },
    data: {
      ...(params.invoiceId ? { stripeInvoiceId: params.invoiceId } : {}),
      ...(params.subscriptionId ? { stripeSubscriptionId: params.subscriptionId } : {}),
    },
  });
}
