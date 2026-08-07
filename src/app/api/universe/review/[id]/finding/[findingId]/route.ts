// HydraSkript - Editorial Finding Status API
// PATCH /api/universe/review/[id]/finding/[findingId]  update finding status (open/fixed/ignored)

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';

const FINDING_STATUSES = ['open', 'fixed', 'ignored'] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; findingId: string }> }
) {
  try {
    const { id, findingId } = await params;
    const { profile } = await requireProfile(request);

    const review = await db.editorialReview.findUnique({ where: { id, ownerId: profile.id } });
    if (!review) {
      return NextResponse.json({ success: false, error: 'Review not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const status = body.status;
    if (!FINDING_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, error: `status must be one of: ${FINDING_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const finding = await db.editorialFinding.findUnique({ where: { id: findingId, reviewId: id } });
    if (!finding) {
      return NextResponse.json({ success: false, error: 'Finding not found' }, { status: 404 });
    }

    const updated = await db.editorialFinding.update({
      where: { id: findingId },
      data: { status },
    });

    return NextResponse.json({
      success: true,
      data: { id: updated.id, status: updated.status },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/universe/review] Finding update failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
