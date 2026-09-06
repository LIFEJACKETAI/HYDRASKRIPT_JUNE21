jest.mock('@/lib/db', () => ({ db: { book: { findUnique: jest.fn(), update: jest.fn() } } }));
jest.mock('@/lib/workers/queue', () => ({
  jobQueue: { createJob: jest.fn(), startJob: jest.fn() },
}));
jest.mock('@/lib/utils/credits', () => ({
  reserveCredits: jest.fn(),
  getBookDefaults: jest.fn(() => ({ chapterCount: 1, wordsPerChapter: 1000 })),
  estimateBookCredits: jest.fn(() => 10),
}));
jest.mock('@/lib/services/imageService', () => ({}));
jest.mock('@/lib/services/styleAnalyzer', () => ({}));
jest.mock('@/lib/services/editorialReview', () => ({}));

const { db } = require('@/lib/db');
const { jobQueue } = require('@/lib/workers/queue');
const { reserveCredits } = require('@/lib/utils/credits');
const { startBookGeneration } = require('@/lib/services/bookGenerator');
const originalEnv = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv, NODE_ENV: 'production', VERCEL: '1' };
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  db.book.findUnique.mockResolvedValue({
    id: 'book-id', ownerId: 'owner-id', status: 'draft', targetAudience: 'adult', genre: 'fiction', outline: '{}',
  });
  jobQueue.createJob.mockResolvedValue('job-id');
  reserveCredits.mockResolvedValue(true);
});

afterEach(() => { process.env = originalEnv; });

test('missing production storage is rejected before reserving credits or creating a job', async () => {
  await expect(startBookGeneration('book-id', 'owner-id')).rejects.toThrow(/persistent storage.*not configured/i);
  expect(jobQueue.createJob).not.toHaveBeenCalled();
  expect(reserveCredits).not.toHaveBeenCalled();
  expect(db.book.update).not.toHaveBeenCalled();
  expect(jobQueue.startJob).not.toHaveBeenCalled();
});

test('generation can be scheduled with NEXT_PUBLIC_SUPABASE_URL and a service key', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  await expect(startBookGeneration('book-id', 'owner-id')).resolves.toEqual({ jobId: 'job-id', estimatedCredits: 10 });
  expect(reserveCredits).toHaveBeenCalledTimes(1);
  expect(jobQueue.startJob).toHaveBeenCalledWith('job-id', 'generate_outline');
});
