import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Prisma 7+ - Requires a driver adapter for PostgreSQL
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

const logConfig =
  process.env.PRISMA_QUERY_LOG === '1'
    ? ['query', 'warn', 'error']
    : ['warn', 'error']

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: logConfig as ('query' | 'warn' | 'error')[],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
