// HydraSkript - Credits API Route
// GET /api/credits - Get current credit balance and ledger
// POST /api/credits - Add credits (simulated purchase)

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getOrCreateProfile } from '@/lib/utils/bookHelpers';
import { addCredits, getCreditBalance } from '@/lib/utils/credits';
import { TIER_CONFIG, type Tier } from '@/types';

function getAuthEmail(request: NextRequest): string {
  const email = request.headers.get('x-user-email'); if (!email) throw new Error('Unauthorized'); return email;
}

// GET - Get credit balance and recent ledger
export async function GET(request: NextRequest) {
  try {
    const email = await getAuthEmail(request);
    const profile = await getOrCreateProfile(email);

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
        recentTransactions: recentLedger.map(entry => ({
          id: entry.id,
          amount: entry.amount,
          reason: entry.reason,
          createdAt: entry.createdAt,
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Get credits failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST - Add credits (simulated purchase)
export async function POST(request: NextRequest) {
  try {
    const email = await getAuthEmail(request);
    const profile = await getOrCreateProfile(email);

    const { tier } = await request.json();
    const tierConfig = TIER_CONFIG[tier as Tier];

    if (!tierConfig) {
      return NextResponse.json({ success: false, error: 'Invalid tier' }, { status: 400 });
    }

    // In production, this would integrate with Stripe
    // For sandbox, we just add credits directly
    await addCredits(profile.id, tierConfig.credits, `Credit purchase: ${tierConfig.label}`);

    // Update tier if upgrading
    const tierOrder: Tier[] = ['starter', 'author', 'publisher', 'studio'];
    const currentTierIndex = tierOrder.indexOf(profile.tier as Tier);
    const newTierIndex = tierOrder.indexOf(tier as Tier);
    if (newTierIndex > currentTierIndex) {
      await db.profile.update({
        where: { id: profile.id },
        data: { tier },
      });
    }

    const newBalance = await getCreditBalance(profile.id);

    return NextResponse.json({
      success: true,
      data: {
        creditsAdded: tierConfig.credits,
        newBalance,
        tier: newTierIndex > currentTierIndex ? tier : profile.tier,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Add credits failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
