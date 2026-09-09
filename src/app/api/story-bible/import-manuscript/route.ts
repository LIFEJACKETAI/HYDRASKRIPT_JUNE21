// HydraSkript - Story Bible Manuscript Import API
// POST /api/story-bible/import-manuscript
// Upload a manuscript (.txt/.pdf/.docx) and parse it into Story Bible entities.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';
import { assertBookOwnership, toDTO } from '@/lib/story-bible-helpers';
import { extractTextFromManuscript, SUPPORTED_MANUSCRIPT_EXTENSIONS, truncateManuscript } from '@/lib/manuscript';
import { extractEntitiesFromManuscript } from '@/lib/story-bible-extraction';
import { enqueueEditorialReview } from '@/lib/services/editorialReview';

// Entity extraction walks the WHOLE manuscript in overlapping windows and runs
// one LLM call per window (see src/lib/story-bible-extraction.ts). Without
// these exports the platform default function timeout kills the request
// mid-LLM-call and the browser reports `504` + `Failed to fetch`.
// NOTE: `maxDuration` is only honored on platforms that support it (Vercel Pro+
// and self-hosted). On Vercel Hobby this route is still hard-capped at 60s, so
// large manuscripts can be killed mid-LLM-call there regardless of this value.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Fail fast on oversized uploads instead of hanging until the proxy times out.
// Vercel deployments hard-cap serverless request payloads at 4.5 MB — a larger
// body never reaches this route (the platform rejects it first with an opaque
// 413), so the app-side cap must sit under that limit to show a friendly error.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
// Whole-book analysis budget (matches the editorial-review pipeline): the full
// text up to this length is mined for entities — NOT just the opening chapters.
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

    const rawText = await extractTextFromManuscript(file, extension);
    const manuscript = truncateManuscript(rawText, MAX_MANUSCRIPT_CHARS);

    if (!manuscript) {
      return NextResponse.json(
        { success: false, error: `Uploaded ${extension.toUpperCase()} manuscript did not contain readable text.` },
        { status: 400 }
      );
    }

    console.log(`[API/story-bible/import-manuscript] Parsing "${file.name}" (${manuscript.length} chars) for book ${resolvedBookId}`);

    // Extract entities across the ENTIRE manuscript — every chapter, not just
    // the opening scenes. The extractor windows the text, mines each window
    // with the LLM (telling it what was already captured), and merges the
    // results by kind + name. Windows that fail are logged and skipped rather
    // than voiding the whole import.
    const extraction = await extractEntitiesFromManuscript(manuscript);
    for (const warning of extraction.warnings) {
      console.warn(`[API/story-bible/import-manuscript] ${warning}`);
    }
    const entities = extraction.entities;

    // Re-imports are safe: skip entities already captured for this book so a
    // retry (or a fix like a wider extraction pass) never duplicates entries.
    let duplicatesSkipped = 0;
    let entitiesToCreate = entities;
    if (!newBookCreated) {
      const existing = await db.storyBibleEntity.findMany({
        where: { bookId: resolvedBookId! },
        select: { kind: true, name: true },
      });
      const seen = new Set(existing.map((e) => `${e.kind}:${e.name.toLowerCase().trim()}`));
      entitiesToCreate = entities.filter(
        (e) => !seen.has(`${e.kind}:${e.name.toLowerCase().trim()}`)
      );
      duplicatesSkipped = entities.length - entitiesToCreate.length;
      if (duplicatesSkipped > 0) {
        console.log(
          `[API/story-bible/import-manuscript] Skipped ${duplicatesSkipped}/${entities.length} entities already present in book ${resolvedBookId}`
        );
      }
    }

    if (entitiesToCreate.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          fileName: file.name,
          entities: [],
          counts: {},
          total: 0,
          duplicatesSkipped,
          portionsSkipped: extraction.windowsFailed,
          truncated: extraction.truncatedChars,
        },
      });
    }

    const created = await db.$transaction(
      entitiesToCreate.map((entity) =>
        db.storyBibleEntity.create({
          data: {
            ownerId: profile.id,
            bookId: resolvedBookId!,
            kind: entity.kind,
            name: entity.name.trim(),
            role: entity.role,
            summary: entity.summary,
            motivation: entity.motivation,
            description: entity.description,
            physicalTraits: JSON.stringify({ tags: entity.tags, notes: '' }),
            secrets: JSON.stringify({ confidential: '', isPrivate: true }),
          },
        })
      )
    );

    const counts = created.reduce<Record<string, number>>((acc, entity) => {
      acc[entity.kind] = (acc[entity.kind] ?? 0) + 1;
      return acc;
    }, {});

    console.log(`[API/story-bible/import-manuscript] Created ${created.length} entities for "${file.name}"`, counts);

    // Auto-populate the Universe (Editorial Review) for this uploaded manuscript.
    // Non-fatal — never blocks the import response.
    try {
      await enqueueEditorialReview({
        ownerId: profile.id,
        bookId: resolvedBookId!,
        scope: 'manuscript',
        sourceLabel: file.name,
        sourceText: manuscript,
      });
      console.log(`[Universe] Auto-enqueued editorial review for uploaded manuscript (book ${resolvedBookId})`);
    } catch (e) {
      console.error('[Universe] Auto-review enqueue failed (non-fatal):', e);
    }

    return NextResponse.json({
      success: true,
      data: {
        fileName: file.name,
        entities: created.map(toDTO),
        counts,
        total: created.length,
        duplicatesSkipped,
        portionsSkipped: extraction.windowsFailed,
        truncated: extraction.truncatedChars,
        ...(newBookCreated ? { bookId: resolvedBookId } : {}),
      },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    // Always log the full chain — the browser only ever sees a generic 500 body,
    // so the server console is the ONLY place the real reason is recorded.
    console.error('[API/story-bible/import-manuscript] Failed:', message, error instanceof Error ? error.stack : '');

    // Let the client show the actual failure reason (missing AI keys, DB
    // schema drift, etc.) instead of masking everything behind "500".
    if (
      message.startsWith('Text generation failed') ||
      message.startsWith('Validation error') ||
      message.includes('OPENROUTER_API_KEY') ||
      message.includes('GOOGLE_AI_API_KEY') ||
      message.includes('NVIDIA_NIM_API_KEY') ||
      message.includes('NIM_API_KEY')
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `The AI assistant could not process that manuscript right now. ${message}`,
        },
        { status: 502 }
      );
    }

    // Not-found/ownership errors are the caller's mistake, not a server fault.
    if (message.startsWith('No story bible entities could be extracted')) {
      return NextResponse.json(
        {
          success: false,
          error: 'The AI could not identify any story bible entities in that manuscript. Try a .txt file or a shorter portion of the book.',
        },
        { status: 422 }
      );
    }
    if (message === 'Book not found') {
      return NextResponse.json({ success: false, error: 'That book no longer exists. Refresh and try again.' }, { status: 404 });
    }
    if (message === 'Forbidden') {
      return NextResponse.json({ success: false, error: 'You do not have access to that book.' }, { status: 403 });
    }
    // If the DB rejected the write (relation/column missing = schema drift),
    // name the real cause instead of a bare 500.
    if (/relation .* does not exist|column .* does not exist|P2021|P2022|P2010|P2003|P2002/i.test(message)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The database is missing a table or column this feature needs. Run `npm run db:push` (or `prisma migrate deploy`) against the production database, then retry.',
        },
        { status: 500 }
      );
    }

    const isTimeout =
      message.includes('timed out') ||
      message.includes('aborted') ||
      (error instanceof Error && error.name === 'AbortError');
    if (isTimeout) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The AI took too long to read that manuscript and the request timed out. Try a smaller file (or .txt instead of .pdf), then try again.',
        },
        { status: 504 }
      );
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
