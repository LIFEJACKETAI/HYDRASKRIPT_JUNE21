// HydraSkript - Auto-populate Story Bible & Universe (Editorial Review)
// Assembles the book's manuscript from chapters and triggers both
// the Story Bible extraction and Editorial Review pipelines.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jobQueue } from '@/lib/workers/queue';
import { enqueueEditorialReview } from '@/lib/services/editorialReview';
import { extractTextFromManuscript, truncateManuscript, SUPPORTED_MANUSCRIPT_EXTENSIONS } from '@/lib/manuscript';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';
import { assertBookOwnership } from '@/lib/story-bible-helpers';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_MANUSCRIPT_CHARS = 500000;

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);
    const body = await request.json();
    const { bookId } = body as { bookId: string };

    if (!bookId) {
      return NextResponse.json({ success: false, error: 'bookId is required' }, { status: 400 });
    }

    await assertBookOwnership(bookId, profile.id);

    // Assemble manuscript from book chapters
    const book = await db.book.findUnique({
      where: { id: bookId },
      include: {
        chapters: {
          where: { status: 'completed' },
          orderBy: { index: 'asc' },
          select: { index: true, title: true, content: true },
        },
      },
    });

    if (!book) {
      return NextResponse.json({ success: false, error: 'Book not found' }, { status: 404 });
    }

    const completedChapters = book.chapters.filter((c) => (c.content || '').trim().length > 0);
    if (completedChapters.length === 0) {
      return NextResponse.json(
        { success: false, error: 'This book has no completed chapters to analyze. Generate chapters first or upload a manuscript.' },
        { status: 400 }
      );
    }

    // Build manuscript text from chapters
    const manuscriptBlocks = completedChapters.map((ch) => {
      const label = `Chapter ${ch.index + 1}${ch.title ? `: ${ch.title}` : ''}`;
      return `${label}\n${ch.content.trim()}`;
    });
    const fullManuscript = manuscriptBlocks.join('\n\n');

    const truncatedManuscript = fullManuscript.length > MAX_MANUSCRIPT_CHARS
      ? fullManuscript.slice(0, MAX_MANUSCRIPT_CHARS)
      : fullManuscript;

    // Enqueue Story Bible import job
    const storyBibleJobId = await jobQueue.createJob({
      ownerId: profile.id,
      bookId,
      jobType: 'import_manuscript',
      creditsReserved: 0,
      maxRetries: 0,
      result: JSON.stringify({
        fileName: `${book.title} (assembled from chapters)`,
        text: truncatedManuscript,
        bookId,
        newBookCreated: false,
      }),
    });

    await jobQueue.startJob(storyBibleJobId, 'import_manuscript');

    // Enqueue Editorial Review (Universe) job
    let editorialReviewId: string | null = null;
    try {
      editorialReviewId = await enqueueEditorialReview({
        ownerId: profile.id,
        bookId,
        scope: 'book',
        sourceLabel: book.title,
        sourceText: truncatedManuscript,
      });
    } catch (e) {
      console.warn('[AutoPopulate] Editorial review enqueue failed (non-fatal):', e);
    }

    return NextResponse.json({
      success: true,
      data: {
        storyBibleJobId,
        editorialReviewId,
      },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }
    if (error instanceof Error && (error.message === 'Book not found' || error.message === 'Forbidden')) {
      return NextResponse.json(
        {
          success: false,
          error:
            error.message === 'Book not found'
              ? 'That book no longer exists. Refresh and try again.'
              : 'You do not have access to that book.',
        },
        { status: error.message === 'Book not found' ? 404 : 403 }
      );
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/story-bible/auto-populate] Failed:', message, error instanceof Error ? error.stack : '');
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}