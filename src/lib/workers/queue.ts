// HydraSkript - Persistent Postgres Job Queue
// DB-backed state machine with lease, heartbeat, and retry semantics backed by Prisma fields
// PRODUCTION HARDENED: Connection pooling, transaction retries, singleton enforcement, graceful degradation

import { db } from '@/lib/db';
import { WorkerRegistry } from './registry';
import type { JobType, JobStatus } from '@/types';

const DEFAULT_MAX_RETRIES = 3;
const LEASE_DURATION_MS = 5 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 60_000;
const MAX_TRANSACTION_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 100;
const MAX_RETRY_DELAY_MS = 2000;

type QueueWorkerJob = {
  id: string;
  bookId?: string | null;
  ownerId: string;
  stepIndex?: number | null;
  creditsConsumed?: number | null;
};

// ─── Serverless driver helpers ───────────────────────────────────────────────

/** True when running on a serverless platform (Vercel/AWS Lambda). */
export function isServerless(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.FUNCTION_TARGET
  );
}

function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`;
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  return 'http://localhost:3002';
}

/**
 * Fire-and-forget HTTP kick to the durable queue pump. The pump runs on a fresh
 * function instance with a full timeout budget, so long job chains survive
 * instance freezes. Never awaited, never throws into the caller.
 */
export function kickQueuePump(): void {
  if (!isServerless()) return; // local/dev uses the in-process loop
  try {
    const secret = process.env.CRON_SECRET || '';
    const url = `${getAppBaseUrl()}/api/queue/pump`;
    void fetch(url, {
      method: 'POST',
      headers: {
        'x-queue-pump-secret': secret || 'serverless',
        'cache-control': 'no-cache',
      },
    }).catch((e) => console.warn('[Queue] pump kick failed:', e));
  } catch (e) {
    console.warn('[Queue] kickQueuePump error:', e);
  }
}

class PersistentJobQueue {
  private isProcessing = false;
  private maxConcurrent = 2;
  private activeJobs = 0;
  private bootstrapped = false;
  private loopStarted = false;
  private shutdown = false;

  private getLeaseExpiry(from = new Date()) {
    return new Date(from.getTime() + LEASE_DURATION_MS);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async withTransactionRetry<T>(
    operation: (tx: any) => Promise<T>,
    context: string,
    maxRetries = MAX_TRANSACTION_RETRIES
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await db.$transaction(operation, {
          timeout: 15000,
          isolationLevel: 'ReadCommitted',
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        const isTimeout = lastError.message.includes('P2028') || 
                          lastError.message.includes('Unable to start a transaction') ||
                          lastError.message.includes('Transaction API error');
        
        const isConnectionError = lastError.message.includes('P1001') ||
                                  lastError.message.includes('Can\'t reach database') ||
                                  lastError.message.includes('ECONNREFUSED');

        const isAuthError =
          lastError.message.includes('P1000') ||
          lastError.message.includes('Authentication failed') ||
          lastError.message.includes('credentials are not valid');

        if (isAuthError || (!isTimeout && !isConnectionError) || attempt === maxRetries) {
          console.error(`[Queue] ${context} failed after ${attempt + 1} attempts:`, lastError.message);
          throw lastError;
        }

        const delay = Math.min(
          BASE_RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 100,
          MAX_RETRY_DELAY_MS
        );
        
        console.warn(`[Queue] ${context} attempt ${attempt + 1} failed (${lastError.message}), retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  async createJob(params: {
    bookId?: string;
    ownerId: string;
    jobType: JobType;
    creditsReserved: number;
    stepIndex?: number;
    creditsConsumed?: number;
    maxRetries?: number;
    result?: string;
  }): Promise<string> {
    const maxRetries = params.maxRetries ?? DEFAULT_MAX_RETRIES;

    return this.withTransactionRetry(
      async (tx) => {
        const job = await tx.job.create({
          data: {
            bookId: params.bookId,
            ownerId: params.ownerId,
            jobType: params.jobType,
            status: 'queued',
            progressMessage: 'Queued...',
            progressPercent: 0,
            creditsReserved: params.creditsReserved,
            creditsConsumed: params.creditsConsumed ?? 0,
            stepIndex: params.stepIndex ?? 0,
            retryCount: 0,
            maxRetries,
            leaseExpiresAt: null,
            lastHeartbeatAt: null,
            result: params.result ?? '{}',
          },
        });
        return job.id;
      },
      'createJob'
    );
  }

  async startJob(jobId: string, jobType: JobType): Promise<void> {
    console.log(`[Queue] Job ${jobId} signaled for processing (${jobType})`);
    await this.bootstrap();

    // In a serverless deployment the in-process loop only runs while a function
    // is warm and serving traffic. Drive the job via the HTTP pump so the chain
    // survives instance freezes; locally use the in-process loop directly.
    if (isServerless()) {
      kickQueuePump();
    } else {
      void this.processNext();
    }
  }

  /**
   * Public, idempotent driver used by the /api/queue/pump route and by
   * serverless kicks. Claims and executes exactly ONE queued job, then returns.
   * Returns:
   *   'ran'  — a job was claimed and executed (caller should kick again)
   *   'idle' — no job was available
   *   'busy' — this instance is already at capacity or mid-claim
   * Claims are atomic at the DB level (conditional update), so concurrent
   * callers never process the same job twice.
   */
  async processOneQueuedJob(): Promise<'ran' | 'idle' | 'busy'> {
    if (this.shutdown) return 'busy';
    if (this.activeJobs >= this.maxConcurrent || this.isProcessing) return 'busy';

    let jobToProcess: Awaited<ReturnType<typeof this.claimNextJob>> = null;
    this.isProcessing = true;
    try {
      try {
        jobToProcess = await this.claimNextJob();
      } catch (error) {
        console.error('[Queue] Failed to claim next job:', error);
        return 'idle';
      }

      if (!jobToProcess) return 'idle';

      this.activeJobs++;
      const heartbeatTimer = setInterval(() => {
        void this.heartbeat(jobToProcess!.id);
      }, HEARTBEAT_INTERVAL_MS);

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

        try {
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
        } catch (updateError) {
          console.error('[Queue] Failed to update job status after failure:', updateError);
        }

        if (!canRetry) {
          try {
            const { refundCredits } = await import('@/lib/utils/credits');
            await refundCredits(jobToProcess.id, `Job failed: ${errMessage}`);
          } catch (e) {
            console.error('[Queue] Refund failed:', e);
          }
        }
      } finally {
        clearInterval(heartbeatTimer);
        this.activeJobs--;
      }

      return 'ran';
    } finally {
      this.isProcessing = false;
    }
  }

  // In-process loop tick (local/dev + warm serverless instances). Delegates to
  // the single-job processor so there is one code path for claim→execute→retry.
  private async processNext(): Promise<void> {
    if (this.shutdown) return;
    try {
      await this.processOneQueuedJob();
    } catch (error) {
      console.error('[Queue] processNext error:', error);
    } finally {
      this.scheduleNextPoll();
    }
  }

  private async claimNextJob(): Promise<{
    id: string;
    bookId: string | null;
    ownerId: string;
    jobType: JobType;
    retryCount: number;
    maxRetries: number;
    stepIndex: number | null;
    creditsConsumed: number | null;
  } | null> {
    return this.withTransactionRetry(
      async (tx) => {
        // Pick the oldest queued job, then claim it ATOMICALLY with a
        // conditional updateMany. If another pump/instance claimed it in the
        // meantime the update affects 0 rows and we move on — this prevents two
        // serverless invocations from running the same job twice.
        const queuedJob = await tx.job.findFirst({
          where: { status: 'queued' },
          orderBy: { createdAt: 'asc' },
        });

        if (!queuedJob) return null;

        const now = new Date();

        const claimed = await tx.job.updateMany({
          where: { id: queuedJob.id, status: 'queued' },
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

        if (claimed.count === 0) {
          // Lost the race — another worker took it. Signal nothing claimed;
          // the caller/pump will find no more work or retry on the next pass.
          return null;
        }

        return {
          id: queuedJob.id,
          bookId: queuedJob.bookId,
          ownerId: queuedJob.ownerId,
          jobType: queuedJob.jobType as JobType,
          retryCount: queuedJob.retryCount,
          maxRetries: queuedJob.maxRetries,
          stepIndex: queuedJob.stepIndex,
          creditsConsumed: queuedJob.creditsConsumed,
        };
      },
      'claimNextJob'
    );
  }

  private scheduleNextPoll(): void {
    if (this.shutdown) return;
    setTimeout(() => {
      void this.processNext();
    }, 100);
  }

  async bootstrap(): Promise<void> {
    await this.recoverExpiredLeases();

    if (this.bootstrapped) return;
    this.bootstrapped = true;
    console.log('[Queue] Recovered active jobs from last session.');
  }

  /**
   * Reset any job whose worker died (stale/expired lease) back to `queued` so
   * the next poll can pick it up. Safe to call repeatedly.
   * Uses exponential backoff retry for resilience.
   */
  private async recoverExpiredLeases(): Promise<void> {
    const now = new Date();

    await this.withTransactionRetry(
      async (tx) => {
        await tx.job.updateMany({
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
      },
      'recoverExpiredLeases',
      2 // Fewer retries for recovery to avoid blocking
    );
  }

  /**
   * Start a background poll loop so queued jobs are picked up even without a
   * fresh `startJob` signal (e.g. after a server restart). Idempotent.
   * Includes jitter to prevent thundering herd in multi-instance deployments.
   */
  startLoop(pollIntervalMs = 5000, recoveryIntervalMs = 60_000): void {
    if (this.loopStarted) return;
    this.loopStarted = true;

    // Add jitter to prevent synchronized polling across instances
    const pollJitter = () => pollIntervalMs + Math.random() * 1000;
    const recoveryJitter = () => recoveryIntervalMs + Math.random() * 5000;

    const tick = () => {
      if (!this.shutdown) void this.processNext();
    };

    const recover = () => {
      if (!this.shutdown) {
        void (async () => {
          try {
            await this.recoverExpiredLeases();
          } catch (error) {
            console.error('[Queue] Loop lease recovery failed:', error);
          }
        })();
      }
    };

    const pollInterval = setInterval(tick, pollJitter());
    const recoverInterval = setInterval(recover, recoveryJitter());

    // Store intervals for cleanup
    (this as any)._pollInterval = pollInterval;
    (this as any)._recoverInterval = recoverInterval;

    console.log(`[Queue] Background poll loop started (poll ${pollIntervalMs}ms, recovery ${recoveryIntervalMs}ms).`);
  }

  async heartbeat(jobId: string): Promise<void> {
    const now = new Date();

    try {
      await this.withTransactionRetry(
        async (tx) => {
          await tx.job.update({
            where: { id: jobId },
            data: {
              lastHeartbeatAt: now,
              leaseExpiresAt: this.getLeaseExpiry(now),
            },
          });
        },
        `heartbeat(${jobId})`,
        2 // Heartbeat failures are non-critical, fewer retries
      );
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
      await this.withTransactionRetry(
        async (tx) => {
          await tx.job.update({
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
        },
        `updateJobStatus(${jobId})`
      );
    } catch (error) {
      console.error(`[Queue] Failed to update job ${jobId}:`, error);
      // Don't throw - status updates are best-effort
    }
  }

  async getQueueSize(): Promise<number> {
    try {
      return await db.job.count({ where: { status: 'queued' } });
    } catch (error) {
      console.error('[Queue] Failed to get queue size:', error);
      return 0;
    }
  }

  getActiveCount(): number {
    return this.activeJobs;
  }

  async shutdownGracefully(): Promise<void> {
    console.log('[Queue] Initiating graceful shutdown...');
    this.shutdown = true;

    // Clear intervals
    if ((this as any)._pollInterval) clearInterval((this as any)._pollInterval);
    if ((this as any)._recoverInterval) clearInterval((this as any)._recoverInterval);

    // Wait for active jobs to complete (with timeout)
    const startWait = Date.now();
    const maxWaitMs = 30000; // 30 second grace period
    
    while (this.activeJobs > 0 && Date.now() - startWait < maxWaitMs) {
      console.log(`[Queue] Waiting for ${this.activeJobs} active jobs to complete...`);
      await this.sleep(1000);
    }

    if (this.activeJobs > 0) {
      console.warn(`[Queue] Shutdown timeout reached, ${this.activeJobs} jobs still active`);
    } else {
      console.log('[Queue] All jobs completed, shutdown complete');
    }
  }
}

// Singleton enforcement - prevent multiple queue instances.
// Stored on globalThis so Next.js dev (which loads this module in separate
// instances for instrumentation vs route handlers) shares ONE queue.
const globalForQueue = globalThis as unknown as {
  __hydraQueue?: PersistentJobQueue;
  __hydraQueueInit?: Promise<PersistentJobQueue>;
};

export function getJobQueue(): PersistentJobQueue {
  if (!globalForQueue.__hydraQueue) {
    globalForQueue.__hydraQueue = new PersistentJobQueue();
  }
  return globalForQueue.__hydraQueue;
}

export async function initializeJobQueue(): Promise<PersistentJobQueue> {
  if (globalForQueue.__hydraQueueInit) return globalForQueue.__hydraQueueInit;

  globalForQueue.__hydraQueueInit = (async () => {
    const queue = getJobQueue();
    await queue.bootstrap();
    queue.startLoop();
    return queue;
  })();

  return globalForQueue.__hydraQueueInit;
}

// Backward compatibility
export const jobQueue = getJobQueue();