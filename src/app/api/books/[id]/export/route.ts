// HydraSkript - Book Export API Route
// POST /api/books/[id]/export - Export book as PDF, EPUB, or DOCX

import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateProfile } from '@/lib/utils/bookHelpers';
import { exportBookAsPDF } from '@/lib/services/exportService';

function getAuthEmail(request: NextRequest): string {
  return request.headers.get('x-user-email') || 'demo@hydraskript.com';
}

// POST - Export book
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const email = await getAuthEmail(request);
    const profile = await getOrCreateProfile(email);

    const body = await request.json().catch(() => ({}));
    const format: string = (body?.format ?? 'pdf').toLowerCase();

    // ── PDF ──────────────────────────────────────────────────────────────────
    if (format === 'pdf') {
      const result = await exportBookAsPDF(id, profile.id);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        data: { downloadUrl: result.publicUrl, format: 'pdf' },
      });
    }

    // ── EPUB ─────────────────────────────────────────────────────────────────
    if (format === 'epub') {
      // TODO: Implement full EPUB generation (e.g. epub-gen-memory or custom builder)
      // For now return a clear stub so the UI doesn't silently 404
      return NextResponse.json(
        {
          success: false,
          error: 'EPUB export is not yet available — coming soon.',
          code: 'EPUB_NOT_IMPLEMENTED',
        },
        { status: 501 }
      );
    }

    // ── DOCX ─────────────────────────────────────────────────────────────────
    if (format === 'docx') {
      // TODO: Implement DOCX generation (e.g. docx npm package)
      return NextResponse.json(
        {
          success: false,
          error: 'DOCX export is not yet available — coming soon.',
          code: 'DOCX_NOT_IMPLEMENTED',
        },
        { status: 501 }
      );
    }

    // ── Unknown format ────────────────────────────────────────────────────────
    return NextResponse.json(
      { success: false, error: `Unknown export format: "${format}". Valid options: pdf, epub, docx` },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Export failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
