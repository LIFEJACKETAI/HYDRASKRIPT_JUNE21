// HydraSkript - Post-response background work
//
// On a serverless platform (Vercel) an invocation is frozen the moment its HTTP
// response is flushed, so a detached `void somePromise()` is NOT enough to
// finish long-running work: the promise is simply suspended mid-await and only
// resumes if the instance happens to be reused later.
//
// Next.js `after()` (stable since 15.1) is the framework-owned primitive for
// this. On Vercel it is backed by Fluid Compute's `waitUntil`, which keeps the
// invocation alive — up to the route's `maxDuration` — to run secondary work
// after the client has already been answered. It also works on self-hosted
// Node servers, so the same code path is correct in Docker.
//
// Use this instead of `void promise` anywhere a route kicks off queue work.

import { after } from 'next/server';

/**
 * Schedule `task` to run after the current response finishes.
 * Never throws: failures are logged, because secondary work must not be able to
 * break a response the client has already received.
 *
 * Falls back to a detached promise when called outside a request scope
 * (scripts, tests, queue timers), where `after()` is unavailable.
 */
export function runInBackground(label: string, task: () => Promise<unknown>): void {
  const run = async () => {
    const startedAt = Date.now();
    try {
      await task();
    } catch (error) {
      console.error(
        `[Background:${label}] failed after ${Date.now() - startedAt}ms:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  try {
    after(run);
  } catch {
    // Outside a request scope (or an older Next.js runtime) — best effort.
    void run();
  }
}
