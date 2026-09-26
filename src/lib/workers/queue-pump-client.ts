import { after } from 'next/server'

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

/** Shared secret for cron + self-kicks. */
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

  // Do not trust x-vercel-cron or User-Agent as authentication. Both headers
  // can be forged by any external caller; CRON_SECRET or the queue secret is
  // the credential that protects this public route.
  if (!cron && process.env.NODE_ENV !== 'production') return true
  return false
}

function normalizeUrl(raw?: string): string | null {
  if (!raw) return null
  let trimmed = raw.trim().replace(/\/$/, '')
  if (!trimmed) return null
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`
  }
  return trimmed
}

/**
 * Absolute origin for server-to-self pump kicks.
 * Resolves the canonical app URL first (e.g. https://www.hydraskript.com),
 * falling back to Vercel system URLs and localhost.
 */
export function resolvePumpUrl(): string {
  const configuredAppUrl = normalizeUrl(process.env.APP_URL)
  const configuredPublicUrl = normalizeUrl(process.env.NEXT_PUBLIC_APP_URL)
  for (const candidate of [configuredAppUrl, configuredPublicUrl]) {
    if (candidate && !/localhost|127\.0\.0\.1/i.test(candidate)) {
      return candidate
    }
  }

  const vercelProd = normalizeUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL)
  if (vercelProd) return vercelProd

  const vercelUrl = normalizeUrl(process.env.VERCEL_URL)
  if (vercelUrl) return vercelUrl

  return configuredPublicUrl || configuredAppUrl || 'http://localhost:3002'
}

export async function firePumpKick(): Promise<void> {
  const primaryUrl = resolvePumpUrl()
  const token = pumpAuthToken()

  const urls = [primaryUrl]
  const vercelCandidate = normalizeUrl(process.env.VERCEL_URL)
  if (vercelCandidate && !urls.includes(vercelCandidate)) {
    urls.push(vercelCandidate)
  }

  // Try each URL with retries
  for (const baseUrl of urls) {
    const url = `${baseUrl}/api/queue/pump`
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'x-queue-pump-secret': token,
            'cache-control': 'no-cache',
          },
          // Don't wait for the pump to finish — just make sure the request lands.
          signal: AbortSignal.timeout(10000),
        })
        if (res.ok || res.status === 202) {
          console.log(`[Queue] pump kick succeeded on ${url} (attempt ${attempt})`)
          return
        }
        console.warn(`[Queue] pump kick status ${res.status} on ${url} (attempt ${attempt})`)
      } catch (e) {
        const name = e instanceof Error ? e.name : ''
        if (name === 'TimeoutError' || name === 'AbortError') {
          console.warn(`[Queue] pump kick timeout on ${url} (attempt ${attempt})`)
        } else {
          console.warn(`[Queue] pump kick failed on ${url} (attempt ${attempt})`, e)
        }
      }
      // Backoff between retries
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      }
    }
  }
  // If we get here, all kicks failed - log but don't throw (fire-and-forget)
  console.error(`[Queue] ALL pump kick attempts failed for all URLs. Chain may stall.`)
}

/**
 * Minimum gap between *poll-driven* kicks.
 */
const MIN_KICK_INTERVAL_MS = parseInt(process.env.QUEUE_KICK_THROTTLE_MS || '12000', 10)

const g = globalThis as unknown as { __hydraLastPumpKick?: number }

/**
 * Fire-and-forget HTTP kick to the durable queue pump. Uses Next.js `after()`
 * synchronously inside request handlers so Vercel keeps the lambda alive until
 * the outbound request lands.
 */
export function kickQueuePump(opts: { force?: boolean } = {}): void {
  if (!isServerless()) return
  const now = Date.now()
  if (!opts.force && g.__hydraLastPumpKick && now - g.__hydraLastPumpKick < MIN_KICK_INTERVAL_MS) {
    return
  }
  g.__hydraLastPumpKick = now
  try {
    after(async () => {
      await firePumpKick()
    })
  } catch {
    // Outside a request scope (e.g. background worker or server startup)
    void firePumpKick()
  }
}

/** Nudge the pump when a client is polling a job that still needs a worker. */
export function maybeKickQueueForJob(status: string): void {
  if (status === 'queued' || status === 'active') kickQueuePump()
}

/** Kick that ignores the throttle — use right after enqueuing a job. */
export function forceKickQueuePump(): void {
  kickQueuePump({ force: true })
}
