/**
 * Lightweight pump kicker. Intentionally has NO dependency on the worker
 * registry / Prisma queue class so job-poll API routes can nudge the pump
 * without loading PDFKit, LLM clients, etc. on every 5s poll.
 */

export function isServerless(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.FUNCTION_TARGET
  )
}

/** Shared secret for cron + self-kicks. Always defined so prod never 401s the pump. */
export function pumpAuthToken(): string {
  return (
    process.env.CRON_SECRET ||
    process.env.QUEUE_PUMP_SECRET ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    'dev-pump'
  )
}

export function isPumpRequestAuthorized(req: { headers: { get: (name: string) => string | null } }): boolean {
  const token = pumpAuthToken()
  const cron = process.env.CRON_SECRET
  const bearer = req.headers.get('authorization')
  const header = req.headers.get('x-queue-pump-secret')

  if (cron && bearer === `Bearer ${cron}`) return true
  if (bearer === `Bearer ${token}`) return true
  if (header && (header === token || (cron && header === cron))) return true
  if (req.headers.get('x-vercel-cron') === '1') return true
  const ua = req.headers.get('user-agent') || ''
  if (/^vercel-cron/i.test(ua)) return true
  if (!cron && process.env.NODE_ENV !== 'production') return true
  return false
}

/**
 * Absolute origin for server-to-self pump kicks.
 * On Vercel prefer VERCEL_URL — NEXT_PUBLIC_APP_URL is often localhost or an
 * old domain, and kicking that is why jobs sit at "Queued..." forever.
 */
export function resolvePumpUrl(): string {
  const vercel = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`
    : ''
  const candidates = [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL, vercel]
    .map((s) => (s || '').replace(/\/$/, ''))
    .filter(Boolean)
  const nonLocal = candidates.filter((u) => !/localhost|127\.0\.0\.1/i.test(u))

  if (isServerless()) {
    if (vercel) return vercel
    if (nonLocal[0]) return nonLocal[0]
  }
  return nonLocal[0] || candidates[0] || 'http://localhost:3002'
}

async function firePumpKick(): Promise<void> {
  const url = `${resolvePumpUrl()}/api/queue/pump`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-queue-pump-secret': pumpAuthToken(),
        'cache-control': 'no-cache',
      },
      // Don't wait for the pump to finish — just make sure the request lands.
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok && res.status !== 0) {
      console.warn('[Queue] pump kick status', res.status)
    }
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') return
    console.warn('[Queue] pump kick failed:', e)
  }
}

/**
 * Fire-and-forget HTTP kick to the durable queue pump. Prefers Next.js `after()`
 * so the outbound request survives the current function returning.
 */
export function kickQueuePump(): void {
  if (!isServerless()) return
  try {
    const task = firePumpKick()
    void import('next/server')
      .then((mod) => {
        if (typeof mod.after === 'function') {
          try {
            mod.after(() => task)
            return
          } catch {
            // outside a request scope
          }
        }
        void task
      })
      .catch(() => {
        void task
      })
  } catch (e) {
    console.warn('[Queue] kickQueuePump error:', e)
  }
}

/** Nudge the pump when a client is polling a job that still needs a worker. */
export function maybeKickQueueForJob(status: string): void {
  if (status === 'queued' || status === 'active') kickQueuePump()
}
