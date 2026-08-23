// HydraSkript - Bookstore Listings API
// GET  /api/bookstore/listings?scope=mine|market   list listings
// POST /api/bookstore/listings                      create a listing (with file upload)

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';
import { saveFile, generateFilename } from '@/lib/utils/storage';

const SUPPORTED_LISTING_EXTENSIONS = new Set(['pdf', 'epub', 'mp3', 'm4b', 'txt', 'docx']);
const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500MB

export async function GET(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);
    const scope = request.nextUrl.searchParams.get('scope') ?? 'mine';

    const where =
      scope === 'market'
        ? { status: 'active' }
        : { ownerId: profile.id };

    const listings = await db.bookListing.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: scope === 'market' ? 100 : 200,
    });

    return NextResponse.json({ success: true, data: listings });
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/bookstore/listings] GET failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);

    const formData = await request.formData();
    const title = (formData.get('title') as string | null)?.trim();
    const author = (formData.get('author') as string | null)?.trim() ?? '';
    const description = (formData.get('description') as string | null) ?? '';
    const priceRaw = formData.get('price');
    const format = (formData.get('format') as string | null)?.trim() || 'ebook';
    const file = formData.get('file');

    if (!title) {
      return NextResponse.json({ success: false, error: 'Book title is required.' }, { status: 400 });
    }

    const price = typeof priceRaw === 'string' ? parseFloat(priceRaw) : NaN;
    if (isNaN(price) || price < 0) {
      return NextResponse.json({ success: false, error: 'A valid price (USD) is required.' }, { status: 400 });
    }

    if (!['ebook', 'audiobook', 'both'].includes(format)) {
      return NextResponse.json({ success: false, error: 'Invalid format selected.' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'A manuscript/audiobook file is required.' }, { status: 400 });
    }

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!SUPPORTED_LISTING_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { success: false, error: 'Unsupported file type. Please upload PDF, EPUB, MP3, M4B, TXT, or DOCX.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ success: false, error: 'File exceeds the 500MB limit.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storedName = generateFilename('listing', extension);
    const publicUrl = await saveFile('listings', storedName, buffer, {
      contentType: file.type || 'application/octet-stream',
    });

    const listing = await db.bookListing.create({
      data: {
        ownerId: profile.id,
        title,
        author,
        description,
        price,
        format,
        fileName: file.name,
        fileUrl: publicUrl,
        status: 'active',
      },
    });

    console.log(`[API/bookstore/listings] Created listing ${listing.id} ("${title}") for ${profile.id}`);

    return NextResponse.json({ success: true, data: listing });
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/bookstore/listings] POST failed:', message, error instanceof Error ? error.stack : '');
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
