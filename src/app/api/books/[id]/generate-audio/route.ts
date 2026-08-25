// HydraSkript - Audiobook Generation API
// POST /api/books/[id]/generate-audio - Generate audiobook with dynamic credit pricing

import { NextRequest, NextResponse } from 'next/server';
import { getAuthEmail } from '@/lib/auth-helpers';
import { getOrCreateProfile } from '@/lib/utils/bookHelpers';
import { calculateAudiobookCost, reserveCredits, getCreditBalances } from '@/lib/utils/credits';
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

    // Get book details
    const book = await db.book.findUnique({
      where: { id, ownerId: profile.id },
      include: {
        chapters: {
          select: { 
            wordCount: true, 
            content: true,
            index: true,
            title: true,
          },
          where: { status: 'completed' },
          orderBy: { index: 'asc' },
        },
      },
    });

    if (!book) {
      return NextResponse.json(
        { success: false, error: 'Book not found' },
        { status: 404 }
      );
    }

    // Get voice preference from request body
    const body = await request.json();
    const voiceId = body.voiceId || 'en-US-Neural2-C';

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

    // Check if user can afford it
    const balances = await getCreditBalances(profile.id);
    if (balances.total < cost) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Insufficient credits',
          data: {
            required: cost,
            available: balances.total,
            shortfall: cost - balances.total,
          }
        },
        { status: 402 }
      );
    }

    // Create job for audiobook generation
    const { jobQueue } = await import('@/lib/workers/queue');
    const jobId = await jobQueue.createJob({
      bookId: id,
      ownerId: profile.id,
      jobType: 'generate_audiobook',
      creditsReserved: cost,
      stepIndex: 0,
      result: JSON.stringify({ voiceId, totalWords }),
    });

    // Reserve credits (escrow). This is what actually deducts from the wallet;
    // consumeCredits later only reconciles the diff to zero.
    const reserved = await reserveCredits(profile.id, cost, jobId, 'Audiobook generation');
    if (!reserved) {
      // Insufficient credits: remove the orphaned job so the active queue does
      // not pick it up and generate an audiobook for free.
      await db.job.delete({ where: { id: jobId } }).catch(() => {});
      return NextResponse.json(
        {
          success: false,
          error: 'Insufficient credits',
          data: {
            required: cost,
            available: balances.total,
            shortfall: cost - balances.total,
          },
        },
        { status: 402 }
      );
    }

    // Start the audiobook generation job
    await jobQueue.startJob(jobId, 'generate_audiobook');

    return NextResponse.json({
      success: true,
      data: {
        jobId,
        estimatedCost: cost,
        totalWords,
        estimatedMinutes: Math.ceil(totalWords / 150),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Audiobook generation failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}