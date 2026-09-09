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
//   4. vercel.json schedules it as a daily backstop for dead chains.
//
// Triggers: Vercel Cron (Authorization: Bearer $CRON_SECRET), the queue itself
// (same secret), or — in local/dev — direct calls. Never call jobs directly
// from serverless request handlers; enqueue them and let the pump drive them.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getJobQueue } from '@/lib/workers/queue';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const DEADLINE_MS = 50_000; // leave headroom under maxDuration for the response

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;

  // Local/dev (no secret configured) — allow so the queue driver works out of
  // the box. In production a CRON_SECRET is mandatory (Vercel auto-injects it
  // once a cron is declared), preventing anyone from triggering job runs.
  if (!secret) return process.env.NODE_ENV !== 'production';

  // Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true;

  // Self-kick / queue kicks use an explicit header.
  if (req.headers.get('x-queue-pump-secret') === secret) return true;

  return false;
}

/**
 * Reconcile books that are mid-generation but have no active/queued driver.
 * This repairs chains that were cut by a frozen/killed function instance.
 */
async function reconcileStuckBooks(): Promise<number> {
  let enqueued = 0;
  try {
    const stuck = await db.book.findMany({
      where: {
        status: { in: ['writing', 'finalizing'] },
        chapters: { some: {} },
      },
      include: {
        jobs: { where: { status: { in: ['queued', 'active'] } }, select: { id: true } },
        chapters: { orderBy: { index: 'asc' } },
      },
      take: 50,
    });

    for (const book of stuck) {
      if (book.jobs.length > 0) continue; // already has a driver

      if (book.status === 'writing') {
        // Next chapter that still needs writing (pending, or failed -> retry).
        const next = book.chapters.find((c) => c.status === 'pending' || c.status === 'failed');
        if (next) {
          const autoApprove = book.chapters.some(
            (c) => c.status === 'awaiting_approval' && c.approvalStatus !== 'approved'
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
 * Fire-and-forget self-kick. The request lands on a fresh function instance
 * with a fresh timeout, so the job chain continues even after this instance
 * freezes. Uses an absolute URL (this runs server-side; Vercel routes the
 * deployment hostname correctly).
 */
function appBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`;
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  return 'http://localhost:3002';
}

function kickNextPump(): void {
  try {
    const secret = process.env.CRON_SECRET || '';
    const url = `${appBaseUrl()}/api/queue/pump`;
    void fetch(url, {
      method: 'POST',
      headers: {
        'x-queue-pump-secret': secret || 'local-dev',
        'cache-control': 'no-cache',
      },
      // Don't await; never let the kick block or crash the current response.
    }).catch((e) => console.warn('[QueuePump] self-kick failed:', e));
  } catch (e) {
    console.warn('[QueuePump] kickNextPump error:', e);
  }
}

async function runPump(): Promise<{ ran: number; recovered: number }> {
  const queue = getJobQueue();
  await queue.bootstrap();

  const recovered = await reconcileStuckBooks();

  let ran = 0;
  const start = Date.now();

  // Process one job at a time until the deadline. Each claim is atomic, so
  // overlapping pump invocations cannot double-run a job.
  while (Date.now() - start < DEADLINE_MS) {
    const state = await queue.processOneQueuedJob();
    if (state === 'busy') {
      // Another worker on this instance holds the slot; stop and let it finish.
      break;
    }
    if (state === 'idle') break; // no more queued jobs
    ran++;

    // Re-kick so the chain survives this instance freezing. Cheap and idempotent.
    kickNextPump();
  }

  return { ran, recovered };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runPump();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[QueuePump] GET failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'pump failed' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runPump();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[QueuePump] POST failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'pump failed' },
      { status: 500 }
    );
  }
}
