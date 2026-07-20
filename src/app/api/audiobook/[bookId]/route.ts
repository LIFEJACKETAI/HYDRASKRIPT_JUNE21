// HydraSkript - Audiobook Assets API Route
// GET /api/audiobook/:bookId - Retrieve audiobook assets and job for a book
// POST /api/audiobook/:bookId - Start audiobook generation

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jobQueue } from '@/lib/workers/queue';
import { reserveCredits } from '@/lib/utils/credits';
import { generateAudiobookWorker } from '@/lib/workers/generateAudiobookWorker';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { bookId } = await params;
    const { profile } = await requireProfile(request);

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

    const assets = await db.mediaAsset.findMany({
      where: {
        bookId,
        ownerId: profile.id,
        assetType: { in: ['audiobook_chapter', 'audiobook_complete'] },
      },
      orderBy: { createdAt: 'desc' },
    });

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
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }

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
    const { profile } = await requireProfile(request);

    const book = await db.book.findUnique({
      where: { id: bookId, ownerId: profile.id },
      include: {
        chapters: {
          select: { wordCount: true },
        },
      },
    });

    if (!book) {
      return NextResponse.json({ success: false, error: 'Book not found' }, { status: 404 });
    }

    if (book.status !== 'completed') {
      return NextResponse.json({ success: false, error: 'Book must be completed before generating audiobook' }, { status: 400 });
    }

    const totalWords = book.chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
    const estimatedMinutes = Math.ceil(totalWords / 150);
    const estimatedCredits = 50 + estimatedMinutes;

    const jobId = await jobQueue.createJob({
      bookId,
      ownerId: profile.id,
      jobType: 'generate_audiobook',
      creditsReserved: estimatedCredits,
    });

    const reserved = await reserveCredits(profile.id, estimatedCredits, jobId, 'Audiobook generation');
    if (!reserved) {
      return NextResponse.json({ success: false, error: 'Insufficient credits' }, { status: 402 });
    }

    await jobQueue.startJob(jobId, 'generate_audiobook', async () => {
      await generateAudiobookWorker(jobId);
    });

    return NextResponse.json({
      success: true,
      data: { jobId, estimatedCredits },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/audiobook/:bookId] POST failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
