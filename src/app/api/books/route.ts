// HydraSkript - Books API Route
// POST /api/books - Create a new book
// GET /api/books - List user's books

import { getAuthEmail } from '@/lib/auth-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getOrCreateProfile, listUserBooks } from '@/lib/utils/bookHelpers';

/**
 * GET /api/books
 * List all books owned by the authenticated user.
 */
export async function GET(request: NextRequest) {
  try {
    const email = await getAuthEmail(request);
    if (!email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await getOrCreateProfile(email);
    const books = await listUserBooks(profile.id);

    return NextResponse.json({ success: true, data: books });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] List books failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/books
 * Create a new book for the authenticated user.
 */
export async function POST(request: NextRequest) {
  try {
    const email = await getAuthEmail(request);
    if (!email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      genre = 'fiction',
      targetAudience = 'adult',
      styleProfileId,
      characterNames = [],
      outline = '{}'
    } = body;

    if (!title) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    }

    // Ensure characterNames is always a string[] (Prisma Postgres array field)
    const parsedCharacterNames: string[] = Array.isArray(characterNames)
      ? characterNames
      : typeof characterNames === 'string'
        ? (() => { try { const p = JSON.parse(characterNames); return Array.isArray(p) ? p : []; } catch { return []; } })()
        : [];

    const profile = await getOrCreateProfile(email);

    const book = await db.book.create({
      data: {
        title,
        genre,
        targetAudience,
        styleProfileId,
        characterNames: parsedCharacterNames,
        outline,
        ownerId: profile.id,
      },
    });

    return NextResponse.json({ success: true, data: book }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Create book failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
