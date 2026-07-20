// HydraSkript - Worker Registry
// Maps job types to their corresponding implementation functions

import { generateOutline, generateChapter, finalizeBook } from '@/lib/services/bookGenerator';
import { exportBookAsPDF } from '@/lib/services/exportService';

type QueueJob = {
  id: string;
  bookId?: string | null;
  ownerId: string;
  stepIndex?: number | null;
  creditsConsumed?: number | null;
};

export type WorkerFunction = (job: QueueJob) => Promise<void>;

export const WorkerRegistry: Record<string, WorkerFunction> = {
  generate_outline: async (job) => {
    if (!job.bookId) throw new Error('Missing bookId for generate_outline');
    await generateOutline(job.bookId, job.ownerId, job.id);
  },

  write_chapter: async (job) => {
    if (!job.bookId) throw new Error('Missing bookId for write_chapter');
    await generateChapter(job.bookId, job.ownerId, job.id, job.stepIndex || 0);
  },

  finalize_book: async (job) => {
    if (!job.bookId) throw new Error('Missing bookId for finalize_book');
    await finalizeBook(job.bookId, job.ownerId, job.id, job.creditsConsumed || 0);
  },

  export_pdf: async (job) => {
    if (!job.bookId) throw new Error('Missing bookId for export_pdf');
    await exportBookAsPDF(job.bookId, job.ownerId);
  },
};
