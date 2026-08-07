// HydraSkript - Editorial Review Worker
// Runs the LLM "publishing house editor" audit for a queued editorial_review job.

import { db } from '@/lib/db';
import { runEditorialReview } from '@/lib/services/editorialReview';
import { jobQueue } from '@/lib/workers/queue';

export async function editorialReviewWorker(job: { id: string }): Promise<void> {
  const review = await db.editorialReview.findFirst({ where: { jobId: job.id } });
  if (!review) {
    throw new Error(`No editorial review found for job ${job.id}`);
  }

  try {
    await jobQueue.updateJobStatus(job.id, {
      progressMessage: `Starting editorial review of "${review.sourceLabel}"...`,
    });
    await runEditorialReview(review.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[EditorialReview] Worker failed for review ${review.id}:`, message);
    await db.editorialReview.update({
      where: { id: review.id },
      data: { status: 'failed', errorMessage: message },
    });
    throw error;
  }
}
