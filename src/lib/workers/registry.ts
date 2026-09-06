// HydraSkript - Worker Registry
// Maps job types to their corresponding implementation functions

// Load implementations only when a job runs. Read-only API routes also import
// the queue; they must not initialize image/audio/PDF services just to list data.

type QueueJob = {
  id: string;
  bookId?: string | null;
  ownerId: string;
  stepIndex?: number | null;
  creditsConsumed?: number | null;
  result?: string | null;
};

export type WorkerFunction = (job: QueueJob) => Promise<void>;

export const WorkerRegistry: Record<string, WorkerFunction> = {
  generate_outline: async (job) => {
    if (!job.bookId) throw new Error('Missing bookId for generate_outline');
    const { generateOutline } = await import('@/lib/services/bookGenerator');
    await generateOutline(job.bookId, job.ownerId, job.id);
  },

  write_chapter: async (job) => {
    if (!job.bookId) throw new Error('Missing bookId for write_chapter');
    const { generateChapter } = await import('@/lib/services/bookGenerator');
    await generateChapter(job.bookId, job.ownerId, job.id, job.stepIndex || 0);
  },

  finalize_book: async (job) => {
    if (!job.bookId) throw new Error('Missing bookId for finalize_book');
    const { finalizeBook } = await import('@/lib/services/bookGenerator');
    await finalizeBook(job.bookId, job.ownerId, job.id, job.creditsConsumed || 0);
  },

  export_pdf: async (job) => {
    if (!job.bookId) throw new Error('Missing bookId for export_pdf');
    const { exportBookAsPDF } = await import('@/lib/services/exportService');
    await exportBookAsPDF(job.bookId, job.ownerId);
  },

  generate_image: async (job) => {
    if (!job.bookId) throw new Error('Missing bookId for generate_image');
    if (!job.result) throw new Error('Missing result data for generate_image');
    const assetParams = JSON.parse(job.result);
    const { generateImageWorker } = await import('@/lib/workers/generateImageWorker');
    await generateImageWorker(job.id, assetParams);
  },

  generate_audiobook: async (job) => {
    if (!job.bookId) throw new Error('Missing bookId for generate_audiobook');
    const { generateAudiobookWorker } = await import('@/lib/workers/generateAudiobookWorker');
    await generateAudiobookWorker(job.id);
  },

  editorial_review: async (job) => {
    const { editorialReviewWorker } = await import('@/lib/workers/editorialReviewWorker');
    await editorialReviewWorker(job);
  },
};
