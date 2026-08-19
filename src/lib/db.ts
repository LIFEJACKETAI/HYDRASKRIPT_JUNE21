import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Prisma 7+ - Requires a driver adapter for PostgreSQL
// Configure connection pool for Supabase
// Supabase free tier: ~60 connections, paid: 100-500+
// Reserve connections for: API routes (10), Queue workers (5), Prisma (15), Buffer (5)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  min: 2,
  max: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 30000,
})

const adapter = new PrismaPg(pool)

const logConfig =
  process.env.PRISMA_QUERY_LOG === '1'
    ? ['query', 'warn', 'error']
    : ['warn', 'error']

// Transaction timeout: default 5s, increase for queue operations under load
const transactionOptions = {
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

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Export for use in queue - allows overriding timeout per-operation
export { transactionOptions }

// Graceful shutdown for pool
if (process.env.NODE_ENV !== 'production') {
  const shutdown = async () => {
    await pool.end();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
