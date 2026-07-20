// HydraSkript - Job Progress API Route
// GET /api/jobs/[id] - Get job status and progress

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';

// GET - Get job progress
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { profile } = await requireProfile(request);

    const job = await db.job.findUnique({
      where: { id, ownerId: profile.id },
    });

    if (!job) {
      return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: job.id,
        jobType: job.jobType,
        status: job.status,
        progressMessage: job.progressMessage,
        progressPercent: job.progressPercent,
        creditsReserved: job.creditsReserved,
        creditsConsumed: job.creditsConsumed,
        errorMessage: job.errorMessage,
        result: job.result ? JSON.parse(job.result) : null,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
      },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Get job failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
