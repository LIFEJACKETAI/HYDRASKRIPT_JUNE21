jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(() => { throw new Error('EROFS: read-only deployment'); }),
  writeFileSync: jest.fn(() => { throw new Error('EROFS: read-only deployment'); }),
}));
jest.mock('@/lib/db', () => ({
  db: {
    book: { findFirst: jest.fn(), findUnique: jest.fn() },
    storyBibleEntity: { findMany: jest.fn() },
    editorialReview: { findMany: jest.fn() },
  },
}));
jest.mock('@/lib/auth-helpers', () => ({ getAuthEmail: jest.fn() }));
jest.mock('@/lib/utils/bookHelpers', () => ({ getOrCreateProfile: jest.fn() }));

const { NextRequest } = require('next/server');
const { db } = require('@/lib/db');
const { getAuthEmail } = require('@/lib/auth-helpers');
const { getOrCreateProfile } = require('@/lib/utils/bookHelpers');
const fs = require('fs');

const bookId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const routes = [
  ['book details', () => require('@/app/api/books/[id]/route').GET(
    new NextRequest(`https://app.example.com/api/books/${bookId}`),
    { params: Promise.resolve({ id: bookId }) },
  )],
  ['Story Bible', () => require('@/app/api/story-bible/route').GET(
    new NextRequest(`https://app.example.com/api/story-bible?bookId=${bookId}`),
  )],
  ['Universe reviews', () => require('@/app/api/universe/review/route').GET(
    new NextRequest('https://app.example.com/api/universe/review'),
  )],
];

beforeEach(() => {
  jest.clearAllMocks();
  getAuthEmail.mockResolvedValue('test@example.com');
  getOrCreateProfile.mockResolvedValue({ id: ownerId });
  db.book.findFirst.mockResolvedValue({ id: bookId, ownerId, title: 'Saved draft', chapters: [], jobs: [] });
  db.book.findUnique.mockResolvedValue({ id: bookId, ownerId, title: 'Saved draft' });
  db.storyBibleEntity.findMany.mockResolvedValue([]);
  db.editorialReview.findMany.mockResolvedValue([]);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

test.each(routes)('%s can load on a read-only deployment (auth/database mocked)', async (_label, get) => {
  const response = await get();
  expect(response.status).toBe(200);
  expect((await response.json()).success).toBe(true);
  expect(fs.mkdirSync).not.toHaveBeenCalled();
  expect(fs.writeFileSync).not.toHaveBeenCalled();
});

test.each(routes)('%s returns JSON 401 without a session', async (_label, get) => {
  getAuthEmail.mockResolvedValue(null);
  const response = await get();
  expect(response.status).toBe(401);
  expect(response.headers.get('content-type')).toContain('application/json');
  expect((await response.json()).success).toBe(false);
});

test.each(routes)('%s does not disguise a database failure as a missing book or empty list', async (_label, get) => {
  getOrCreateProfile.mockRejectedValueOnce(new Error('Database unavailable'));
  const response = await get();
  expect(response.status).toBe(500);
  expect(response.headers.get('content-type')).toContain('application/json');
  expect(await response.json()).toEqual({ success: false, error: 'Database unavailable' });
});
