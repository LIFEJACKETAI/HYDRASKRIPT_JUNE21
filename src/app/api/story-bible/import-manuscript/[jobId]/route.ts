// HydraSkript - Story Bible Manuscript Import progress API
// GET /api/story-bible/import-manuscript/[jobId]
//
// Polled by the client after POST /api/story-bible/import-manuscript queues the
// job. Returns progress while it runs and the import summary once it completes.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';
import { parseManuscriptImportOutcome } from '@/lib/manuscript-import';
import { jobQueue } from '@/lib/workers/queue';
import { runInBackground } from '@/lib/background';

export const dynamic = 'force-dynamic';

// The response itself is a cheap read, but when the job is still queued this
// invocation also lends its `after()` window to the queue (see below). That
// window is bounded by *this* route's maxDuration, so it has to be large enough
// to host a whole import — otherwise the platform freezes the worker mid-LLM
// call and the job only crawls forward one 30s slice per poll.
export const maxDuration = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const { profile } = await requireProfile(request);

    // Guard the Prisma Uuid column from a malformed id.
    if (!UUID_RE.test(jobId)) {
      return NextResponse.json({ success: false, error: 'Invalid import job id.' }, { status: 400 });
    }

    const job = await db.job.findFirst({
      where: { id: jobId, ownerId: profile.id, jobType: 'manuscript_import' },
    });

    if (!job) {
      return NextResponse.json({ success: false, error: 'Import job not found' }, { status: 404 });
    }

    // A serverless instance is frozen between requests, so the poll loop's
    // timers may never fire and a queued job can sit untouched. Every poll gives
    // the queue another chance to claim it — without blocking this response, so
    // the client keeps getting fast progress updates either way.
    if (job.status === 'queued') {
      runInBackground('manuscript-import-poll', () => jobQueue.drainOnce());
    }

    const outcome = job.status === 'completed' ? parseManuscriptImportOutcome(job.result) : null;

    return NextResponse.json({
      success: true,
      data: {
        jobId: job.id,
        bookId: job.bookId,
        status: job.status,
        progressMessage: job.progressMessage,
        progressPercent: job.progressPercent,
        errorMessage: job.errorMessage,
        ...(outcome
          ? {
              fileName: outcome.fileName,
              newBookCreated: outcome.newBookCreated,
              counts: outcome.counts,
              total: outcome.total,
            }
          : {}),
      },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/story-bible/import-manuscript/status] Failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
