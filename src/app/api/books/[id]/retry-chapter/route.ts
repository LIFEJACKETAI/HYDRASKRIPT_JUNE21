// HydraSkript - Chapter Retry API Route
// POST /api/books/[id]/retry-chapter - Retry a single failed chapter
//
// Recovery for the "Book: Writing / Chapter N: Failed" dead end. Resets the
// failed chapter to pending and enqueues a fresh write_chapter job, returning
// the new jobId so the progress UI can resume polling.

import { NextRequest, NextResponse } from 'next/server';
import { retryFailedChapter } from '@/lib/services/chapterRetry';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { profile } = await requireProfile(request);

    const body = await request.json().catch(() => ({}));
    const { chapterIndex } = body as { chapterIndex?: number };

    if (chapterIndex === undefined || chapterIndex === null) {
      return NextResponse.json(
        { success: false, error: 'chapterIndex is required' },
        { status: 400 }
      );
    }

    const data = await retryFailedChapter(id, profile.id, chapterIndex);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    const status =
      message === 'Book not found' || message.includes('not found') ? 404 : message === 'Only failed chapters can be retried' ? 400 : 500;
    console.error('[API] Chapter retry failed:', message);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
