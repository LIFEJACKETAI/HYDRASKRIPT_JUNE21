// HydraSkript - Persistent Postgres Job Queue
// DB-backed state machine with lease, heartbeat, and retry semantics backed by Prisma fields
// PRODUCTION HARDENED: Connection pooling, retries without interactive transactions,
// singleton enforcement, serverless pump (no in-process loop on Vercel).

import { db } from '@/lib/db'
import { WorkerRegistry } from './registry'
import type { JobType, JobStatus } from '@/types'
import { isServerless, kickQueuePump } from './queue-pump-client'

export { isServerless, kickQueuePump, maybeKickQueueForJob } from './queue-pump-client'

const DEFAULT_MAX_RETRIES = 3
const LEASE_DURATION_MS = 15 * 60 * 1000
const HEARTBEAT_INTERVAL_MS = 60_000
const MAX_RETRIES = 3
const BASE_RETRY_DELAY_MS = 150
const MAX_RETRY_DELAY_MS = 2000

type QueueWorkerJob = {
  id: string
  bookId?: string | null
  ownerId: string
  stepIndex?: number | null
  creditsConsumed?: number | null
  result?: string | null
}

function isRetryableDbError(error: Error): boolean {
  const msg = error.message
  return (
    msg.includes('P2028') ||
    msg.includes('Unable to start a transaction') ||
    msg.includes('Transaction API error') ||
    msg.includes('P1001') ||
    msg.includes("Can't reach database") ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ECONNRESET') ||
    msg.includes('connection timed out') ||
    msg.includes('timeout exceeded when trying to connect') ||
    msg.includes('MaxClientsInSessionMode') ||
    msg.includes('remaining connection slots') ||
    msg.includes('too many clients')
  )
}

class PersistentJobQueue {
  private isProcessing = false
  private maxConcurrent = 1
  private activeJobs = 0
  private bootstrapped = false
  private loopStarted = false
  private shutdown = false

  private getLeaseExpiry(from = new Date()) {
    return new Date(from.getTime() + LEASE_DURATION_MS)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Retry a single Prisma call. Intentionally NOT wrapped in `$transaction`:
   * interactive transactions each need a dedicated pooled connection, which
   * under Vercel + PgBouncer is exactly what throws P2028
   * ("Unable to start a transaction in the given time").
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries = MAX_RETRIES
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        const isAuthError =
          lastError.message.includes('P1000') ||
          lastError.message.includes('Authentication failed') ||
          lastError.message.includes('credentials are not valid')

        if (isAuthError || !isRetryableDbError(lastError) || attempt === maxRetries) {
          console.error(`[Queue] ${context} failed after ${attempt + 1} attempts:`, lastError.message)
          throw lastError
        }

        const delay = Math.min(
          BASE_RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 100,
          MAX_RETRY_DELAY_MS
        )

        console.warn(
          `[Queue] ${context} attempt ${attempt + 1} failed (${lastError.message}), retrying in ${delay}ms...`
        )
        await this.sleep(delay)
      }
    }

    throw lastError
  }

  async createJob(params: {
    bookId?: string
    ownerId: string
    jobType: JobType
    creditsReserved: number
    stepIndex?: number
    creditsConsumed?: number
    maxRetries?: number
    result?: string
  }): Promise<string> {
    const maxRetries = params.maxRetries ?? DEFAULT_MAX_RETRIES

    return this.withRetry(async () => {
      const job = await db.job.create({
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
      })
      return job.id
    }, 'createJob')
  }

  async startJob(jobId: string, jobType: JobType): Promise<void> {
    console.log(`[Queue] Job ${jobId} signaled for processing (${jobType})`)
    await this.bootstrap()

    // In a serverless deployment the in-process loop only runs while a function
    // is warm and serving traffic. Drive the job via the HTTP pump so the chain
    // survives instance freezes; locally use the in-process loop directly.
    if (isServerless()) {
      kickQueuePump()
    } else {
      void this.processNext()
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
    if (this.shutdown) return 'busy'
    if (this.activeJobs >= this.maxConcurrent || this.isProcessing) return 'busy'

    let jobToProcess: Awaited<ReturnType<typeof this.claimNextJob>> = null
    this.isProcessing = true
    try {
      try {
        jobToProcess = await this.claimNextJob()
      } catch (error) {
        console.error('[Queue] Failed to claim next job:', error)
        return 'idle'
      }

      if (!jobToProcess) return 'idle'

      this.activeJobs++
      const heartbeatTimer = setInterval(() => {
        void this.heartbeat(jobToProcess!.id)
      }, HEARTBEAT_INTERVAL_MS)

      try {
        console.log(`[Queue] Executing ${jobToProcess.jobType} job ${jobToProcess.id}`)
        const workerFn = WorkerRegistry[jobToProcess.jobType]
        if (!workerFn) {
          throw new Error(`No worker registered for job type: ${jobToProcess.jobType}`)
        }

        const workerJob: QueueWorkerJob = {
          id: jobToProcess.id,
          bookId: jobToProcess.bookId,
          ownerId: jobToProcess.ownerId,
          stepIndex: jobToProcess.stepIndex,
          creditsConsumed: jobToProcess.creditsConsumed,
          result: jobToProcess.result,
        }

        await workerFn(workerJob)
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error)
        console.error(`[Queue] Job ${jobToProcess.id} failed:`, errMessage)

        const nextRetryCount = jobToProcess.retryCount + 1
        const canRetry = nextRetryCount <= jobToProcess.maxRetries

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
          })
        } catch (updateError) {
          console.error('[Queue] Failed to update job status after failure:', updateError)
        }

        if (!canRetry) {
          try {
            const { refundCredits } = await import('@/lib/utils/credits')
            await refundCredits(jobToProcess.id, `Job failed: ${errMessage}`)
          } catch (e) {
            console.error('[Queue] Refund failed:', e)
          }
        }
      } finally {
        clearInterval(heartbeatTimer)
        this.activeJobs--
      }

      return 'ran'
    } finally {
      this.isProcessing = false
    }
  }

  private async processNext(): Promise<void> {
    if (this.shutdown) return
    try {
      await this.processOneQueuedJob()
    } catch (error) {
      console.error('[Queue] processNext error:', error)
    } finally {
      this.scheduleNextPoll()
    }
  }

  private async claimNextJob(): Promise<{
    id: string
    bookId: string | null
    ownerId: string
    jobType: JobType
    retryCount: number
    maxRetries: number
    stepIndex: number | null
    creditsConsumed: number | null
    result: string | null
  } | null> {
    return this.withRetry(async () => {
      const queuedJob = await db.job.findFirst({
        where: { status: 'queued' },
        orderBy: { createdAt: 'asc' },
      })

      if (!queuedJob) return null

      const now = new Date()

      const claimed = await db.job.updateMany({
        where: { id: queuedJob.id, status: 'queued' },
        data: {
          status: 'active',
          progressMessage:
            queuedJob.retryCount > 0
              ? `Retrying (${queuedJob.retryCount}/${queuedJob.maxRetries})...`
              : 'Processing...',
          startedAt: queuedJob.startedAt ?? now,
          leaseExpiresAt: this.getLeaseExpiry(now),
          lastHeartbeatAt: now,
          errorMessage: null,
        },
      })

      if (claimed.count === 0) {
        return null
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
        result: queuedJob.result,
      }
    }, 'claimNextJob')
  }

  private scheduleNextPoll(): void {
    if (this.shutdown) return
    setTimeout(() => {
      void this.processNext()
    }, 100)
  }

  async bootstrap(): Promise<void> {
    await this.recoverExpiredLeases()

    if (this.bootstrapped) return
    this.bootstrapped = true
    console.log('[Queue] Recovered active jobs from last session.')
  }

  /**
   * Reset any job whose worker died (stale/expired lease) back to `queued` so
   * the next poll can pick it up. Safe to call repeatedly.
   */
  private async recoverExpiredLeases(): Promise<void> {
    const now = new Date()

    await this.withRetry(
      async () => {
        await db.job.updateMany({
          where: {
            status: 'active',
            OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
          },
          data: {
            status: 'queued',
            progressMessage: 'Recovering interrupted job...',
            leaseExpiresAt: null,
            lastHeartbeatAt: null,
          },
        })
      },
      'recoverExpiredLeases',
      2
    )
  }

  startLoop(pollIntervalMs = 5000, recoveryIntervalMs = 60_000): void {
    if (this.loopStarted) return
    if (isServerless()) {
      console.log('[Queue] Skipping in-process poll loop on serverless (HTTP pump is the driver).')
      return
    }
    this.loopStarted = true

    const pollJitter = () => pollIntervalMs + Math.random() * 1000
    const recoveryJitter = () => recoveryIntervalMs + Math.random() * 5000

    const tick = () => {
      if (!this.shutdown) void this.processNext()
    }

    const recover = () => {
      if (!this.shutdown) {
        void (async () => {
          try {
            await this.recoverExpiredLeases()
          } catch (error) {
            console.error('[Queue] Loop lease recovery failed:', error)
          }
        })()
      }
    }

    const pollInterval = setInterval(tick, pollJitter())
    const recoverInterval = setInterval(recover, recoveryJitter())

    ;(this as unknown as { _pollInterval?: ReturnType<typeof setInterval> })._pollInterval = pollInterval
    ;(this as unknown as { _recoverInterval?: ReturnType<typeof setInterval> })._recoverInterval = recoverInterval

    console.log(
      `[Queue] Background poll loop started (poll ${pollIntervalMs}ms, recovery ${recoveryIntervalMs}ms).`
    )
  }

  async heartbeat(jobId: string): Promise<void> {
    const now = new Date()

    try {
      await this.withRetry(
        async () => {
          await db.job.updateMany({
            where: { id: jobId, status: 'active' },
            data: {
              lastHeartbeatAt: now,
              leaseExpiresAt: this.getLeaseExpiry(now),
            },
          })
        },
        `heartbeat(${jobId})`,
        2
      )
    } catch (error) {
      console.error(`[Queue] Failed heartbeat for job ${jobId}:`, error)
    }
  }

  async updateJobStatus(
    jobId: string,
    update: {
      status?: JobStatus
      progressMessage?: string
      progressPercent?: number
      errorMessage?: string
      result?: Record<string, unknown>
      mergeResult?: boolean
      startedAt?: Date
      completedAt?: Date
      retryCount?: number
      leaseExpiresAt?: Date | null
      lastHeartbeatAt?: Date | null
    }
  ): Promise<void> {
    try {
      await this.withRetry(async () => {
        // jsonb || patch keeps `result.text` in Postgres. Fetching + rewriting
        // the 500k-char manuscript on every window was locking the job row and
        // starving heartbeats (P2028).
        if (update.result !== undefined && update.mergeResult) {
          const patchJson = JSON.stringify(update.result)
          await db.$executeRawUnsafe(
            `UPDATE "jobs" SET result = (COALESCE(NULLIF(result, ''), '{}')::jsonb || $1::jsonb)::text WHERE id = $2::uuid`,
            patchJson,
            jobId
          )
        }

        const resultPayload =
          update.result !== undefined && !update.mergeResult
            ? JSON.stringify(update.result)
            : undefined

        await db.job.update({
          where: { id: jobId },
          data: {
            ...(update.status && { status: update.status }),
            ...(update.progressMessage && { progressMessage: update.progressMessage }),
            ...(update.progressPercent !== undefined && { progressPercent: update.progressPercent }),
            ...(update.errorMessage && { errorMessage: update.errorMessage }),
            ...(resultPayload !== undefined && { result: resultPayload }),
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
        })
      }, `updateJobStatus(${jobId})`)
    } catch (error) {
      console.error(`[Queue] Failed to update job ${jobId}:`, error)
      if (update.status) throw error
    }
  }

  async getQueueSize(): Promise<number> {
    try {
      return await db.job.count({ where: { status: 'queued' } })
    } catch (error) {
      console.error('[Queue] Failed to get queue size:', error)
      return 0
    }
  }

  getActiveCount(): number {
    return this.activeJobs
  }

  async shutdownGracefully(): Promise<void> {
    console.log('[Queue] Initiating graceful shutdown...')
    this.shutdown = true

    const self = this as unknown as {
      _pollInterval?: ReturnType<typeof setInterval>
      _recoverInterval?: ReturnType<typeof setInterval>
    }
    if (self._pollInterval) clearInterval(self._pollInterval)
    if (self._recoverInterval) clearInterval(self._recoverInterval)

    const startWait = Date.now()
    const maxWaitMs = 30000

    while (this.activeJobs > 0 && Date.now() - startWait < maxWaitMs) {
      console.log(`[Queue] Waiting for ${this.activeJobs} active jobs to complete...`)
      await this.sleep(1000)
    }

    if (this.activeJobs > 0) {
      console.warn(`[Queue] Shutdown timeout reached, ${this.activeJobs} jobs still active`)
    } else {
      console.log('[Queue] All jobs completed, shutdown complete')
    }
  }
}

const globalForQueue = globalThis as unknown as {
  __hydraQueue?: PersistentJobQueue
  __hydraQueueInit?: Promise<PersistentJobQueue>
}

export function getJobQueue(): PersistentJobQueue {
  if (!globalForQueue.__hydraQueue) {
    globalForQueue.__hydraQueue = new PersistentJobQueue()
  }
  return globalForQueue.__hydraQueue
}

/**
 * Run one queued job in this isolate (via `after()` on serverless) AND HTTP-kick
 * the durable pump as a backup. HTTP-only kicks were dying because the pump
 * returned 202 without doing work, or kicked localhost / 401'd — leaving
 * generation stuck at "Queued...".
 */
export function scheduleQueueWork(): void {
  const run = async () => {
    try {
      const queue = getJobQueue()
      await queue.bootstrap()
      const state = await queue.processOneQueuedJob()
      if (state === 'ran' || state === 'busy') kickQueuePump()
    } catch (e) {
      console.error('[Queue] scheduleQueueWork failed:', e)
      kickQueuePump()
    }
  }

  if (!isServerless()) {
    void run()
    return
  }

  kickQueuePump()
  void import('next/server')
    .then((mod) => {
      if (typeof mod.after === 'function') {
        try {
          mod.after(run)
          return
        } catch {
          // outside a request scope
        }
      }
      void run()
    })
    .catch(() => {
      void run()
    })
}

export async function initializeJobQueue(): Promise<PersistentJobQueue> {
  if (globalForQueue.__hydraQueueInit) return globalForQueue.__hydraQueueInit

  globalForQueue.__hydraQueueInit = (async () => {
    const queue = getJobQueue()
    await queue.bootstrap()
    if (isServerless()) {
      kickQueuePump()
    } else {
      queue.startLoop()
    }
    return queue
  })()

  return globalForQueue.__hydraQueueInit
}

export const jobQueue = getJobQueue()
