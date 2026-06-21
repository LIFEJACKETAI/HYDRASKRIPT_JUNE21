// HydraSkript - Book Detail API Route
// GET /api/books/[id] - Get book details
// PUT /api/books/[id] - Update book details
// DELETE /api/books/[id] - Delete a book

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getOrCreateProfile, deleteBook } from '@/lib/utils/bookHelpers';

function getAuthEmail(request: NextRequest): string {
  return request.headers.get('x-user-email') || 'demo@hydraskript.com';
}

// GET - Get book details with chapters
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const email = getAuthEmail(request);
    const profile = await getOrCreateProfile(email);

    const book = await db.book.findUnique({
      where: { id, ownerId: profile.id },
      include: {
        chapters: {
          orderBy: { index: 'asc' },
        },
        styleProfile: {
          select: { id: true, name: true, systemPrompt: true },
        },
        jobs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        mediaAssets: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!book) {
      return NextResponse.json({ success: false, error: 'Book not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: book });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Get book failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT - Update book details
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const email = getAuthEmail(request);
    const profile = await getOrCreateProfile(email);

    const body = await request.json();
    const book = await db.book.update({
      where: { id, ownerId: profile.id },
      data: {
        ...(body.title && { title: body.title }),
        ...(body.genre && { genre: body.genre }),
        ...(body.targetAudience && { targetAudience: body.targetAudience }),
        ...(body.styleProfileId !== undefined && { styleProfileId: body.styleProfileId }),
      },
    });

    return NextResponse.json({ success: true, data: book });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Update book failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

// DELETE - Delete a book
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const email = getAuthEmail(request);
    const profile = await getOrCreateProfile(email);

    const deleted = await deleteBook(id, profile.id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Book not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Delete book failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
