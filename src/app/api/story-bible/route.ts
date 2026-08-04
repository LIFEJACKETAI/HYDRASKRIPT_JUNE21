// HydraSkript - Story Bible API
// GET  /api/story-bible?bookId=...&kind=...   list entities for a book
// POST /api/story-bible                       create a new entity

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';
import {
  STORY_BIBLE_KINDS,
  isStoryBibleKind,
  toDTO,
  assertBookOwnership,
  type StoryBibleKind,
} from '@/lib/story-bible-helpers';

export async function GET(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);

    const bookId = request.nextUrl.searchParams.get('bookId');
    const kind = request.nextUrl.searchParams.get('kind');

    if (!bookId) {
      return NextResponse.json(
        { success: false, error: 'bookId is required' },
        { status: 400 }
      );
    }

    await assertBookOwnership(bookId, profile.id);

    const where: { bookId: string; kind?: StoryBibleKind } = { bookId };
    if (kind && isStoryBibleKind(kind)) {
      where.kind = kind;
    }

    const entities = await db.storyBibleEntity.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: entities.map(toDTO),
    });
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] story-bible list failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);
    const body = await request.json().catch(() => ({}));

    const bookId = typeof body.bookId === 'string' ? body.bookId : null;
    const kind = typeof body.kind === 'string' ? body.kind : null;
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!bookId) {
      return NextResponse.json({ success: false, error: 'bookId is required' }, { status: 400 });
    }
    if (!kind || !isStoryBibleKind(kind)) {
      return NextResponse.json(
        { success: false, error: `kind must be one of: ${STORY_BIBLE_KINDS.join(', ')}` },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 });
    }

    await assertBookOwnership(bookId, profile.id);

    const traits = body.physicalTraits && typeof body.physicalTraits === 'object'
      ? {
          tags: Array.isArray(body.physicalTraits.tags)
            ? body.physicalTraits.tags.filter((t: unknown) => typeof t === 'string')
            : [],
          notes: typeof body.physicalTraits.notes === 'string' ? body.physicalTraits.notes : '',
        }
      : { tags: [], notes: '' };

    const secrets = body.secrets && typeof body.secrets === 'object'
      ? {
          confidential: typeof body.secrets.confidential === 'string' ? body.secrets.confidential : '',
          isPrivate: Boolean(body.secrets.isPrivate),
        }
      : { confidential: '', isPrivate: false };

    const created = await db.storyBibleEntity.create({
      data: {
        ownerId: profile.id,
        bookId,
        kind,
        name,
        role: typeof body.role === 'string' ? body.role : '',
        summary: typeof body.summary === 'string' ? body.summary : '',
        motivation: typeof body.motivation === 'string' ? body.motivation : '',
        description: typeof body.description === 'string' ? body.description : '',
        physicalTraits: JSON.stringify(traits),
        secrets: JSON.stringify(secrets),
        portraitUrl: typeof body.portraitUrl === 'string' ? body.portraitUrl : null,
      },
    });

    return NextResponse.json({ success: true, data: toDTO(created) });
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] story-bible create failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
