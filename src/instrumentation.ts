// HydraSkript - Next.js server instrumentation
// Runs once when the server process boots (dev and prod). Starts the job queue
// background poll loop so queued/stuck jobs are resumed after a restart.
// Uses singleton initialization to prevent duplicate queue instances.

let instrumentationRegistered = false

export async function register() {
  if (instrumentationRegistered) return
  instrumentationRegistered = true

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { initializeJobQueue, isServerless, scheduleQueueWork } = await import('@/lib/workers/queue')
      if (isServerless()) {
        // Do NOT start the in-process poll loop on Vercel. Every warm lambda
        // that served a request used to open its own loop + pg pool, which
        // exhausted Supabase and produced P2028 on heartbeats. Drive one job
        // via after() and HTTP-kick the pump as backup.
        scheduleQueueWork()
      } else {
        await initializeJobQueue()
      }
    } catch (error) {
      console.error('[Instrumentation] Failed to start job queue loop:', error)
    }
  }
}

if (process.env.NEXT_RUNTIME === 'nodejs') {
  let shutdownRegistered = false

  const shutdown = async () => {
    try {
      const { getJobQueue } = await import('@/lib/workers/queue')
      const queue = getJobQueue()
      await queue.shutdownGracefully()
    } catch (error) {
      console.error('[Instrumentation] Graceful shutdown failed:', error)
    }
  }

  if (!shutdownRegistered) {
    shutdownRegistered = true
    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  }
}
