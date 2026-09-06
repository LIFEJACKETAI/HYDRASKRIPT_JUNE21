// A route that only lists data must not load image/audio/PDF implementations.
const implementations = [
  '@/lib/services/bookGenerator',
  '@/lib/services/exportService',
  '@/lib/workers/generateImageWorker',
  '@/lib/workers/generateAudiobookWorker',
  '@/lib/workers/editorialReviewWorker',
];

beforeEach(() => jest.resetModules());
afterEach(() => {
  for (const implementation of implementations) jest.dontMock(implementation);
});

test('loading the worker registry does not initialize any implementation', () => {
  const loaded = jest.fn();
  for (const implementation of implementations) {
    jest.doMock(implementation, () => {
      loaded();
      throw new Error('Worker-only dependency loaded by a read-only route');
    });
  }
  expect(() => require('@/lib/workers/registry')).not.toThrow();
  expect(loaded).not.toHaveBeenCalled();
});

test('dispatch still loads and runs the requested worker', async () => {
  const generateOutline = jest.fn().mockResolvedValue(undefined);
  jest.doMock('@/lib/services/bookGenerator', () => ({ generateOutline }));
  const { WorkerRegistry } = require('@/lib/workers/registry');
  await WorkerRegistry.generate_outline({ id: 'job-id', bookId: 'book-id', ownerId: 'owner-id' });
  expect(generateOutline).toHaveBeenCalledWith('book-id', 'owner-id', 'job-id');
});

test('invalid jobs are rejected before importing their implementation', async () => {
  const loaded = jest.fn();
  jest.doMock('@/lib/services/bookGenerator', () => {
    loaded();
    throw new Error('Should not load');
  });
  const { WorkerRegistry } = require('@/lib/workers/registry');
  await expect(WorkerRegistry.generate_outline({ id: 'job-id', ownerId: 'owner-id' }))
    .rejects.toThrow('Missing bookId');
  expect(loaded).not.toHaveBeenCalled();
});
