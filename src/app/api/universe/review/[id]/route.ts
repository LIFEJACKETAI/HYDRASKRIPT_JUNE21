// HydraSkript - Editorial Review Detail API
// GET    /api/universe/review/[id]  full review with findings
// DELETE /api/universe/review/[id]  delete a review report

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';

const SEVERITY_ORDER = ['critical', 'warning', 'info'] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { profile } = await requireProfile(request);

    const review = await db.editorialReview.findUnique({
      where: { id, ownerId: profile.id },
      include: { findings: true },
    });

    if (!review) {
      return NextResponse.json({ success: false, error: 'Review not found' }, { status: 404 });
    }

    const findings = review.findings.sort((a, b) => {
      const ia = SEVERITY_ORDER.indexOf(a.severity as (typeof SEVERITY_ORDER)[number]);
      const ib = SEVERITY_ORDER.indexOf(b.severity as (typeof SEVERITY_ORDER)[number]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.createdAt.getTime() - b.createdAt.getTime();
    });

    return NextResponse.json({
      success: true,
      data: {
        id: review.id,
        bookId: review.bookId,
        scope: review.scope,
        sourceLabel: review.sourceLabel,
        status: review.status,
        textLength: review.textLength,
        errorMessage: review.errorMessage,
        createdAt: review.createdAt.toISOString(),
        completedAt: review.completedAt?.toISOString() ?? null,
        findings: findings.map((f) => ({
          id: f.id,
          reviewId: f.reviewId,
          severity: f.severity,
          category: f.category,
          title: f.title,
          description: f.description,
          quote: f.quote,
          location: f.location,
          bookTitle: f.bookTitle,
          suggestion: f.suggestion,
          status: f.status,
          createdAt: f.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/universe/review] Get failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { profile } = await requireProfile(request);

    const existing = await db.editorialReview.findUnique({ where: { id, ownerId: profile.id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Review not found' }, { status: 404 });
    }

    // Cancel the backing job so the queue loop never resurrects it as an
    // orphaned phantom (recoverExpiredLeases only re-queues `active` jobs with
    // a stale lease; a `failed` job with a cleared lease is left alone).
    if (existing.jobId) {
      await db.job.update({
        where: { id: existing.jobId },
        data: {
          status: 'failed',
          progressMessage: 'Cancelled: report deleted',
          errorMessage: 'Cancelled: report deleted',
          leaseExpiresAt: null,
          lastHeartbeatAt: null,
        },
      });

      try {
        const { refundCredits } = await import('@/lib/utils/credits');
        await refundCredits(existing.jobId, 'Cancelled: report deleted');
      } catch (e) {
        console.error('[API/universe/review] Refund failed after delete:', e);
      }
    }

    await db.editorialReview.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/universe/review] Delete failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
