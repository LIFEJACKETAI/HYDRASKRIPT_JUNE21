// HydraSkript - Persistent Postgres Job Queue
// DB-backed state machine with lease, heartbeat, and retry semantics backed by Prisma fields
// PRODUCTION HARDENED: Connection pooling, retries without interactive transactions,
// singleton enforcement, serverless pump (no in-process loop on Vercel).

import { db } from '@/lib/db'
import { WorkerRegistry } from './registry'
import type { JobType, JobStatus } from '@/types'
import { isServerless, kickQueuePump, forceKickQueuePump } from './queue-pump-client'
import {
  defaultClaimBudgetMs,
  isLlmBudgetExceeded,
  isProviderTransientError,
  runWithLlmBudget,
} from '@/lib/llm/budget'

export { isServerless, kickQueuePump, forceKickQueuePump, maybeKickQueueForJob } from './queue-pump-client'

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const DEFAULT_MAX_RETRIES = 3
const MAX_RETRIES = 3
const BASE_RETRY_DELAY_MS = 150
const MAX_RETRY_DELAY_MS = envInt('QUEUE_RETRY_MAX_DELAY_MS', 8_000)

/**
 * LEASE = how long a claim may go un-confirmed before another pump may take the
 * job over. It used to be 15 minutes while a Vercel function may only live 5.
 * So whenever an instance died mid-job (freeze, redeploy, platform kill) the job
 * was un-recoverable for ~15 minutes — the single biggest cause of "stuck on
 * Queued...". A lease only has to beat the heartbeat interval by a wide margin:
 * 2 min of lease refreshed every 30s means a dead worker is reclaimed in <=2min
 * while a live worker (which renews on every heartbeat) can never be stolen.
 */
const LEASE_DURATION_MS = envInt('QUEUE_LEASE_MS', isServerless() ? 120_000 : 15 * 60_000)
const HEARTBEAT_INTERVAL_MS = envInt('QUEUE_HEARTBEAT_MS', Math.max(15_000, Math.floor(LEASE_DURATION_MS / 4)))
/** A job re-queued for backoff is not claimable until this many ms have passed. */
const TRANSIENT_BACKOFF_MS = envInt('QUEUE_BACKOFF_MS', 30_000)

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
   *
   * `maxDelayMs` escalates far beyond the normal 2s cap for *terminal* writes
   * (see settleJobStatus): a lost `completed` update is what made a finished
   * book look permanently queued in the UI.
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries = MAX_RETRIES,
    maxDelayMs = 2_000
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
          maxDelayMs
        )

        console.warn(
          `[Queue] ${context} attempt ${attempt + 1} failed (${lastError.message}), retrying in ${Math.round(delay)}ms...`
        )
        await this.sleep(delay)
      }
    }

    throw lastError
  }

  /**
   * Terminal state write (completed / failed / re-queued). These decide what the
   * user sees, so they retry harder than normal queries AND, uniquely, must
   * never be swallowed: if the DB is still refusing after ~30s we log at error
   * level with the job id so it can be reconciled by hand.
   */
  async settleJobStatus(
    jobId: string,
    update: Parameters<PersistentJobQueue['updateJobStatus']>[1]
  ): Promise<void> {
    try {
      await this.withRetry(() => this.applyJobUpdate(jobId, update), `settleJobStatus(${jobId})`, 8, MAX_RETRY_DELAY_MS)
    } catch (error) {
      console.error(
        `[Queue] CRITICAL: could not persist terminal status "${update.status}" for job ${jobId}. ` +
          `The lease recovery pass will retry this job. Cause: ${
            error instanceof Error ? error.message : String(error)
          }`
      )
      throw error
    }
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

    // A job was just created, so this is a *forced* kick: never throttled.
    // Locally the in-process loop drives it; on serverless we also run one claim
    // inside this (already warm, full-budget) invocation via after(), with the
    // HTTP pump as the durable backup for when this instance freezes.
    if (isServerless()) {
      forceKickQueuePump()
      scheduleQueueWork()
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

        // Run the worker inside an explicit work budget (see llm/budget.ts).
        // Workers that would otherwise be frozen mid-LLM-call now stop early and
        // are re-queued with backoff, which keeps leases short and the queue
        // flowing instead of stranding a job in `active`.
        await runWithLlmBudget(defaultClaimBudgetMs(), () => workerFn(workerJob))

        // Every worker is expected to settle its own job (completed/failed). If it
        // returned cleanly but the row is still `active`, the write was lost —
        // usually a P2028 under pool contention. Settle it here, otherwise the
        // lease expires in 2 minutes, the job is re-claimed, and the user watches
        // the same chapter generate over and over while the book looks "Queued".
        const settled = await db.job.findUnique({
          where: { id: jobToProcess.id },
          select: { status: true },
        })
        if (settled?.status === 'active') {
          console.warn(
            `[Queue] Job ${jobToProcess.id} finished but was never settled — marking it completed.`
          )
          await this.settleJobStatus(jobToProcess.id, {
            status: 'completed',
            progressMessage: 'Done.',
            progressPercent: 100,
          })
        }
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error)
        console.error(`[Queue] Job ${jobToProcess.id} failed:`, errMessage)

        const nextRetryCount = jobToProcess.retryCount + 1
        const canRetry = nextRetryCount <= jobToProcess.maxRetries

        // "Provider is overloaded" / "out of time in this claim" are not the
        // book's fault. Re-queue with a backoff so a later (warm, healthy)
        // claim can succeed, instead of failing the user's generation on a
        // transient 503 — and instead of the old behaviour of silently sitting
        // in `active` behind a frozen instance.
        const transient = isLlmBudgetExceeded(error) || isProviderTransientError(errMessage)
        const backoffUntil = new Date(Date.now() + TRANSIENT_BACKOFF_MS * nextRetryCount)

        try {
          await this.settleJobStatus(jobToProcess.id, {
            status: canRetry ? 'queued' : 'failed',
            errorMessage: errMessage.slice(0, 2000),
            progressMessage: canRetry
              ? transient
                ? `Providers busy — re-queued, retry ${nextRetryCount}/${jobToProcess.maxRetries}.`
                : `Retrying (${nextRetryCount}/${jobToProcess.maxRetries}) after failure.`
              : `Failed: ${errMessage}`,
            retryCount: nextRetryCount,
            // Doubles as "don't claim me before this" for queued jobs, and is
            // cleared by the claim itself.
            leaseExpiresAt: canRetry && transient ? backoffUntil : null,
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

  /**
   * Block until this instance has a free worker slot (or the wait expires).
   *
   * WHY: `maxConcurrent` is 1 per instance and the pump used to `break` out of
   * its loop the moment a claim returned 'busy'. Any job queued behind a
   * long-running one (an editorial review or a manuscript import can run for
   * minutes) therefore starved: every 5s poll kicked the pump, every kick saw
   * the busy flag and did nothing — "Queued..." forever. Waiting here lets the
   * same invocation pick the job up the instant the slot frees.
   */
  async waitForCapacity(maxWaitMs: number, pollMs = 1_500): Promise<boolean> {
    const until = Date.now() + Math.max(0, maxWaitMs)
    while (Date.now() < until) {
      if (this.shutdown) return false
      if (!this.isProcessing && this.activeJobs < this.maxConcurrent) return true
      await this.sleep(Math.min(pollMs, Math.max(100, until - Date.now())))
    }
    return !this.isProcessing && this.activeJobs < this.maxConcurrent
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
      const now = new Date()

      const queuedJob = await db.job.findFirst({
        where: {
          status: 'queued',
          // Backoff: a job re-queued after a transient provider failure carries a
          // future leaseExpiresAt meaning "not claimable yet". Without this
          // filter, every kick would instantly re-claim a job whose providers are
          // all 503-ing and spin the queue.
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
        orderBy: { createdAt: 'asc' },
        // Only the columns the dispatcher needs. `result` can hold a 500k-char
        // manuscript, and this query runs on every pump kick.
        select: {
          id: true,
          bookId: true,
          ownerId: true,
          jobType: true,
          retryCount: true,
          maxRetries: true,
          stepIndex: true,
          creditsConsumed: true,
          result: true,
          startedAt: true,
          progressPercent: true,
        },
      })

      if (!queuedJob) return null

      const claimed = await db.job.updateMany({
        where: { id: queuedJob.id, status: 'queued' },
        data: {
          status: 'active',
          progressMessage:
            queuedJob.retryCount > 0
              ? `Retrying (${queuedJob.retryCount}/${queuedJob.maxRetries})...`
              : 'Processing...',
          // Move the bar off 0% so the UI can distinguish "claimed, working"
          // from "nobody has picked this up yet".
          progressPercent: Math.max(queuedJob.progressPercent, 5),
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
   *
   * Two independent signals are used, because a Vercel instance frozen mid-job
   * stops *both* the lease renewal and the heartbeat, and either one alone can
   * be missing on rows written by older builds:
   *   - leaseExpiresAt in the past (or null, i.e. never renewed)
   *   - lastHeartbeatAt older than 4 heartbeat intervals
   */
  private async recoverExpiredLeases(): Promise<void> {
    const now = new Date()
    const staleHeartbeatBefore = new Date(now.getTime() - HEARTBEAT_INTERVAL_MS * 4)

    await this.withRetry(
      async () => {
        await db.job.updateMany({
          where: {
            status: 'active',
            OR: [
              { leaseExpiresAt: null },
              { leaseExpiresAt: { lte: now } },
              { lastHeartbeatAt: { lte: staleHeartbeatBefore } },
            ],
          },
          data: {
            status: 'queued',
            progressMessage: 'Worker went away mid-job — re-queuing.',
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

  /**
   * The raw job UPDATE. Kept free of retry logic so callers can choose how hard
   * to try (progress = cheap/swallow, terminal = settleJobStatus).
   */
  private async applyJobUpdate(
    jobId: string,
    update: Parameters<PersistentJobQueue['updateJobStatus']>[1]
  ): Promise<void> {
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
    // Terminal/queued transitions decide whether the chain continues, so they
    // must surface failures (the caller's catch/refund path depends on it).
    // Progress messages are cosmetic: a dropped one must never fail a job.
    const isTerminal = update.status !== undefined
    try {
      if (isTerminal) {
        await this.settleJobStatus(jobId, update)
        return
      }
      await this.withRetry(() => this.applyJobUpdate(jobId, update), `updateJobStatus(${jobId})`)
    } catch (error) {
      console.error(`[Queue] Failed to update job ${jobId}:`, error)
      if (isTerminal) throw error
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
      // 'ran' -> more jobs may be chained; 'busy' -> this instance is mid-job and
      // its own post-job self-kick will keep the chain moving. Either way the pump
      // has to be re-armed so nothing is left waiting on a frozen isolate.
      if (state === 'ran' || state === 'busy') forceKickQueuePump()
    } catch (e) {
      console.error('[Queue] scheduleQueueWork failed:', e)
      forceKickQueuePump()
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
      // Cold start: sweep anything an earlier instance left behind, then hand the
      // work to the HTTP pump (throttled kick - this is not a fresh job).
      kickQueuePump()
    } else {
      queue.startLoop()
    }
    return queue
  })()

  return globalForQueue.__hydraQueueInit
}

export const jobQueue = getJobQueue()
