// HydraSkript - Books API Route
// POST /api/books - Create a new book
// GET /api/books - List user's books

import { getAuthEmail } from '@/lib/auth-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getOrCreateProfile } from '@/lib/utils/bookHelpers';

// GET /api/books/[id] - Get a single book
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const email = await getAuthEmail(request);
    if (!email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    
    const profile = await getOrCreateProfile(email);
    const bookId = params.id;

    const book = await db.book.findFirst({
      where: { 
        id: bookId,
        ownerId: profile.id  // ensures user can only see their own books
      },
      include: {
        chapters: {
          orderBy: { index: 'asc' },
        },
        styleProfile: true,
        jobs: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
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