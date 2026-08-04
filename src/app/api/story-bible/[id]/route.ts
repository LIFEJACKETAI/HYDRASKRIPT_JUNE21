// HydraSkript - Story Bible entity by id
// GET    /api/story-bible/[id]
// PUT    /api/story-bible/[id]
// DELETE /api/story-bible/[id]

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';
import { isStoryBibleKind, toDTO } from '@/lib/story-bible-helpers';

async function loadOwnedEntity(id: string, ownerId: string) {
  const entity = await db.storyBibleEntity.findUnique({ where: { id } });
  if (!entity) return null;
  if (entity.ownerId !== ownerId) return 'forbidden' as const;
  return entity;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { profile } = await requireProfile(_request);
    const entity = await loadOwnedEntity(id, profile.id);
    if (!entity) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    if (entity === 'forbidden') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ success: true, data: toDTO(entity) });
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { profile } = await requireProfile(request);
    const entity = await loadOwnedEntity(id, profile.id);
    if (!entity) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    if (entity === 'forbidden') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));

    // Build a partial update — only allow known fields through
    const data: Record<string, unknown> = {};

    if (typeof body.name === 'string') data.name = body.name.trim() || entity.name;
    if (typeof body.role === 'string') data.role = body.role;
    if (typeof body.summary === 'string') data.summary = body.summary;
    if (typeof body.motivation === 'string') data.motivation = body.motivation;
    if (typeof body.description === 'string') data.description = body.description;
    if (typeof body.portraitUrl === 'string' || body.portraitUrl === null) {
      data.portraitUrl = body.portraitUrl;
    }

    if (body.kind && typeof body.kind === 'string' && isStoryBibleKind(body.kind)) {
      data.kind = body.kind;
    }

    if (body.physicalTraits && typeof body.physicalTraits === 'object') {
      const tags = Array.isArray(body.physicalTraits.tags)
        ? body.physicalTraits.tags.filter((t: unknown) => typeof t === 'string')
        : [];
      const notes = typeof body.physicalTraits.notes === 'string'
        ? body.physicalTraits.notes
        : '';
      data.physicalTraits = JSON.stringify({ tags, notes });
    }

    if (body.secrets && typeof body.secrets === 'object') {
      const confidential = typeof body.secrets.confidential === 'string'
        ? body.secrets.confidential
        : '';
      const isPrivate = Boolean(body.secrets.isPrivate);
      data.secrets = JSON.stringify({ confidential, isPrivate });
    }

    const updated = await db.storyBibleEntity.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, data: toDTO(updated) });
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] story-bible update failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { profile } = await requireProfile(request);
    const entity = await loadOwnedEntity(id, profile.id);
    if (!entity) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    if (entity === 'forbidden') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    await db.storyBibleEntity.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
