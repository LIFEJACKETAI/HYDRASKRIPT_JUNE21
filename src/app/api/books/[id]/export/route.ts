// HydraSkript - Book Export API Route
// POST /api/books/[id]/export - Export book as PDF, EPUB, or DOCX

import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateProfile } from '@/lib/utils/bookHelpers';
import { exportBookAsPDF } from '@/lib/services/exportService';
import { exportBookAsEPUB } from '@/lib/services/epubService';
import { exportBookAsDOCX } from '@/lib/services/docxService';

function getAuthEmail(request: NextRequest): string {
  const email = request.headers.get('x-user-email'); if (!email) throw new Error('Unauthorized'); return email;
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
      const result = await exportBookAsEPUB(id, profile.id);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        data: { downloadUrl: result.publicUrl, format: 'epub' },
      });
    }

    // ── DOCX ─────────────────────────────────────────────────────────────────
    if (format === 'docx') {
      const result = await exportBookAsDOCX(id, profile.id);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        data: { downloadUrl: result.publicUrl, format: 'docx' },
      });
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
