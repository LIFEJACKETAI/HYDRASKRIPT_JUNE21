// HydraSkript - Book Download Route
// GET /api/books/[id]/export/download?format=pdf
//
// Streams a PDF/EPUB/DOCX export of the book back to the client with a
// `Content-Disposition: attachment` header. This bypasses browser popup
// blockers (because the request is initiated by a same-origin anchor click)
// and guarantees a real download instead of opening the file in a new tab.
//
// Storage strategy:
//   1. If a previous export was persisted to Cloudflare R2 / Supabase, redirect
//      to its public URL (or stream a locally-cached file in local dev).
//   2. Otherwise, generate the export in memory and stream the bytes directly.
//      This works on read-only serverless filesystems (AWS Lambda `/var/task`)
//      where writing to public/assets is not permitted (EROFS).

import { NextRequest, NextResponse } from 'next/server';
import { generatePDFBuffer } from '@/lib/services/exportService';
import { generateEPUBBuffer } from '@/lib/services/epubService';
import { generateDOCXBuffer } from '@/lib/services/docxService';
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

function streamBuffer(buffer: Buffer, filename: string, contentType: string): NextResponse {
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': buffer.length.toString(),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
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

    const book = await db.book.findUnique({
      where: { id, ownerId: profile.id },
      select: { title: true },
    });
    const safeTitle = (book?.title ?? 'book')
      .replace(/[^a-z0-9-_\\. ]/gi, '_')
      .slice(0, 80);
    const filename = `${safeTitle}.${extensionFor(format)}`;

    // 1. Prefer a previously persisted export (R2 / Supabase / local dev).
    const cached = await findCachedAsset(id, assetType).catch(() => null);
    const cachedUrl = cached?.publicUrl;

    if (cachedUrl && cachedUrl.startsWith('/assets/')) {
      // Local-dev cache: stream from disk if the file is actually present.
      const relative = cachedUrl.replace(/^\/assets\//, '');
      const candidate = path.join(STORAGE_DIR, relative);
      if (fs.existsSync(candidate)) {
        const stat = fs.statSync(candidate);
        const stream = fs.createReadStream(candidate);
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
      // Cached path exists in the DB but not on disk (e.g. serverless) —
      // fall through and regenerate from memory.
    } else if (cachedUrl) {
      // External storage (R2 / Supabase) URL — redirect the browser to it.
      return NextResponse.redirect(cachedUrl, { status: 302 });
    }

    // 2. No usable cache → generate in memory and stream directly.
    let gen:
      | { success: boolean; buffer?: Buffer; contentType?: string; error?: string }
      | undefined;
    if (format === 'pdf') gen = await generatePDFBuffer(id, profile.id);
    else if (format === 'epub') gen = await generateEPUBBuffer(id, profile.id);
    else if (format === 'docx') gen = await generateDOCXBuffer(id, profile.id);
    else {
      return NextResponse.json(
        { success: false, error: `Unknown format: ${format}` },
        { status: 400 }
      );
    }

    if (!gen.success || !gen.buffer) {
      return NextResponse.json(
        { success: false, error: gen.error || 'Export failed' },
        { status: 400 }
      );
    }

    return streamBuffer(gen.buffer, filename, gen.contentType || contentTypeFor(format));
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Download failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
