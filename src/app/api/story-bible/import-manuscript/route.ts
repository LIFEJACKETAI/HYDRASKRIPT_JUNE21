// HydraSkript - Story Bible Manuscript Import API
// POST uploads a manuscript and runs the AI extraction as an ASYNC queue job
// (returns jobId immediately; UI polls GET ?jobId=). WHY ASYNC: mining a full
// book needs many LLM calls (one per ~36k-char window) and 5-15 minutes, far
// beyond any serverless budget — the old synchronous path was killed by
// "Vercel Runtime Timeout Error: Task timed out after 300 seconds" and the
// Story Bible stayed empty. Gateway: src/lib/workers/importManuscriptWorker.ts.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';
import { assertBookOwnership } from '@/lib/story-bible-helpers';
import { extractTextFromManuscript, SUPPORTED_MANUSCRIPT_EXTENSIONS, truncateManuscript } from '@/lib/manuscript';
import { isUuid } from '@/lib/uuid';

export const dynamic = 'force-dynamic';
// Enqueue path is cheap now (text extraction only, no LLM work in-request).
export const maxDuration = 30;

// Vercel caps serverless request bodies at 4.5 MB; keep the app-side cap below
// it so oversized files get a friendly error instead of an opaque platform 413.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
// Whole-book analysis budget (matches the editorial-review pipeline).
const MAX_MANUSCRIPT_CHARS = 500000;

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);

    const formData = await request.formData();
    const bookIdRaw = formData.get('bookId');
    const file = formData.get('file');

    const bookId = typeof bookIdRaw === 'string' && bookIdRaw ? bookIdRaw : null;

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'A manuscript file is required.' }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — this hosting accepts manuscripts up to 4 MB. Try splitting the file into parts, converting to .txt, or trimming it.` },
        { status: 413 }
      );
    }

    // If no bookId provided, auto-create a Draft Book from the manuscript.
    let resolvedBookId = bookId;
    let newBookCreated = false;
    if (!resolvedBookId) {
      const titleFromFilename = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Untitled Manuscript';
      const newBook = await db.book.create({
        data: {
          title: titleFromFilename,
          genre: 'fiction',
          targetAudience: 'adult',
          status: 'draft',
          ownerId: profile.id,
        },
      });
      resolvedBookId = newBook.id;
      newBookCreated = true;
      console.log(`[API/story-bible/import-manuscript] Auto-created draft book "${titleFromFilename}" (${newBook.id})`);
    } else {
      await assertBookOwnership(resolvedBookId, profile.id);
    }

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!SUPPORTED_MANUSCRIPT_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { success: false, error: 'Unsupported manuscript type. Please upload a .txt, .pdf, or .docx file.' },
        { status: 400 }
      );
    }

    // Text extraction is fast and local (no LLM) — fine to do in-request. The
    // LLM mining happens later, in the queue worker.
    const rawText = await extractTextFromManuscript(file, extension);
    const manuscript = truncateManuscript(rawText, MAX_MANUSCRIPT_CHARS);

    if (!manuscript) {
      return NextResponse.json(
        { success: false, error: `Uploaded ${extension.toUpperCase()} manuscript did not contain readable text.` },
        { status: 400 }
      );
    }

    console.log(
      `[API/story-bible/import-manuscript] Enqueuing async import of "${file.name}" (${manuscript.length} chars) for book ${resolvedBookId}`
    );

    // Enqueue the actual mining work. `maxRetries: 0` — the worker re-queues
    // itself between batches and checkpoints after every window, so retries
    // would only duplicate a batch that already reached its checkpoint.
    const { getJobQueue } = await import('@/lib/workers/queue');
    const jobQueue = getJobQueue();
    const jobId = await jobQueue.createJob({
      ownerId: profile.id,
      bookId: resolvedBookId,
      jobType: 'import_manuscript',
      creditsReserved: 0,
      maxRetries: 0,
      result: JSON.stringify({
        fileName: file.name,
        text: manuscript,
        bookId: resolvedBookId,
        newBookCreated,
      }),
    });

    await jobQueue.startJob(jobId, 'import_manuscript');

    return NextResponse.json({
      success: true,
      data: {
        jobId,
        fileName: file.name,
        bookId: resolvedBookId,
        newBookCreated,
        async: true,
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
    console.error('[API/story-bible/import-manuscript] Failed:', message, error instanceof Error ? error.stack : '');
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * Poll endpoint used by the dashboard while the import job runs.
 * GET /api/story-bible/import-manuscript?jobId=<uuid>
 * - queued/active -> { status, progressMessage, progressPercent }
 * - completed     -> { status, data: ManuscriptImportResult } (the same shape
 *                    the synchronous path used to return, so the UI is unchanged)
 * - failed        -> { status, error }
 */
export async function GET(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);
    const jobId = request.nextUrl.searchParams.get('jobId');

    if (!jobId || !isUuid(jobId)) {
      return NextResponse.json({ success: false, error: 'A valid jobId is required.' }, { status: 400 });
    }

    const job = await db.job.findUnique({ where: { id: jobId } });
    if (!job || job.ownerId !== profile.id) {
      return NextResponse.json({ success: false, error: 'Import job not found.' }, { status: 404 });
    }

    if (job.status === 'completed') {
      let result: unknown = {};
      try {
        result = JSON.parse(job.result);
      } catch {
        result = {};
      }
      return NextResponse.json({ success: true, status: 'completed', data: result });
    }

    if (job.status === 'failed') {
      return NextResponse.json({
        success: false,
        status: 'failed',
        error: job.errorMessage || 'The manuscript import failed. Please try again.',
      });
    }

    return NextResponse.json({
      success: true,
      status: job.status,
      progressMessage: job.progressMessage,
      progressPercent: job.progressPercent,
    });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/story-bible/import-manuscript] GET failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}