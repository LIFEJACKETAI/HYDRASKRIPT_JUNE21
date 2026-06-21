// HydraSkript - Book Export API Route
// POST /api/books/[id]/export - Export book as PDF/HTML

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
    const email = getAuthEmail(request);
    const profile = await getOrCreateProfile(email);

    const result = await exportBookAsPDF(id, profile.id);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: { downloadUrl: result.publicUrl },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Export failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
