// HydraSkript - Next.js server instrumentation
// Runs once when the server process boots (dev and prod). Starts the job queue
// background poll loop so queued/stuck jobs are resumed after a restart.
// Uses singleton initialization to prevent duplicate queue instances.

let instrumentationRegistered = false;

export async function register() {
  if (instrumentationRegistered) return;
  instrumentationRegistered = true;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { initializeJobQueue } = await import('@/lib/workers/queue');
      await initializeJobQueue();
    } catch (error) {
      console.error('[Instrumentation] Failed to start job queue loop:', error);
    }
  }
}

// Graceful shutdown handler for production
if (process.env.NEXT_RUNTIME === 'nodejs') {
  let shutdownRegistered = false;
  
  const shutdown = async () => {
    try {
      const { getJobQueue } = await import('@/lib/workers/queue');
      const queue = getJobQueue();
      await queue.shutdownGracefully();
    } catch (error) {
      console.error('[Instrumentation] Graceful shutdown failed:', error);
    }
  };

  if (!shutdownRegistered) {
    shutdownRegistered = true;
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}
