// HydraSkript - Books API Route
// POST /api/books - Create a new book
// GET /api/books - List user's books

import { getAuthEmail } from '@/lib/auth-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getOrCreateProfile } from '@/lib/utils/bookHelpers';
import { getBookDefaults, estimateBookCredits, estimateColoringBookCredits } from '@/lib/utils/credits';
import { CreateBookSchema, validateOrThrow } from '@/lib/llm/schema';
import { AUDIENCE_CONFIG } from '@/types';
import type { TargetAudience } from '@/types';

// POST - Create a new book
export async function POST(request: NextRequest) {
  try {
    const email = await getAuthEmail(request);
    if (!email) {
  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
}   
const profile = await getOrCreateProfile(email);

    const body = await request.json();
    console.log('[API] Create book request:', JSON.stringify(body));
    
    const input = validateOrThrow(CreateBookSchema, body);
    console.log('[API] Validated book input:', JSON.stringify(input));

    const targetAudience = input.targetAudience as TargetAudience;
    const defaults = getBookDefaults(targetAudience);
    const isChildrenBook = ['0-5', '6-9', '10-14'].includes(targetAudience);

    const isColoringBook = input.genre === 'coloring';

    // Estimate credits
    let estimatedCredits: number;
    if (isColoringBook) {
      estimatedCredits = estimateColoringBookCredits(
        input.chapterCount ?? defaults.chapterCount,
        input.coloringTheme ?? null
      );
    } else {
      estimatedCredits = estimateBookCredits(
        targetAudience,
        input.chapterCount ?? defaults.chapterCount,
        defaults.wordsPerChapter,
        isChildrenBook,
        false
      );
    }

    const book = await db.book.findUnique ({
      where: {
        id: params.id,
        ownerId: profile.id,
        title: input.title,
        genre: input.genre,
        targetAudience,
        maxPages: input.chapterCount ?? defaults.maxPages,
        coloringTheme: input.coloringTheme ?? null,
        adventureType: input.adventureType ?? null,
        characterNames: JSON.stringify(input.characterNames ?? []),
        styleProfileId: input.styleProfileId ?? null,
        status: 'draft',
        totalCreditsEstimated: estimatedCredits,
        outline: JSON.stringify({ requestedChapters: input.chapterCount ?? defaults.chapterCount }),
      },
    });

    console.log(`[API] Book created: ${book.id} - "${book.title}" (${book.genre}, ${book.targetAudience})`);

    return NextResponse.json({ success: true, data: book }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Create book failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

// GET - List user's books
export async function GET(request: NextRequest) {
  try {
    const email = await getAuthEmail(request);
    const profile = await getOrCreateProfile(email);

    const books = await db.book.findMany({
      where: { ownerId: profile.id },
      include: {
        chapters: {
          select: { id: true, index: true, title: true, status: true, wordCount: true, illustrationUrl: true },
          orderBy: { index: 'asc' },
        },
        styleProfile: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: books });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] List books failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
