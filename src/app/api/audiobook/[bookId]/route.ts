// HydraSkript - Audiobook Assets API Route
// GET /api/audiobook/:bookId - Retrieve audiobook assets and job for a book
// POST /api/audiobook/:bookId - Start audiobook generation

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getOrCreateProfile } from '@/lib/utils/bookHelpers';
import { jobQueue } from '@/lib/workers/queue';
import { reserveCredits, estimateBookCredits } from '@/lib/utils/credits';
import { generateAudiobookWorker } from '@/lib/workers/generateAudiobookWorker';

function getAuthEmail(request: NextRequest): string {
  return request.headers.get('x-user-email') || 'demo@hydraskript.com';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { bookId } = await params;
    const email = await getAuthEmail(request);
    const profile = await getOrCreateProfile(email);

    // Verify the book belongs to this user
    const book = await db.book.findUnique({
      where: { id: bookId, ownerId: profile.id },
      select: { id: true, title: true },
    });

    if (!book) {
      return NextResponse.json(
        { success: false, error: 'Book not found or access denied.' },
        { status: 404 }
      );
    }

    // Fetch all audiobook-type media assets for this book
    const assets = await db.mediaAsset.findMany({
      where: {
        bookId,
        ownerId: profile.id,
        assetType: { in: ['audiobook_chapter', 'audiobook_complete'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch the most recent generate_audiobook job for this book
    const job = await db.job.findFirst({
      where: {
        bookId,
        ownerId: profile.id,
        jobType: 'generate_audiobook',
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        book: { id: book.id, title: book.title },
        assets: assets.map((a) => ({
          id: a.id,
          assetType: a.assetType,
          publicUrl: a.publicUrl,
          metadata: (() => {
            try {
              return JSON.parse(a.metadata);
            } catch {
              return {};
            }
          })(),
          createdAt: a.createdAt,
        })),
        job: job
          ? {
              id: job.id,
              status: job.status,
              progressMessage: job.progressMessage,
              progressPercent: job.progressPercent,
              errorMessage: job.errorMessage,
              result: (() => {
                try {
                  return job.result ? JSON.parse(job.result) : null;
                } catch {
                  return null;
                }
              })(),
              startedAt: job.startedAt,
              completedAt: job.completedAt,
              createdAt: job.createdAt,
            }
          : null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/audiobook/:bookId] GET failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { bookId } = await params;
    const email = await getAuthEmail(request);
    const profile = await getOrCreateProfile(email);

    const book = await db.book.findUnique({
      where: { id: bookId, ownerId: profile.id },
    });

    if (!book) {
      return NextResponse.json({ success: false, error: 'Book not found' }, { status: 404 });
    }

    if (book.status !== 'completed') {
      return NextResponse.json({ success: false, error: 'Book must be completed before generating audiobook' }, { status: 400 });
    }

    // 1. Estimate credits (Spec: 50 base + 1 per minute)
    // Rough estimate: 150 words per minute
    const totalWords = book.chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
    const estimatedMinutes = Math.ceil(totalWords / 150);
    const estimatedCredits = 50 + estimatedMinutes;

    // 2. Create Job Record
    const jobId = await jobQueue.createJob({
      bookId,
      ownerId: profile.id,
      jobType: 'generate_audiobook',
      creditsReserved: estimatedCredits,
    });

    // 3. Reserve Credits
    const reserved = await reserveCredits(profile.id, estimatedCredits, jobId, 'Audiobook generation');
    if (!reserved) {
      return NextResponse.json({ success: false, error: 'Insufficient credits' }, { status: 402 });
    }

    // 4. Start the Worker
    await jobQueue.startJob(jobId, 'generate_audiobook', async () => {
      await generateAudiobookWorker(jobId);
    });

    return NextResponse.json({
      success: true,
      data: { jobId, estimatedCredits }
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/audiobook/:bookId] POST failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
