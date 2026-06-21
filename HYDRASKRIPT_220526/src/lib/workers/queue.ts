// HydraSkript - In-Memory Job Queue System
// Replaces BullMQ/Redis with a simple in-memory queue for the sandbox
// Uses polling for progress updates instead of real-time events

import { db } from '@/lib/db';
import type { JobType, JobStatus } from '@/types';

// ─── Job Queue Types ──────────────────────────────────────────────────────────

interface QueuedJob {
  id: string;
  type: JobType;
  execute: () => Promise<void>;
}

// ─── Job Queue Singleton ──────────────────────────────────────────────────────

class JobQueue {
  private queue: QueuedJob[] = [];
  private processing = false;
  private maxConcurrent = 2;
  private activeJobs = 0;

  /**
   * Create a job record in the database without enqueueing it.
   * Use this when you need the job ID before confirming the operation.
   */
  async createJob(params: {
    bookId?: string;
    ownerId: string;
    jobType: JobType;
    creditsReserved: number;
    stepIndex?: number;
  }): Promise<string> {
    const job = await db.job.create({
      data: {
        bookId: params.bookId,
        ownerId: params.ownerId,
        jobType: params.jobType,
        status: 'queued',
        progressMessage: 'Queued...',
        progressPercent: 0,
        creditsReserved: params.creditsReserved,
        stepIndex: params.stepIndex ?? 0,
      },
    });
    return job.id;
  }

  /**
   * Enqueue an already-created job for execution.
   */
  async startJob(jobId: string, jobType: JobType, execute: () => Promise<void>): Promise<void> {
    this.queue.push({
      id: jobId,
      type: jobType,
      execute,
    });

    console.log(`[Queue] Enqueued ${jobType} job ${jobId}`);
    this.processNext();
  }

  /**
   * Process the next job in the queue.
   */
  private processNext() {
    if (this.activeJobs >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.activeJobs++;
    this.processing = true;

    // Process asynchronously - wrap in safety handler
    this.executeJob(job)
      .catch((err) => {
        // This should never be reached because executeJob has its own try/catch,
        // but just in case something slips through
        console.error(`[Queue] UNEXPECTED error in job ${job.id}:`, err);
      })
      .finally(() => {
        this.activeJobs--;
        this.processing = this.activeJobs > 0;
        // Continue processing next job after a short delay
        setTimeout(() => this.processNext(), 100);
      });
  }

  /**
   * Execute a single job with full error handling.
   */
  private async executeJob(job: QueuedJob): Promise<void> {
    try {
      // Update job status to active
      await this.updateJobStatus(job.id, {
        status: 'active',
        progressMessage: 'Processing...',
        startedAt: new Date(),
      });

      console.log(`[Queue] Processing ${job.type} job ${job.id}`);

      // Execute the job with a top-level safety wrapper
      await job.execute();

      console.log(`[Queue] Completed ${job.type} job ${job.id}`);
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Queue] Job ${job.id} failed:`, errMessage);
      if (error instanceof Error && error.stack) {
        console.error(`[Queue] Stack:`, error.stack);
      }

      // Update job status to failed
      try {
        await this.updateJobStatus(job.id, {
          status: 'failed',
          errorMessage: errMessage,
          progressMessage: `Failed: ${errMessage}`,
        });
      } catch (updateError) {
        console.error(`[Queue] Failed to update job status for ${job.id}:`, updateError);
      }

      // Refund credits on failure
      try {
        const { refundCredits } = await import('@/lib/utils/credits');
        await refundCredits(job.id, `Job failed: ${errMessage}`);
      } catch (refundError) {
        console.error(`[Queue] Refund failed for job ${job.id}:`, refundError);
      }

      // Update book status to failed
      try {
        const { db } = await import('@/lib/db');
        const jobRecord = await db.job.findUnique({ where: { id: job.id }, select: { bookId: true } });
        if (jobRecord?.bookId) {
          await db.book.update({ where: { id: jobRecord.bookId }, data: { status: 'failed' } });
        }
      } catch (bookUpdateError) {
        console.error(`[Queue] Failed to update book status for job ${job.id}:`, bookUpdateError);
      }

      // Don't re-throw - the queue should continue processing other jobs
    }
  }

  /**
   * Update a job's status and progress.
   */
  async updateJobStatus(
    jobId: string,
    update: {
      status?: JobStatus;
      progressMessage?: string;
      progressPercent?: number;
      errorMessage?: string;
      result?: Record<string, unknown>;
      startedAt?: Date;
      completedAt?: Date;
    }
  ): Promise<void> {
    try {
      await db.job.update({
        where: { id: jobId },
        data: {
          ...(update.status && { status: update.status }),
          ...(update.progressMessage && { progressMessage: update.progressMessage }),
          ...(update.progressPercent !== undefined && { progressPercent: update.progressPercent }),
          ...(update.errorMessage && { errorMessage: update.errorMessage }),
          ...(update.result && { result: JSON.stringify(update.result) }),
          ...(update.startedAt && { startedAt: update.startedAt }),
          ...(update.completedAt && { completedAt: update.completedAt }),
          ...(update.status === 'completed' && { completedAt: new Date(), creditsConsumed: undefined }),
        },
      });
    } catch (error) {
      console.error(`[Queue] Failed to update job ${jobId}:`, error);
    }
  }

  /**
   * Get the number of jobs in the queue.
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get the number of active jobs.
   */
  getActiveCount(): number {
    return this.activeJobs;
  }
}

// Singleton instance
export const jobQueue = new JobQueue();

// Prevent unhandled promise rejections from crashing the server
if (typeof process !== 'undefined') {
  process.on('unhandledRejection', (reason) => {
    console.error('[Queue] Unhandled rejection (non-fatal):', reason);
  });
}
