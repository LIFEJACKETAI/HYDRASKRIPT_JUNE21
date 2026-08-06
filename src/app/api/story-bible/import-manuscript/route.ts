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

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);

    const formData = await request.formData();
    const bookId = formData.get('bookId');
    const file = formData.get('file');

    if (typeof bookId !== 'string' || !bookId) {
      return NextResponse.json({ success: false, error: 'bookId is required' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'A manuscript file is required.' }, { status: 400 });
    }

    await assertBookOwnership(bookId, profile.id);

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

    console.log(`[API/story-bible/import-manuscript] Parsing "${file.name}" (${manuscript.length} chars) for book ${bookId}`);

    const validated = await askLLMJSONWithFallback<unknown>(
      getManuscriptImportPrompt(),
      manuscript,
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

    return NextResponse.json({
      success: true,
      data: {
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
