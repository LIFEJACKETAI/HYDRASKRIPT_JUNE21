// HydraSkript - Persistent Postgres Job Queue
// Replaces in-memory queue with a DB-backed atomic state machine

import { db } from '@/lib/db';
import { WorkerRegistry } from './registry';
import type { JobType, JobStatus } from '@/types';

class PersistentJobQueue {
  private isProcessing = false;
  private maxConcurrent = 2;
  private activeJobs = 0;
  private bootstrapped = false;

  /**
   * Create a job record in the database.
   * In the new state machine, this is essentially the "Enqueue" action.
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
   * Signal that a job is ready for execution.
   * Since it's already in the DB as 'queued', we just trigger the processor.
   */
  async startJob(jobId: string, jobType: JobType, _execute?: () => Promise<void>): Promise<void> {
    console.log(`[Queue] Job ${jobId} signaled for processing (${jobType})`);
    await this.bootstrap();
    void this.processNext();
  }

  /**
   * Process the next available job using atomic locking.
   */
  private async processNext() {
    if (this.activeJobs >= this.maxConcurrent || this.isProcessing) return;

    this.isProcessing = true;

    // 1. Atomic Claim: Find a queued job and mark it active in one transaction
    // This prevents multiple workers from picking up the same job.
    const jobToProcess = await db.$transaction(async (tx) => {
      const queuedJob = await tx.job.findFirst({
        where: { status: 'queued' },
        orderBy: { createdAt: 'asc' },
      });

      if (!queuedJob) return null;

      return await tx.job.update({
        where: { id: queuedJob.id },
        data: {
          status: 'active',
          progressMessage: 'Processing...',
          startedAt: new Date()
        },
      });
    });

    if (!jobToProcess) {
      this.isProcessing = false;
      return;
    }

    this.activeJobs++;

    try {
      console.log(`[Queue] Executing ${jobToProcess.jobType} job ${jobToProcess.id}`);

      const workerFn = WorkerRegistry[jobToProcess.jobType];
      if (!workerFn) {
        throw new Error(`No worker registered for job type: ${jobToProcess.jobType}`);
      }

      // We wrap the job data in a format the worker expects
      await workerFn({
        ...jobToProcess,
        result: jobToProcess.result ? JSON.parse(jobToProcess.result) : null,
      } as any);

    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Queue] Job ${jobToProcess.id} failed:`, errMessage);

      await this.updateJobStatus(jobToProcess.id, {
        status: 'failed',
        errorMessage: errMessage,
        progressMessage: `Failed: ${errMessage}`,
      });

      // Refund credits on failure
      try {
        const { refundCredits } = await import('@/lib/utils/credits');
        await refundCredits(jobToProcess.id, `Job failed: ${errMessage}`);
      } catch (e) {
        console.error('[Queue] Refund failed:', e);
      }
    } finally {
      this.activeJobs--;
      this.isProcessing = false;
      // Trigger next job immediately
      setTimeout(() => {
        void this.processNext();
      }, 100);
    }
  }

  async bootstrap(): Promise<void> {
    if (this.bootstrapped) return;

    await db.job.updateMany({
      where: { status: 'active' },
      data: { status: 'queued', progressMessage: 'Recovering from crash...' },
    });

    this.bootstrapped = true;
    console.log('[Queue] Recovered active jobs from last session.');
  }

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
          ...(update.result && { result: update.result ? JSON.stringify(update.result) : undefined }),
          ...(update.startedAt && { startedAt: update.startedAt }),
          ...(update.completedAt && { completedAt: update.completedAt }),
          ...(update.status === 'completed' && { completedAt: new Date() }),
        },
      });
    } catch (error) {
      console.error(`[Queue] Failed to update job ${jobId}:`, error);
    }
  }

  getQueueSize(): number {
    // Now we query the DB for the size
    return db.job.count({ where: { status: 'queued' } });
  }

  getActiveCount(): number {
    return this.activeJobs;
  }
}

export const jobQueue = new PersistentJobQueue();
