// HydraSkript - Next.js server instrumentation
// Runs once when the server process boots (dev and prod). Starts the job queue
// background poll loop so queued/stuck jobs are resumed after a restart.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { jobQueue } = await import('@/lib/workers/queue');
      await jobQueue.bootstrap();
      jobQueue.startLoop();
    } catch (error) {
      console.error('[Instrumentation] Failed to start job queue loop:', error);
    }
  }
}
