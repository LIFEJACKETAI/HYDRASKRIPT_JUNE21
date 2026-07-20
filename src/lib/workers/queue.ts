// HydraSkript - Persistent Postgres Job Queue
// DB-backed state machine with lease, heartbeat, and retry semantics backed by Prisma fields

import { db } from '@/lib/db';
import { WorkerRegistry } from './registry';
import type { JobType, JobStatus } from '@/types';

const DEFAULT_MAX_RETRIES = 3;
const LEASE_DURATION_MS = 5 * 60 * 1000;

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
    const maxRetries = params.maxRetries ?? DEFAULT_MAX_RETRIES;

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
        retryCount: 0,
        maxRetries,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
      },
    });

    return job.id;
  }

  async startJob(jobId: string, jobType: JobType, _execute?: () => Promise<void>): Promise<void> {
    console.log(`[Queue] Job ${jobId} signaled for processing (${jobType})`);
    await this.bootstrap();
    void this.processNext();
  }

  private getLeaseExpiry(from = new Date()) {
    return new Date(from.getTime() + LEASE_DURATION_MS);
  }


  private async processNext() {
    if (this.activeJobs >= this.maxConcurrent || this.isProcessing) return;
    this.isProcessing = true;

    const jobToProcess = await db.$transaction(async (tx) => {
      const queuedJob = await tx.job.findFirst({
        where: {
          status: 'queued',
          retryCount: { lte: tx.job.fields.maxRetries },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!queuedJob) return null;

      const now = new Date();

      return tx.job.update({
        where: { id: queuedJob.id },
        data: {
          status: 'active',
          progressMessage: queuedJob.retryCount > 0
            ? `Retrying (${queuedJob.retryCount}/${queuedJob.maxRetries})...`
            : 'Processing...',
          startedAt: queuedJob.startedAt ?? now,
          leaseExpiresAt: this.getLeaseExpiry(now),
          lastHeartbeatAt: now,
          errorMessage: null,
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

      const nextRetryCount = jobToProcess.retryCount + 1;
      const canRetry = nextRetryCount <= jobToProcess.maxRetries;

      await this.updateJobStatus(jobToProcess.id, {
        status: canRetry ? 'queued' : 'failed',
        errorMessage: errMessage,
        progressMessage: canRetry
          ? `Retrying (${nextRetryCount}/${jobToProcess.maxRetries}) after failure: ${errMessage}`
          : `Failed: ${errMessage}`,
        retryCount: nextRetryCount,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
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

    const now = new Date();

    await db.job.updateMany({
      where: {
        status: 'active',
        OR: [
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        status: 'queued',
        progressMessage: 'Recovering interrupted job...',
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
      },
    });

    this.bootstrapped = true;
    console.log('[Queue] Recovered active jobs from last session.');
  }

  async heartbeat(jobId: string): Promise<void> {
    const now = new Date();

    try {
      await db.job.update({
        where: { id: jobId },
        data: {
          lastHeartbeatAt: now,
          leaseExpiresAt: this.getLeaseExpiry(now),
        },
      });
    } catch (error) {
      console.error(`[Queue] Failed heartbeat for job ${jobId}:`, error);
    }
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
          ...(update.retryCount !== undefined && { retryCount: update.retryCount }),
          ...(update.leaseExpiresAt !== undefined && { leaseExpiresAt: update.leaseExpiresAt }),
          ...(update.lastHeartbeatAt !== undefined && { lastHeartbeatAt: update.lastHeartbeatAt }),
          ...(update.status === 'completed' && {
            completedAt: new Date(),
            leaseExpiresAt: null,
            lastHeartbeatAt: new Date(),
          }),
          ...(update.status === 'failed' && {
            leaseExpiresAt: null,
          }),
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
