import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import {
  getStripeClient,
  getStripeWebhookSecret,
  fulfillPaymentBySession,
  fulfillFounderSale,
  syncPaymentInvoice,
  fulfillSubscriptionRenewal,
} from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripeClient();
    const webhookSecret = getStripeWebhookSecret();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
    }

    const body = await request.text();
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata ?? {};
        if (metadata.founderPhase || metadata.founderPrice) {
          await fulfillFounderSale(session);
        } else {
          await fulfillPaymentBySession(session);
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = 'parent' in invoice && invoice.parent && typeof invoice.parent === 'object'
          && 'subscription_details' in invoice.parent && invoice.parent.subscription_details
          && typeof invoice.parent.subscription_details === 'object'
          && 'subscription' in invoice.parent.subscription_details
          && typeof invoice.parent.subscription_details.subscription === 'string'
          ? invoice.parent.subscription_details.subscription
          : null;

        // Renewal invoices grant recurring credits; the initial invoice was
        // already credited at checkout (fulfillPaymentBySession).
        const billingReason = (invoice as { billing_reason?: string }).billing_reason;
        if (billingReason === 'subscription_cycle' && subscriptionId) {
          await fulfillSubscriptionRenewal({
            subscriptionId,
            invoiceId: invoice.id,
            amountCents: invoice.amount_paid,
          });
        }

        await syncPaymentInvoice({
          invoiceId: invoice.id,
          subscriptionId,
        });
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown webhook error';
    console.error('[Stripe webhook] failed:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
