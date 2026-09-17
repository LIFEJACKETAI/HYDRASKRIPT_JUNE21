// HydraSkript - Queue Pump (serverless-safe background driver)
//
// WHY THIS EXISTS:
// The in-process poll loop in queue.ts only runs while a serverless function is
// warm AND actively serving a request. When a long generation chain (e.g. a
// whole book of chapters in one approve request) exceeds the function timeout,
// the instance freezes mid-job and — with nothing to re-drive the queue — all
// remaining chapters sit at "Pending" forever (a book that has a title but no
// content, with generation stuck).
//
// This route is the durable driver:
//   1. It recovers expired leases and reconciles stuck books.
//   2. It claims and runs ONE queued job at a time (claims are atomic in the DB,
//      so overlapping pumps never double-run the same job).
//   3. After each job it RE-KICKS itself over HTTP. Because a new HTTP request
//      lands on a fresh (warm) function with a fresh timeout budget, the chain
//      walks job-after-job across invocations instead of dying with one frozen
//      instance. It also loops in-invocation until `deadlineMs` approaches the
//      function's maxDuration.
//   4. vercel.json schedules it as a daily backstop for dead chains (once-a-day
//      is the most Vercel Hobby allows; on Pro, tighten it to `* * * * *`).
//
// Triggers: Vercel Cron (Authorization: Bearer $CRON_SECRET), the queue itself
// (same secret), or — in local/dev — direct calls. Never call jobs directly
// from serverless request handlers; enqueue them and let the pump drive them.

import { after, NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getJobQueue } from '@/lib/workers/queue';
import { isPumpRequestAuthorized, pumpAuthToken, resolvePumpUrl } from '@/lib/workers/queue-pump-client';

// Long-running job types (e.g. manuscript import) mine one LLM window per
// invocation, so give the pump a comfortable budget (Vercel Pro honors 300s;
// Hobby caps functions at 60s — set QUEUE_PUMP_DEADLINE_MS=30000 there).
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Stop claiming work this far before the platform kills the function, so the
 * final status write always lands and a lease is never orphaned. Default 270s
 * assumes the 300s `maxDuration` above.
 */
const DEADLINE_MS = parseInt(process.env.QUEUE_PUMP_DEADLINE_MS || '270000', 10);
const MAX_BUSY_WAITS = 3; // don't spend a whole invocation waiting on one slow job

function isAuthorized(req: NextRequest): boolean {
  return isPumpRequestAuthorized(req);
}

/**
 * Reconcile books that are mid-generation but have no active/queued driver.
 * This repairs chains that were cut by a frozen/killed function instance.
 *
 * `reconcileStuckBooks` runs on every kick, so it must stay cheap: it selects
 * ONLY the chapter columns it reads. The old `include: { chapters: true }`
 * pulled every chapter's full prose (megabytes for a 500k-char book) into the
 * function on every 5-second poll — that is how the queue starved the pg pool
 * and started throwing P2028 on its own status updates.
 */
let lastReconcileAt = 0;
const RECONCILE_INTERVAL_MS = parseInt(process.env.QUEUE_RECONCILE_INTERVAL_MS || '45000', 10);

async function reconcileStuckBooks(): Promise<number> {
  let enqueued = 0;
  const now = Date.now();
  if (now - lastReconcileAt < RECONCILE_INTERVAL_MS) return 0;
  lastReconcileAt = now;
  try {
    const stuck = await db.book.findMany({
      where: {
        status: { in: ['outlining', 'writing', 'finalizing'] },
      },
      include: {
        jobs: { where: { status: { in: ['queued', 'active'] } }, select: { id: true } },
        chapters: {
          orderBy: { index: 'asc' },
          select: { id: true, index: true, status: true, approvalStatus: true },
        },
      },
      take: 50,
    });

    for (const book of stuck) {
      if (book.jobs.length > 0) continue; // already has a driver

      if (book.status === 'outlining') {
        await db.job.create({
          data: {
            bookId: book.id,
            ownerId: book.ownerId,
            jobType: 'generate_outline',
            status: 'queued',
            progressMessage: 'Recovered interrupted book — resuming outline.',
            progressPercent: 0,
            creditsReserved: 0,
            creditsConsumed: 0,
            stepIndex: 0,
            retryCount: 0,
            maxRetries: 3,
            result: '{}',
          },
        });
        enqueued++;
      } else if (book.status === 'writing') {
        if (!book.chapters.length) continue
        // Next chapter that still needs writing (pending, or failed -> retry).
        const next = book.chapters.find((c: { status: string }) => c.status === 'pending' || c.status === 'failed');
        if (next) {
          const autoApprove = book.chapters.some(
            (c: { status: string; approvalStatus?: string }) => c.status === 'awaiting_approval' && c.approvalStatus !== 'approved'
          )
            ? false
            : true; // only keep auto-chaining when there is nothing awaiting review
          await db.job.create({
            data: {
              bookId: book.id,
              ownerId: book.ownerId,
              jobType: 'write_chapter',
              status: 'queued',
              progressMessage: 'Recovered interrupted book — resuming chapter writing.',
              progressPercent: 0,
              creditsReserved: 0,
              creditsConsumed: 0,
              stepIndex: next.index,
              retryCount: 0,
              maxRetries: 3,
              result: autoApprove ? JSON.stringify({ autoApprove: true }) : '{}',
            },
          });
          enqueued++;
        } else {
          // Chapters exist but none pending; either awaiting review (interactive
          // mode — wait for user) or all done -> finalize.
          const allDone = book.chapters.every(
            (c) => c.status === 'completed' && c.approvalStatus === 'approved'
          );
          if (allDone) {
            const totalCredits = book.totalCreditsEstimated || 0;
            await db.job.create({
              data: {
                bookId: book.id,
                ownerId: book.ownerId,
                jobType: 'finalize_book',
                status: 'queued',
                progressMessage: 'Recovered interrupted book — resuming finalization.',
                creditsReserved: 0,
                creditsConsumed: totalCredits,
                stepIndex: 0,
                retryCount: 0,
                maxRetries: 3,
                result: '{}',
              },
            });
            enqueued++;
          }
        }
      } else if (book.status === 'finalizing') {
        const totalCredits = book.totalCreditsEstimated || 0;
        await db.job.create({
          data: {
            bookId: book.id,
            ownerId: book.ownerId,
            jobType: 'finalize_book',
            status: 'queued',
            progressMessage: 'Recovered interrupted book — resuming finalization.',
            creditsReserved: 0,
            creditsConsumed: totalCredits,
            stepIndex: 0,
            retryCount: 0,
            maxRetries: 3,
            result: '{}',
          },
        });
        enqueued++;
      }
    }
  } catch (error) {
    console.error('[QueuePump] reconcileStuckBooks failed (non-fatal):', error);
  }
  return enqueued;
}

/**
 * Self-heal jobs that can never make progress again.
 *
 * A generation job whose book is already finished/failed (or deleted) must not
 * stay `queued`/`active`: the UI derives its "still generating" banner from
 * exactly those two statuses, so one orphaned row looks identical to real
 * progress — it just reads "Queued..." forever. Deliberately narrow: only
 * unambiguous book states, and only after 10 quiet minutes, so this can never
 * snatch a job that a chaining worker queued a moment ago.
 */
async function settleOrphanedGenerationJobs(): Promise<number> {
  try {
    const olderThan = new Date(Date.now() - 10 * 60 * 1000);
    const settled = await db.job.updateMany({
      where: {
        status: { in: ['queued', 'active'] },
        createdAt: { lt: olderThan },
        jobType: { in: ['generate_outline', 'write_chapter', 'finalize_book'] },
        OR: [{ book: { is: null } }, { book: { status: { in: ['completed', 'failed'] } } }],
      },
      data: {
        status: 'failed',
        progressMessage: 'Closed: the book is no longer generating (stale job cleaned up by the queue pump).',
        errorMessage: null,
        leaseExpiresAt: null,
      },
    });
    if (settled.count > 0) {
      console.log(`[QueuePump] Settled ${settled.count} orphaned generation job(s).`);
    }
    return settled.count;
  } catch (error) {
    console.error('[QueuePump] settleOrphanedGenerationJobs failed (non-fatal):', error);
    return 0;
  }
}

/**
 * Self-kick helper. The request lands on a fresh function instance with a fresh
 * timeout, so the job chain continues even after this instance finishes.
 */
async function kickNextPump(): Promise<void> {
  const primaryUrl = resolvePumpUrl();
  const token = pumpAuthToken();

  const urls = [primaryUrl];
  const vercelCandidate = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`
    : '';
  if (vercelCandidate && !urls.includes(vercelCandidate)) {
    urls.push(vercelCandidate);
  }

  for (const baseUrl of urls) {
    const url = `${baseUrl}/api/queue/pump`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'x-queue-pump-secret': token,
          'cache-control': 'no-cache',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok || res.status === 202) {
        return;
      }
      console.warn(`[QueuePump] self-kick returned status ${res.status} on ${url}`);
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') return;
      console.warn(`[QueuePump] self-kick failed on ${url}:`, e);
    }
  }
}

async function runPump(): Promise<{ ran: number; recovered: number }> {
  const queue = getJobQueue();
  await queue.bootstrap();

  const recovered = (await reconcileStuckBooks()) + (await settleOrphanedGenerationJobs());

  let ran = 0;
  let waited = 0;
  const start = Date.now();

  // Process one job at a time until the deadline. Each claim is atomic, so
  // overlapping pump invocations cannot double-run a job.
  while (Date.now() - start < DEADLINE_MS) {
    const state = await queue.processOneQueuedJob();
    if (state === 'busy') {
      // This instance is already mid-job. Breaking out here used to strand every
      // queued job behind the running one (an editorial review or manuscript
      // import holds the only slot for minutes, and each kick bounced off
      // 'busy') — the job sat at "Queued..." while the work queue was in fact
      // healthy. Wait for the slot instead, bounded so we never outlive the
      // function or spin on one very slow job.
      if (waited >= MAX_BUSY_WAITS) break;
      waited++;
      // Cap each wait at 60s so a pump can never idle its way to the function
      // limit: three capped waits (<=3 min) is enough to catch a job finishing
      // normally, and past that the running instance's own self-kick owns the
      // chain.
      const remaining = Math.min(60_000, DEADLINE_MS - (Date.now() - start) - 15_000);
      if (remaining <= 0) break;
      const free = await queue.waitForCapacity(remaining);
      if (!free) break;
      continue;
    }
    if (state === 'idle') break; // no more queued jobs
    ran++;

    // Re-kick so the chain survives this instance freezing. Cheap and idempotent.
    await kickNextPump();
  }

  return { ran, recovered };
}

/** Read-only queue snapshot for `?stats=1` — see the bottom of this comment. */
async function pumpStats() {
  const [queued, active] = await Promise.all([
    db.job.count({ where: { status: 'queued' } }),
    db.job.count({ where: { status: 'active' } }),
  ]);
  const oldest = await db.job.findFirst({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, jobType: true, createdAt: true, retryCount: true, progressMessage: true },
  });
  return {
    queued,
    active,
    oldestQueued: oldest
      ? {
          id: oldest.id,
          jobType: oldest.jobType,
          retryCount: oldest.retryCount,
          progressMessage: oldest.progressMessage,
          waitingSeconds: Math.round((Date.now() - new Date(oldest.createdAt).getTime()) / 1000),
        }
      : null,
    serverless: Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME),
    deadlineMs: DEADLINE_MS,
  };
}

async function handlePump(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // `?stats=1` answers immediately with queue depth and does NOT claim anything.
  // Debug a wedged queue with:
  //   curl -H "x-queue-pump-secret: $CRON_SECRET" \
  //        'https://www.hydraskript.com/api/queue/pump?stats=1'
  if (req.nextUrl.searchParams.get('stats') === '1') {
    try {
      return NextResponse.json({ success: true, data: await pumpStats() });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'stats failed' },
        { status: 500 }
      );
    }
  }

  // Return 202 immediately and keep working after the response. Kick callers
  // (import POST, job poll, cron) otherwise wait on runPump() — up to 270s —
  // and Vercel kills the *caller* while the pump itself never finishes.
  //
  // NOTE: `after` must be imported from 'next/server' — it is NOT a global.
  // Calling a bare `after(...)` failed `tsc` (TS2304, which broke the Vercel
  // build) and would otherwise have thrown ReferenceError at runtime, silently
  // turning every pump request into a multi-minute blocking one.
  try {
    after(() =>
      runPump().catch((error) => {
        console.error('[QueuePump] background run failed:', error);
      })
    );
    return NextResponse.json({ success: true, accepted: true });
  } catch (scheduleError) {
    console.warn('[QueuePump] after() unavailable, running inline:', scheduleError);
    try {
      const result = await runPump();
      return NextResponse.json({ success: true, ...result });
    } catch (error) {
      console.error('[QueuePump] failed:', error);
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'pump failed' },
        { status: 500 }
      );
    }
  }
}

export async function GET(req: NextRequest) {
  return handlePump(req);
}

export async function POST(req: NextRequest) {
  return handlePump(req);
}
