// HydraSkript - Bookstore Listings API
// GET  /api/bookstore/listings?scope=mine|market   list listings
// POST /api/bookstore/listings                      create a listing (with file upload)

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';
import { saveFile, deleteFile, generateFilename } from '@/lib/utils/storage';

const SUPPORTED_LISTING_EXTENSIONS = new Set(['pdf', 'epub', 'mp3', 'm4b', 'txt', 'docx']);
const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500MB
const SUPPORTED_COVER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_COVER_BYTES = 10 * 1024 * 1024; // 10MB
const COVER_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

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

    // Large files bypass the serverless payload limit via direct-to-storage
    // upload; such requests arrive as JSON with the pre-uploaded URLs.
    if ((request.headers.get('content-type') ?? '').includes('application/json')) {
      const body = await request.json() as {
        title?: string;
        author?: string;
        description?: string;
        price?: number | string;
        format?: string;
        fileName?: string;
        fileUrl?: string;
        coverUrl?: string | null;
      };

      const title = body.title?.trim();
      if (!title) {
        return NextResponse.json({ success: false, error: 'Book title is required.' }, { status: 400 });
      }
      if (typeof body.fileUrl !== 'string' || !body.fileUrl) {
        return NextResponse.json({ success: false, error: 'Uploaded file URL is required.' }, { status: 400 });
      }

      const price = typeof body.price === 'string' ? parseFloat(body.price) : Number(body.price);
      if (isNaN(price) || price < 0) {
        return NextResponse.json({ success: false, error: 'A valid price (USD) is required.' }, { status: 400 });
      }
      if (body.format && !['ebook', 'audiobook', 'both'].includes(body.format)) {
        return NextResponse.json({ success: false, error: 'Invalid format selected.' }, { status: 400 });
      }

      const listing = await db.bookListing.create({
        data: {
          ownerId: profile.id,
          title,
          author: body.author?.trim() ?? '',
          description: body.description ?? '',
          price,
          format: body.format || 'ebook',
          fileName: body.fileName ?? null,
          fileUrl: body.fileUrl,
          coverUrl: body.coverUrl ?? null,
          status: 'active',
        },
      });

      console.log(`[API/bookstore/listings] Created listing ${listing.id} ("${title}") for ${profile.id} (direct upload)`);

      return NextResponse.json({ success: true, data: listing });
    }

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

    let coverUrl: string | null = null;
    const cover = formData.get('cover');
    if (cover instanceof File && cover.size > 0) {
      const mime = cover.type || '';
      if (!SUPPORTED_COVER_TYPES.has(mime)) {
        return NextResponse.json(
          { success: false, error: 'Cover image must be a JPG, PNG, or WebP file.' },
          { status: 400 }
        );
      }
      if (cover.size > MAX_COVER_BYTES) {
        return NextResponse.json({ success: false, error: 'Cover image exceeds the 10MB limit.' }, { status: 400 });
      }
      const coverBuffer = Buffer.from(await cover.arrayBuffer());
      const storedName = generateFilename('cover', COVER_EXTENSION[mime]);
      coverUrl = await saveFile('listings', storedName, coverBuffer, { contentType: mime });
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
        coverUrl,
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

export async function DELETE(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);
    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Listing ID is required.' }, { status: 400 });
    }

    const listing = await db.bookListing.findUnique({ where: { id } });
    if (!listing) {
      return NextResponse.json({ success: false, error: 'Listing not found.' }, { status: 404 });
    }

    if (listing.ownerId !== profile.id) {
      return NextResponse.json(
        { success: false, error: 'You can only delete your own listings.' },
        { status: 403 }
      );
    }

    await db.bookListing.delete({ where: { id } });

    const fileCleanups = [listing.fileUrl, listing.coverUrl].filter((url): url is string => Boolean(url));
    await Promise.allSettled(fileCleanups.map((url) => deleteFile(url)));

    console.log(`[API/bookstore/listings] Deleted listing ${listing.id} ("${listing.title}") for ${profile.id}`);

    return NextResponse.json({ success: true, data: { id: listing.id } });
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/bookstore/listings] DELETE failed:', message, error instanceof Error ? error.stack : '');
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
