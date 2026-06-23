// HydraSkript - Job Progress API Route
// GET /api/jobs/[id] - Get job status and progress

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getOrCreateProfile } from '@/lib/utils/bookHelpers';

function getAuthEmail(request: NextRequest): string {
  return request.headers.get('x-user-email') || 'demo@hydraskript.com';
}

// GET - Get job progress
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const email = await getAuthEmail(request);
    const profile = await getOrCreateProfile(email);

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
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Get job failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
