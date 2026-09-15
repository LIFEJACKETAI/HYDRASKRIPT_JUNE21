import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pgPool: Pool | undefined
}

function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.FUNCTION_TARGET
  )
}

// Modern `pg` treats sslmode=require as verify-full (full cert-chain
// verification), and an sslmode found in the connection string OVERRIDES any
// `ssl` option set in code. Supabase serves Postgres TLS from its own CA, so
// Node rejects it ("self-signed certificate in certificate chain").
// uselibpqcompat=true restores standard libpq semantics where sslmode=require
// means "encrypt, do not verify".
//
// Direct connections (`db.<ref>.supabase.co:5432`) have a tiny session limit
// (~15). On serverless we rewrite ONLY that host to the transaction pooler
// port (6543). Session-mode pooler URLs (`*.pooler.supabase.com:5432`) and
// URLs that are already on 6543 are left alone.
export function resolveConnectionString(raw?: string): string | undefined {
  if (!raw) return undefined
  if (!/supabase\.(co|com)/.test(raw)) return raw
  try {
    const u = new URL(raw)
    u.searchParams.set('sslmode', 'require')
    u.searchParams.set('uselibpqcompat', 'true')
    const isDirectDbHost = /^db\./i.test(u.hostname)
    if (isDirectDbHost && (u.port === '5432' || u.port === '')) {
      u.port = '6543'
    }
    return u.toString()
  } catch {
    return raw
  }
}

function createPool(): Pool {
  const serverless = isServerlessRuntime()
  // One or two connections per serverless instance. A pool of 10 * dozens of
  // warm lambdas exhausts Supabase and surfaces as Prisma P2028
  // ("Unable to start a transaction in the given time").
  const max = parseInt(
    process.env.DATABASE_POOL_MAX || (serverless ? '2' : '10'),
    10
  )
  return new Pool({
    connectionString: resolveConnectionString(process.env.DATABASE_URL),
    ssl: /supabase\.(co|com)/.test(process.env.DATABASE_URL ?? '')
      ? { rejectUnauthorized: false }
      : undefined,
    min: 0,
    max: Number.isFinite(max) && max > 0 ? max : serverless ? 2 : 10,
    idleTimeoutMillis: serverless ? 10_000 : 30_000,
    connectionTimeoutMillis: parseInt(process.env.PRISMA_CONNECTION_TIMEOUT || '10000', 10),
    allowExitOnIdle: serverless,
  })
}

const pool = globalForPrisma.pgPool ?? createPool()
globalForPrisma.pgPool = pool

const adapter = new PrismaPg(pool)

const logConfig =
  process.env.PRISMA_QUERY_LOG === '1'
    ? ['query', 'warn', 'error']
    : ['warn', 'error']

// These options apply only to interactive `$transaction(async tx => ...)`
// calls. LLM work must NEVER run inside a Prisma transaction — a 120s
// timeout was holding pool connections and causing P2028 on heartbeats.
const transactionOptions = {
  maxWait: parseInt(process.env.PRISMA_TRANSACTION_MAX_WAIT || '10000', 10),
  timeout: parseInt(process.env.PRISMA_TRANSACTION_TIMEOUT || '15000', 10),
  isolationLevel: 'ReadCommitted' as const,
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: logConfig as ('query' | 'warn' | 'error')[],
    transactionOptions,
  })

// Always cache on globalThis. Next.js (dev AND serverless) can evaluate this
// module more than once per process; without the cache each evaluation opens
// another pg Pool and we hit "max clients reached" / P2028.
globalForPrisma.prisma = db

export { transactionOptions }

if (process.env.NODE_ENV !== 'production') {
  const shutdown = async () => {
    await pool.end()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}
