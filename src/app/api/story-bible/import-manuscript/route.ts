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

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);

    const formData = await request.formData();
    const providedBookId = formData.get('bookId');
    const file = formData.get('file');
    const titleHint = formData.get('title');

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

    const hasBookId = typeof providedBookId === 'string' && providedBookId.length > 0;
    if (hasBookId) {
      await assertBookOwnership(providedBookId as string, profile.id);
    }

    const rawText = await extractTextFromManuscript(file, extension);
    const manuscript = truncateManuscript(rawText);

    if (!manuscript) {
      return NextResponse.json(
        { success: false, error: `Uploaded ${extension.toUpperCase()} manuscript did not contain readable text.` },
        { status: 400 }
      );
    }

    console.log(`[API/story-bible/import-manuscript] Parsing "${file.name}" (${manuscript.length} chars)${hasBookId ? ` for book ${providedBookId}` : ' as standalone Story Bible'}`);

    const validated = await askLLMJSONWithFallback<unknown>(
      getManuscriptImportPrompt(),
      manuscript,
      0.2
    );

    const parsed = validateOrThrow(ManuscriptImportSchema, validated);

    // Cap entity count to avoid runaway imports.
    const entities = parsed.entities.slice(0, 60);

    // A manuscript can be imported into an existing platform book, OR uploaded
    // standalone (no bookId). Standalone uploads get their own "Story Bible"
    // container book so they appear in the Story Bibles dropdown without the
    // user first having to generate a book. The container is created only AFTER
    // successful extraction so a parse failure never leaves an empty book.
    let bookId: string;
    let createdBook = false;
    let bookTitle = '';

    if (hasBookId) {
      bookId = providedBookId as string;
    } else {
      const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      bookTitle =
        (typeof titleHint === 'string' && titleHint.trim()) ||
        (baseName ? baseName : 'Imported Manuscript');

      const book = await db.book.create({
        data: {
          ownerId: profile.id,
          title: bookTitle,
          description: `Story Bible imported from uploaded manuscript "${file.name}".`,
          genre: 'fiction',
          targetAudience: 'adult',
          status: 'bible_imported',
          // Marker consumed by the Story Bible UI to label these entries.
          outline: JSON.stringify({ storyBibleImport: true, sourceFile: file.name }),
        },
        select: { id: true, title: true },
      });
      bookId = book.id;
      createdBook = true;
      console.log(`[API/story-bible/import-manuscript] Created standalone Story Bible "${book.title}" (${bookId})`);
    }

    const created = await db.$transaction(
      entities.map((entity) =>
        db.storyBibleEntity.create({
          data: {
            ownerId: profile.id,
            bookId,
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
        bookId,
        scope: 'manuscript',
        sourceLabel: file.name,
        sourceText: manuscript,
      });
      console.log(`[Universe] Auto-enqueued editorial review for uploaded manuscript (book ${bookId})`);
    } catch (e) {
      console.error('[Universe] Auto-review enqueue failed (non-fatal):', e);
    }

    return NextResponse.json({
      success: true,
      data: {
        bookId,
        createdBook,
        bookTitle,
        fileName: file.name,
        entities: created.map(toDTO),
        counts,
        total: created.length,
      },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/story-bible/import-manuscript] Failed:', message, error instanceof Error ? error.stack : '');
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
