// Test setup for HydraSkript
import { PrismaClient } from '@prisma/client';

const globalForTest = global as unknown as { prisma: PrismaClient };

export const prisma = globalForTest.prisma || new PrismaClient({
  log: ['query', 'error', 'warn'],
});

// Suppress Prisma log output in tests
prisma.$use(async (params, next) => {
  const before = Date.now();
  const result = await next(params);
  const after = Date.now();
  // Only log slow queries over 1s
  if (after - before > 1000) {
    console.log(`Slow query: ${after - before}ms`);
  }
  return result;
});

// Clean up after all tests
afterAll(async () => {
  await prisma.$disconnect();
});