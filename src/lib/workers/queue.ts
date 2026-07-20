// HydraSkript - Persistent Postgres Job Queue
// DB-backed state machine with lightweight retry semantics, compatible with current Prisma client

import { db } from '@/lib/db';
import { WorkerRegistry } from './registry';
import type { JobType, JobStatus } from '@/types';

const DEFAULT_MAX_RETRIES = 3;

type QueueWorkerJob = {
  id: string;
  bookId?: string | null;
  ownerId: string;
  stepIndex?: number | null;
  creditsConsumed?: number | null;
};

class PersistentJobQueue {
  private isProcessing = false;
  private maxConcurrent = 2;
  private activeJobs = 0;
  private bootstrapped = false;

  async createJob(params: {
    bookId?: string;
    ownerId: string;
    jobType: JobType;
    creditsReserved: number;
    stepIndex?: number;
    maxRetries?: number;
  }): Promise<string> {
    const progressMessage = params.maxRetries && params.maxRetries !== DEFAULT_MAX_RETRIES
      ? `Queued... (max retries: ${params.maxRetries})`
      : 'Queued...';

    const job = await db.job.create({
      data: {
        bookId: params.bookId,
        ownerId: params.ownerId,
        jobType: params.jobType,
        status: 'queued',
        progressMessage,
        progressPercent: 0,
        creditsReserved: params.creditsReserved,
        stepIndex: params.stepIndex ?? 0,
      },
    });

    return job.id;
  }

  async startJob(jobId: string, jobType: JobType, _execute?: () => Promise<void>): Promise<void> {
    console.log(`[Queue] Job ${jobId} signaled for processing (${jobType})`);
    await this.bootstrap();
    void this.processNext();
  }

  private extractRetryState(progressMessage: string | null | undefined) {
    const message = progressMessage ?? '';
    const retryMatch = message.match(/Retrying \((\d+)\/(\d+)\)/);

    return {
      retryCount: retryMatch ? Number.parseInt(retryMatch[1], 10) : 0,
      maxRetries: retryMatch ? Number.parseInt(retryMatch[2], 10) : DEFAULT_MAX_RETRIES,
    };
  }

  private async processNext() {
    if (this.activeJobs >= this.maxConcurrent || this.isProcessing) return;
    this.isProcessing = true;

    const jobToProcess = await db.$transaction(async (tx) => {
      const queuedJobs = await tx.job.findMany({
        where: { status: 'queued' },
        orderBy: { createdAt: 'asc' },
        take: 25,
      });

      const queuedJob = queuedJobs.find((job) => {
        const retryState = this.extractRetryState(job.progressMessage);
        return retryState.retryCount <= retryState.maxRetries;
      });

      if (!queuedJob) return null;

      return tx.job.update({
        where: { id: queuedJob.id },
        data: {
          status: 'active',
          progressMessage: queuedJob.progressMessage?.startsWith('Retrying')
            ? queuedJob.progressMessage
            : 'Processing...',
          startedAt: queuedJob.startedAt ?? new Date(),
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

      const workerJob: QueueWorkerJob = {
        id: jobToProcess.id,
        bookId: jobToProcess.bookId,
        ownerId: jobToProcess.ownerId,
        stepIndex: jobToProcess.stepIndex,
        creditsConsumed: jobToProcess.creditsConsumed,
      };

      await workerFn(workerJob);
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Queue] Job ${jobToProcess.id} failed:`, errMessage);

      const retryState = this.extractRetryState(jobToProcess.progressMessage);
      const nextRetryCount = retryState.retryCount + 1;
      const canRetry = nextRetryCount <= retryState.maxRetries;

      await this.updateJobStatus(jobToProcess.id, {
        status: canRetry ? 'queued' : 'failed',
        errorMessage: errMessage,
        progressMessage: canRetry
          ? `Retrying (${nextRetryCount}/${retryState.maxRetries}) after failure: ${errMessage}`
          : `Failed: ${errMessage}`,
      });

      if (!canRetry) {
        try {
          const { refundCredits } = await import('@/lib/utils/credits');
          await refundCredits(jobToProcess.id, `Job failed: ${errMessage}`);
        } catch (e) {
          console.error('[Queue] Refund failed:', e);
        }
      }
    } finally {
      this.activeJobs--;
      this.isProcessing = false;
      setTimeout(() => {
        void this.processNext();
      }, 100);
    }
  }

  async bootstrap(): Promise<void> {
    if (this.bootstrapped) return;

    await db.job.updateMany({
      where: { status: 'active' },
      data: { status: 'queued', progressMessage: 'Recovering interrupted job...' },
    });

    this.bootstrapped = true;
    console.log('[Queue] Recovered active jobs from last session.');
  }

  async heartbeat(_jobId: string): Promise<void> {
    return Promise.resolve();
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
      retryCount?: number;
      leaseExpiresAt?: Date | null;
      lastHeartbeatAt?: Date | null;
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
          ...(update.status === 'completed' && { completedAt: new Date() }),
        },
      });
    } catch (error) {
      console.error(`[Queue] Failed to update job ${jobId}:`, error);
    }
  }

  async getQueueSize(): Promise<number> {
    return db.job.count({ where: { status: 'queued' } });
  }

  getActiveCount(): number {
    return this.activeJobs;
  }
}

export const jobQueue = new PersistentJobQueue();
