// HydraSkript - Story Bible Manuscript Import API
// POST /api/story-bible/import-manuscript
//      Validates the upload, extracts its text, queues a `manuscript_import` job
//      and answers immediately with the job id.
// GET  /api/story-bible/import-manuscript/[jobId]
//      Progress + final result, for the client to poll.
//
// Why this is no longer synchronous: entity extraction is a single LLM call over
// the manuscript and routinely takes minutes. Vercel kills any invocation that
// passes its `maxDuration` and the browser just sees a bodyless `504` — the
// failure this endpoint used to have for every real manuscript (.pdf and .txt
// alike, because the LLM call, not the parser, was the slow part). The work now
// runs as a queued job and the client polls, exactly like /api/universe/review
// and /api/audiobook already do.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';
import { assertBookOwnership } from '@/lib/story-bible-helpers';
import {
  extractTextFromManuscript,
  manuscriptUploadLimitMessage,
  MAX_MANUSCRIPT_UPLOAD_BYTES,
  SUPPORTED_MANUSCRIPT_EXTENSIONS,
  truncateManuscript,
} from '@/lib/manuscript';
import { serializeManuscriptImportPayload } from '@/lib/manuscript-import';
import { jobQueue } from '@/lib/workers/queue';
import { runInBackground } from '@/lib/background';

export const dynamic = 'force-dynamic';

// The HTTP response itself goes out in ~1-2s, but the `after()` window that runs
// the import shares this invocation's budget, so it is set to the platform
// maximum (Vercel Hobby + Fluid Compute = 300s). The import service caps its own
// LLM chain at 240s so it always finishes — or fails cleanly — inside that.
export const maxDuration = 300;

const MISSING_JOB_TYPE_ERROR =
  'Manuscript imports are not enabled on this database yet: the "manuscript_import" job type is missing. ' +
  'Run scripts/sql/2026_09_08_add_manuscript_import_job_type.sql against the database ' +
  '(or `npx prisma migrate deploy`) and try again.';

function isMissingJobTypeError(message: string): boolean {
  return (
    message.includes('manuscript_import') &&
    /invalid input value for enum|22P02|Argument `jobType`|JobType/i.test(message)
  );
}

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);

    const formData = await request.formData();
    const bookIdRaw = formData.get('bookId');
    const file = formData.get('file');

    const bookId = typeof bookIdRaw === 'string' && bookIdRaw.trim() ? bookIdRaw.trim() : null;

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'A manuscript file is required.' }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ success: false, error: 'That file is empty.' }, { status: 400 });
    }

    // Vercel rejects a request body over 4.5 MB before this handler ever runs,
    // so this guard only fires on self-hosted deployments — keep both in sync.
    if (file.size > MAX_MANUSCRIPT_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: manuscriptUploadLimitMessage(file.size) },
        { status: 413 }
      );
    }

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!SUPPORTED_MANUSCRIPT_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { success: false, error: 'Unsupported manuscript type. Please upload a .txt, .pdf, or .docx file.' },
        { status: 400 }
      );
    }

    // Extract the text first: it is cheap and bounded, and doing it before any
    // writes means an unreadable upload never leaves an orphan draft Book behind
    // (the old code created the Book first and then burned 5 minutes per retry).
    const rawText = await extractTextFromManuscript(file, extension);
    const manuscript = truncateManuscript(rawText);

    if (!manuscript) {
      return NextResponse.json(
        { success: false, error: `Uploaded ${extension.toUpperCase()} manuscript did not contain readable text.` },
        { status: 400 }
      );
    }

    // If no bookId provided, auto-create a Draft Book from the manuscript.
    let resolvedBookId: string;
    let newBookCreated = false;
    if (!bookId) {
      const titleFromFilename =
        file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Untitled Manuscript';
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
      console.log(
        `[API/story-bible/import-manuscript] Auto-created draft book "${titleFromFilename}" (${newBook.id})`
      );
    } else {
      await assertBookOwnership(bookId, profile.id);
      resolvedBookId = bookId;
    }

    const jobId = await jobQueue.createJob({
      bookId: resolvedBookId,
      ownerId: profile.id,
      jobType: 'manuscript_import',
      creditsReserved: 0,
      maxRetries: 2,
      result: serializeManuscriptImportPayload({
        fileName: file.name,
        bookId: resolvedBookId,
        newBookCreated,
        text: manuscript,
      }),
    });

    console.log(
      `[API/story-bible/import-manuscript] Queued job ${jobId} for "${file.name}" ` +
      `(${manuscript.length} chars) → book ${resolvedBookId}`
    );

    // Answer first, then run the job. `after()` keeps this invocation alive once
    // the response has been flushed; without it a serverless platform freezes
    // the work the instant the client is answered.
    runInBackground('manuscript-import', () => jobQueue.drainOnce());

    return NextResponse.json({
      success: true,
      data: {
        jobId,
        bookId: resolvedBookId,
        newBookCreated,
        fileName: file.name,
        textLength: manuscript.length,
        status: 'queued',
        progressMessage: 'Queued...',
        progressPercent: 0,
      },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/story-bible/import-manuscript] Failed:', message, error instanceof Error ? error.stack : '');

    if (isMissingJobTypeError(message)) {
      return NextResponse.json({ success: false, error: MISSING_JOB_TYPE_ERROR }, { status: 503 });
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
