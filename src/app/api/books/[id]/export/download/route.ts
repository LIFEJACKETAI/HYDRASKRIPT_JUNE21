// HydraSkript - Book Download Route
// GET /api/books/[id]/export/download?format=pdf
//
// Generates (or fetches the cached) PDF/EPUB/DOCX for the book and streams
// it back to the client with a `Content-Disposition: attachment` header.
// This bypasses browser popup blockers (because the request is initiated
// by a same-origin anchor click) and guarantees a real download instead
// of opening the PDF in a new browser tab.

import { NextRequest, NextResponse } from 'next/server';
import { exportBookAsPDF } from '@/lib/services/exportService';
import { exportBookAsEPUB } from '@/lib/services/epubService';
import { exportBookAsDOCX } from '@/lib/services/docxService';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';
import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';

const STORAGE_DIR = path.join(process.cwd(), 'public', 'assets');

function contentTypeFor(format: string): string {
  switch (format) {
    case 'pdf':
      return 'application/pdf';
    case 'epub':
      return 'application/epub+zip';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:
      return 'application/octet-stream';
  }
}

function extensionFor(format: string): string {
  switch (format) {
    case 'pdf':
      return 'pdf';
    case 'epub':
      return 'epub';
    case 'docx':
      return 'docx';
    default:
      return 'bin';
  }
}

async function findCachedAsset(bookId: string, assetType: string) {
  return db.mediaAsset.findFirst({
    where: { bookId, assetType },
    orderBy: { createdAt: 'desc' },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { profile } = await requireProfile(request);

    const format = (request.nextUrl.searchParams.get('format') ?? 'pdf').toLowerCase();
    const assetType = `${format}_export`;

    // 1. Look up the most recent cached export for this book
    const cached = await findCachedAsset(id, assetType).catch(() => null);
    let publicUrl: string | undefined = cached?.publicUrl;
    let localFile: string | null = null;

    // 2. If the cached URL points at local /assets/, try to read the file
    if (publicUrl && publicUrl.startsWith('/assets/')) {
      const relative = publicUrl.replace(/^\/assets\//, '');
      const candidate = path.join(STORAGE_DIR, relative);
      if (fs.existsSync(candidate)) localFile = candidate;
    }

    // 3. No cache (or missing local file) → generate the export now
    if (!publicUrl) {
      let result;
      if (format === 'pdf') result = await exportBookAsPDF(id, profile.id);
      else if (format === 'epub') result = await exportBookAsEPUB(id, profile.id);
      else if (format === 'docx') result = await exportBookAsDOCX(id, profile.id);
      else {
        return NextResponse.json(
          { success: false, error: `Unknown format: ${format}` },
          { status: 400 }
        );
      }

      if (!result.success || !result.publicUrl) {
        return NextResponse.json(
          { success: false, error: result.error || 'Export failed' },
          { status: 400 }
        );
      }

      publicUrl = result.publicUrl.split('?')[0];

      if (publicUrl.startsWith('/assets/')) {
        const relative = publicUrl.replace(/^\/assets\//, '');
        const candidate = path.join(STORAGE_DIR, relative);
        if (fs.existsSync(candidate)) localFile = candidate;
      }
    }

    if (!publicUrl) {
      return NextResponse.json(
        { success: false, error: 'Failed to produce export' },
        { status: 500 }
      );
    }

    const book = await db.book.findUnique({
      where: { id, ownerId: profile.id },
      select: { title: true },
    });
    const safeTitle = (book?.title ?? 'book')
      .replace(/[^a-z0-9-_\. ]/gi, '_')
      .slice(0, 80);
    const filename = `${safeTitle}.${extensionFor(format)}`;

    // 4. Stream the file from local disk with attachment header
    if (localFile) {
      const stat = fs.statSync(localFile);
      const stream = fs.createReadStream(localFile);
      // @ts-expect-error — Node ReadStream is a valid Body in Next.js
      return new NextResponse(stream, {
        status: 200,
        headers: {
          'Content-Type': contentTypeFor(format),
          'Content-Length': stat.size.toString(),
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // 5. Fallback: redirect to the public URL (Supabase / etc.)
    return NextResponse.redirect(publicUrl, { status: 302 });
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Download failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
