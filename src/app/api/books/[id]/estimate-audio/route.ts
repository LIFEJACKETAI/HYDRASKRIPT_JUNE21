// HydraSkript - Audiobook Cost Estimation API
// POST /api/books/[id]/estimate-audio - Get audiobook generation cost

import { NextRequest, NextResponse } from 'next/server';
import { getAuthEmail } from '@/lib/auth-helpers';
import { getOrCreateProfile } from '@/lib/utils/bookHelpers';
import { calculateAudiobookCost } from '@/lib/utils/credits';
import { getCreditBalances } from '@/lib/utils/credits';
import { db } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const email = await getAuthEmail(request);

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const profile = await getOrCreateProfile(email);

    // Get book details to calculate word count
    const book = await db.book.findUnique({
      where: { id, ownerId: profile.id },
      include: {
        chapters: {
          select: { wordCount: true, content: true },
          where: { status: 'completed' },
        },
      },
    });

    if (!book) {
      return NextResponse.json(
        { success: false, error: 'Book not found' },
        { status: 404 }
      );
    }

    // Calculate total word count from completed chapters
    const totalWords = book.chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);

    if (totalWords === 0) {
      return NextResponse.json(
        { success: false, error: 'Book has no completed chapters yet' },
        { status: 400 }
      );
    }

    // Calculate audiobook cost
    const cost = calculateAudiobookCost(totalWords);

    // Get user's credit balances
    const balances = await getCreditBalances(profile.id);

    return NextResponse.json({
      success: true,
      data: {
        estimatedCost: cost,
        totalWords,
        estimatedMinutes: Math.ceil(totalWords / 150),
        userCredits: {
          monthlyCredits: balances.monthlyCredits,
          purchasedCredits: balances.purchasedCredits,
          lifetimeCredits: balances.lifetimeCredits,
          total: balances.total,
        },
        canAfford: balances.total >= cost,
        paymentSource: balances.monthlyCredits >= cost ? 'monthlyCredits' :
                      balances.lifetimeCredits >= cost ? 'lifetimeCredits' :
                      'purchasedCredits',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Audiobook estimate failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}