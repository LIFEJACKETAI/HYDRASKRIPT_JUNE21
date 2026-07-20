// HydraSkript - Credits API Route
// GET /api/credits - Get current credit balance and ledger
// POST /api/credits - Add credits (simulated purchase)

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { addCredits, getCreditBalance } from '@/lib/utils/credits';
import { TIER_CONFIG, type Tier } from '@/types';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';

// GET - Get credit balance and recent ledger
export async function GET(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);

    const balance = await getCreditBalance(profile.id);

    const recentLedger = await db.creditLedger.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      data: {
        credits: balance,
        tier: profile.tier,
        recentTransactions: recentLedger.map((entry) => ({
          id: entry.id,
          amount: entry.amount,
          reason: entry.reason,
          createdAt: entry.createdAt,
        })),
      },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Get credits failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST - Direct credit mutation disabled in favor of Stripe Checkout.
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: 'Direct credit purchases are disabled. Use /api/credits/checkout instead.',
    },
    { status: 405 }
  );
}
