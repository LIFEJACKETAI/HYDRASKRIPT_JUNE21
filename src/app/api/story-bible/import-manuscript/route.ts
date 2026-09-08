// HydraSkript - Story Bible Manuscript Import API
// POST /api/story-bible/import-manuscript
// Upload a manuscript (.txt/.pdf/.docx) and parse it into Story Bible entities.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';
import { assertBookOwnership, toDTO } from '@/lib/story-bible-helpers';
import { extractTextFromManuscript, SUPPORTED_MANUSCRIPT_EXTENSIONS, truncateManuscript } from '@/lib/manuscript';
import { askLLMJSONWithFallback } from '@/lib/llm/fallback';
import { ManuscriptImportSchema, validateOrThrow } from '@/lib/llm/schema';
import { getManuscriptImportPrompt } from '@/lib/llm/prompts';
import { enqueueEditorialReview } from '@/lib/services/editorialReview';

// Entity extraction is a single synchronous LLM call over the manuscript text.
// Without these exports the platform default function timeout kills the request
// mid-LLM-call and the browser reports `504` + `Failed to fetch`.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Fail fast on oversized uploads instead of hanging until the proxy times out.
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
// Entity extraction quality plateaus early (the prompt asks for the most
// important entities first) while latency/cost scale with input length, so only
// the head of the manuscript is sent to the LLM. The full text is still passed
// to the background editorial review below.
const MAX_LLM_CHARS = 30000;

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
        { success: false, error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — please upload a manuscript under 15 MB (or paste it in as .txt).` },
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
    const manuscript = truncateManuscript(rawText);

    if (!manuscript) {
      return NextResponse.json(
        { success: false, error: `Uploaded ${extension.toUpperCase()} manuscript did not contain readable text.` },
        { status: 400 }
      );
    }

    console.log(`[API/story-bible/import-manuscript] Parsing "${file.name}" (${manuscript.length} chars) for book ${resolvedBookId}`);

    const manuscriptForLLM =
      manuscript.length > MAX_LLM_CHARS ? manuscript.slice(0, MAX_LLM_CHARS) : manuscript;

    const validated = await askLLMJSONWithFallback<unknown>(
      getManuscriptImportPrompt(),
      manuscriptForLLM,
      0.2
    );

    const parsed = validateOrThrow(ManuscriptImportSchema, validated);

    // Cap entity count to avoid runaway imports.
    const entities = parsed.entities.slice(0, 60);

    const created = await db.$transaction(
      entities.map((entity) =>
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
        ...(newBookCreated ? { bookId: resolvedBookId } : {}),
      },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/story-bible/import-manuscript] Failed:', message, error instanceof Error ? error.stack : '');

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
