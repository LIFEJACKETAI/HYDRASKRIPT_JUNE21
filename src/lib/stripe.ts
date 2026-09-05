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
    apiVersion: '2026-07-29.dahlia',
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
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3002';
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

export async function fulfillFounderSale(session: Stripe.Checkout.Session) {
  const profileId = session.metadata?.profileId;
  const founderPriceCents = session.metadata?.founderPrice;
  const founderPhase = session.metadata?.founderPhase;
  const paymentId = session.metadata?.paymentId;

  if (!profileId || !founderPriceCents) {
    throw new Error('Founder session metadata is incomplete');
  }

  const priceCents = parseInt(founderPriceCents, 10);
  if (![39900, 49900].includes(priceCents)) {
    throw new Error(`Unexpected founder price: ${founderPriceCents}`);
  }

  // Idempotent: a profile can only claim one Founder slot.
  const existing = await db.founderSale.findUnique({ where: { profileId } });
  if (existing) return existing;

  return db.$transaction(async (tx) => {
    const last = await tx.founderSale.findFirst({
      orderBy: { founderNumber: 'desc' },
      select: { founderNumber: true },
    });
    const founderNumber = (last?.founderNumber ?? 0) + 1;

    if (founderNumber > 500) {
      throw new Error('Founder offer closed — no remaining seats.');
    }

    await tx.profile.update({
      where: { id: profileId },
      data: {
        tier: 'founder',
        isLifetime: true,
        founderBadge: true,
        founderNumber,
        monthlyCreditAllowance: 500,
        monthlyCredits: 500,
        monthlyCreditsLastGrantedAt: new Date(),
        audiobookEnabled: false,
      },
    });

    await tx.founderSale.create({
      data: {
        profileId,
        founderNumber,
        pricePaidCents: priceCents,
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === 'string' ? session.payment_intent : null,
      },
    });

    const paidFields = {
      status: 'paid' as const,
      stripeSessionId: session.id,
      stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
      amountCents: priceCents,
      creditsGranted: 500,
      tierApplied: 'founder',
      fulfilledAt: new Date(),
    };

    if (paymentId) {
      await tx.payment.update({
        where: { id: paymentId },
        data: paidFields,
      });
    } else {
      await tx.payment.create({
        data: {
          profileId,
          pricingKey: 'founder',
          provider: 'stripe',
          mode: 'payment',
          ...paidFields,
        },
      });
    }

    await tx.creditLedger.create({
      data: {
        profileId,
        amount: 500,
        reason:
          founderPhase === 'early_bird'
            ? 'Founder Early Bird activation — 500 monthly credits'
            : 'Founder Lifetime activation — 500 monthly credits',
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

/**
 * Grant recurring credits when a subscription invoice is paid.
 * Idempotent per invoice. Only call this for renewal invoices
 * (billing_reason === 'subscription_cycle'); the initial invoice is already
 * credited by fulfillPaymentBySession at checkout time.
 */
export async function fulfillSubscriptionRenewal(params: {
  subscriptionId: string;
  invoiceId: string;
  amountCents?: number | null;
}): Promise<boolean> {
  if (!params.subscriptionId || !params.invoiceId) return false;

  // One credit grant per invoice (idempotent across webhook retries).
  const existing = await db.payment.findFirst({
    where: { stripeInvoiceId: params.invoiceId },
  });
  if (existing) return true;

  // Locate the original subscription payment to derive profile + plan.
  const original = await db.payment.findFirst({
    where: { stripeSubscriptionId: params.subscriptionId, mode: 'subscription' },
  });
  if (!original) return false; // not a tracked subscription (e.g. one-time Founder sale)

  const pricingKey = original.pricingKey as PricingKey | undefined;
  const pricing = pricingKey ? PRICING_CONFIG[pricingKey] : undefined;
  if (!pricing) return false;

  const credits = pricing.credits;
  const added = await addCredits(
    original.profileId,
    credits,
    `Stripe subscription renewal: ${pricing.label}`,
    'monthly'
  );
  if (!added) return false;

  await db.payment.create({
    data: {
      profileId: original.profileId,
      pricingKey: pricingKey ?? 'subscription',
      provider: 'stripe',
      mode: 'subscription',
      status: 'paid',
      stripeInvoiceId: params.invoiceId,
      stripeSubscriptionId: params.subscriptionId,
      amountCents: params.amountCents ?? 0,
      creditsGranted: credits,
      fulfilledAt: new Date(),
    },
  });

  return true;
}
