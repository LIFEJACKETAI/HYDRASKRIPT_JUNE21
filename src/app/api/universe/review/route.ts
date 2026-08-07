// HydraSkript - Editorial Review API
// POST /api/universe/review   create a review (books and/or manuscript file)
// GET  /api/universe/review   list the caller's past reviews

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';
import { assertBookOwnership } from '@/lib/story-bible-helpers';
import { extractTextFromManuscript, SUPPORTED_MANUSCRIPT_EXTENSIONS } from '@/lib/manuscript';
import { assembleBooksManuscript, MAX_REVIEW_CHARS } from '@/lib/services/editorialReview';
import { jobQueue } from '@/lib/workers/queue';

function parseBookIds(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);

    const formData = await request.formData();
    const bookIds = parseBookIds(formData.get('bookIds'));
    const file = formData.get('file');
    const title = typeof formData.get('title') === 'string' ? (formData.get('title') as string).trim() : '';

    if (bookIds.length === 0 && !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'Select at least one book or upload a manuscript file to review.' },
        { status: 400 }
      );
    }

    let scope: 'book' | 'manuscript';
    let sourceLabel: string;
    let bookId: string | null = null;
    let sourceText: string;

    if (bookIds.length > 0) {
      for (const id of bookIds) {
        await assertBookOwnership(id, profile.id);
      }
      const text = await assembleBooksManuscript(bookIds, profile.id);
      if (!text.trim()) {
        return NextResponse.json(
          { success: false, error: 'Selected books have no chapter content to review.' },
          { status: 400 }
        );
      }
      scope = 'book';
      bookId = bookIds.length === 1 ? bookIds[0] : null;
      const books = await db.book.findMany({
        where: { id: { in: bookIds }, ownerId: profile.id },
        select: { title: true },
      });
      sourceLabel = title || (books.length === 1 ? books[0].title : `Multi-volume review (${books.length} volumes)`);
      sourceText = text;
    } else {
      if (!(file instanceof File)) {
        return NextResponse.json({ success: false, error: 'A manuscript file is required.' }, { status: 400 });
      }
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!SUPPORTED_MANUSCRIPT_EXTENSIONS.has(extension)) {
        return NextResponse.json(
          { success: false, error: 'Unsupported manuscript type. Please upload a .txt, .pdf, or .docx file.' },
          { status: 400 }
        );
      }
      const rawText = await extractTextFromManuscript(file, extension);
      if (!rawText.trim()) {
        return NextResponse.json(
          { success: false, error: 'The uploaded manuscript did not contain readable text.' },
          { status: 400 }
        );
      }
      scope = 'manuscript';
      sourceLabel = title || file.name;
      sourceText = rawText;
    }

    if (sourceText.length > MAX_REVIEW_CHARS) {
      sourceText = sourceText.slice(0, MAX_REVIEW_CHARS);
    }

    console.log(`[API/universe/review] Starting review of "${sourceLabel}" (${sourceText.length} chars, scope=${scope})`);

    const review = await db.editorialReview.create({
      data: {
        ownerId: profile.id,
        bookId,
        scope,
        sourceLabel,
        status: 'queued',
        sourceText,
        textLength: sourceText.length,
      },
    });

    const jobId = await jobQueue.createJob({
      bookId: bookId ?? undefined,
      ownerId: profile.id,
      jobType: 'editorial_review',
      creditsReserved: 0,
    });

    await db.editorialReview.update({ where: { id: review.id }, data: { jobId } });
    await jobQueue.startJob(jobId, 'editorial_review');

    return NextResponse.json({ success: true, data: { reviewId: review.id, jobId } });
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/universe/review] Create failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);

    const reviews = await db.editorialReview.findMany({
      where: { ownerId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { _count: { select: { findings: true } } },
    });

    return NextResponse.json({
      success: true,
      data: reviews.map((r) => ({
        id: r.id,
        bookId: r.bookId,
        scope: r.scope,
        sourceLabel: r.sourceLabel,
        status: r.status,
        textLength: r.textLength,
        errorMessage: r.errorMessage,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
        findingCount: r._count.findings,
      })),
    });
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/universe/review] List failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
