// HydraSkript - Story Bible Manuscript Import API
// POST uploads a manuscript and runs the AI extraction as an ASYNC queue job
// (returns jobId immediately; UI polls GET ?jobId=). WHY ASYNC: mining a full
// book needs many LLM calls (one per ~36k-char window) and 5-15 minutes, far
// beyond any serverless budget — the old synchronous path was killed by
// "Vercel Runtime Timeout Error: Task timed out after 300 seconds" and the
// Story Bible stayed empty. Gateway: src/lib/workers/importManuscriptWorker.ts.
//
// Supports two upload modes:
// 1. Direct upload (multipart/form-data with `file`) — for files ≤ 4 MB
// 2. Presigned URL upload (JSON with `storagePath`) — for files up to 25 MB

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';
import { assertBookOwnership } from '@/lib/story-bible-helpers';
import { extractTextFromManuscript, extractTextFromBuffer, SUPPORTED_MANUSCRIPT_EXTENSIONS, truncateManuscript } from '@/lib/manuscript';
import { isUuid } from '@/lib/uuid';
import { supabaseAdmin } from '@/lib/supabase';
import { getR2Client, isR2Enabled, getR2PublicUrl } from '@/lib/utils/storage';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';
// Enqueue path is cheap now (text extraction only, no LLM work in-request).
export const maxDuration = 30;

// Vercel caps serverless request bodies at 4.5 MB; keep the app-side cap below
// it so oversized files get a friendly error instead of an opaque platform 413.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
// Whole-book analysis budget (matches the editorial-review pipeline).
const MAX_MANUSCRIPT_CHARS = 500000;
// Maximum file size for presigned URL uploads
const MAX_PRESIGNED_FILE_SIZE = 25 * 1024 * 1024;

async function downloadFromStorage(storagePath: string): Promise<Buffer> {
  const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET || 'hydraskript-assets';
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Try Supabase Storage first
  if (supabaseUrl && supabaseServiceKey) {
    const { data, error } = await supabaseAdmin.storage
      .from(supabaseBucket)
      .download(storagePath);

    if (!error && data) {
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    console.warn('[ImportManuscript] Supabase download failed, trying R2:', error?.message);
  }

  // Try R2
  if (isR2Enabled()) {
    const r2Client = getR2Client();
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_KEY!,
      Key: storagePath,
    });
    const response = await r2Client.send(command);
    if (response.Body) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    }
  }

  // Local filesystem fallback
  const fs = await import('fs');
  const path = await import('path');
  const STORAGE_DIR = path.join(process.cwd(), 'public', 'assets');
  const filePath = path.join(STORAGE_DIR, storagePath);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath);
  }

  throw new Error(`File not found in any storage: ${storagePath}`);
}

async function processManuscriptUpload(
  profileId: string,
  fileName: string,
  extension: string,
  fileBuffer: Buffer,
  bookId: string | null,
  storagePath?: string
): Promise<{ jobId: string; resolvedBookId: string; newBookCreated: boolean }> {
  // If no bookId provided, auto-create a Draft Book from the manuscript.
  let resolvedBookId = bookId;
  let newBookCreated = false;
  if (!resolvedBookId) {
    const titleFromFilename = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Untitled Manuscript';
    const newBook = await db.book.create({
      data: {
        title: titleFromFilename,
        genre: 'fiction',
        targetAudience: 'adult',
        status: 'draft',
        ownerId: profileId,
      },
    });
    resolvedBookId = newBook.id;
    newBookCreated = true;
    console.log(`[API/story-bible/import-manuscript] Auto-created draft book "${titleFromFilename}" (${newBook.id})`);
  } else {
    await assertBookOwnership(resolvedBookId, profileId);
  }

  if (!SUPPORTED_MANUSCRIPT_EXTENSIONS.has(extension)) {
    throw new Error('Unsupported manuscript type. Please upload a .txt, .pdf, or .docx file.');
  }

  // Text extraction is fast and local (no LLM) — fine to do in-request. The
  // LLM mining happens later, in the queue worker.
  const rawText = await extractTextFromBuffer(fileBuffer, extension);
  const manuscript = truncateManuscript(rawText, MAX_MANUSCRIPT_CHARS);

  if (!manuscript) {
    throw new Error(`Uploaded ${extension.toUpperCase()} manuscript did not contain readable text.`);
  }

  console.log(
    `[API/story-bible/import-manuscript] Enqueuing async import of "${fileName}" (${manuscript.length} chars) for book ${resolvedBookId}`
  );

  // Enqueue the actual mining work. `maxRetries: 0` — the worker re-queues
  // itself between batches and checkpoints after every window, so retries
  // would only duplicate a batch that already reached its checkpoint.
  const { getJobQueue } = await import('@/lib/workers/queue');
  const jobQueue = getJobQueue();
  const jobId = await jobQueue.createJob({
    ownerId: profileId,
    bookId: resolvedBookId,
    jobType: 'import_manuscript',
    creditsReserved: 0,
    maxRetries: 0,
    result: JSON.stringify({
      fileName,
      text: manuscript,
      bookId: resolvedBookId,
      newBookCreated,
      storagePath,
    }),
  });

  await jobQueue.startJob(jobId, 'import_manuscript');

  return { jobId, resolvedBookId, newBookCreated };
}

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);

    const contentType = request.headers.get('content-type') || '';

    // Mode 1: Direct multipart upload (small files ≤ 4 MB)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const bookIdRaw = formData.get('bookId');
      const file = formData.get('file');
      const storagePath = formData.get('storagePath') as string | null;

      const bookId = typeof bookIdRaw === 'string' && bookIdRaw ? bookIdRaw : null;

      if (!(file instanceof File)) {
        return NextResponse.json({ success: false, error: 'A manuscript file is required.' }, { status: 400 });
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { success: false, error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — this hosting accepts direct uploads up to 4 MB. For larger files (up to 25 MB), use the presigned URL upload.` },
          { status: 413 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      const { jobId, resolvedBookId, newBookCreated } = await processManuscriptUpload(
        profile.id,
        file.name,
        file.name.split('.').pop()?.toLowerCase() ?? '',
        fileBuffer,
        bookId,
        storagePath ?? undefined
      );

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
    } catch (uploadError) {
      const msg = uploadError instanceof Error ? uploadError.message : String(uploadError);
      console.error('[API/story-bible/import-manuscript] Direct upload failed:', msg, uploadError instanceof Error ? uploadError.stack : '');
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
    }

    // Mode 2: Presigned URL upload (JSON with storagePath) — for files up to 25 MB
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const { bookId, storagePath, fileName, fileSize } = body as {
        bookId?: string;
        storagePath: string;
        fileName: string;
        fileSize?: number;
      };

      if (!storagePath || typeof storagePath !== 'string') {
        return NextResponse.json({ success: false, error: 'storagePath is required for presigned URL uploads.' }, { status: 400 });
      }

      if (!fileName || typeof fileName !== 'string') {
        return NextResponse.json({ success: false, error: 'fileName is required.' }, { status: 400 });
      }

      if (fileSize && fileSize > MAX_PRESIGNED_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: `File size ${(fileSize / 1024 / 1024).toFixed(1)} MB exceeds the 25 MB limit.` },
          { status: 413 }
        );
      }

      const extension = fileName.split('.').pop()?.toLowerCase() ?? '';

      // Download file from storage
      let fileBuffer: Buffer;
      try {
        fileBuffer = await downloadFromStorage(storagePath);
      } catch (downloadError) {
        const msg = downloadError instanceof Error ? downloadError.message : 'Unknown download error';
        console.error('[ImportManuscript] Download from storage failed:', msg);
        return NextResponse.json(
          { success: false, error: `Failed to retrieve uploaded file from storage: ${msg}` },
          { status: 500 }
        );
      }

      const { jobId, resolvedBookId, newBookCreated } = await processManuscriptUpload(
        profile.id,
        fileName,
        extension,
        fileBuffer,
        bookId ?? null,
        storagePath
      );

      return NextResponse.json({
        success: true,
        data: {
          jobId,
          fileName,
          bookId: resolvedBookId,
          newBookCreated,
          async: true,
        },
      });
    } catch (uploadError) {
      const msg = uploadError instanceof Error ? uploadError.message : String(uploadError);
      console.error('[API/story-bible/import-manuscript] Presigned upload failed:', msg, uploadError instanceof Error ? uploadError.stack : '');
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }

    return NextResponse.json({ success: false, error: 'Unsupported content type. Use multipart/form-data or application/json.' }, { status: 400 });
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