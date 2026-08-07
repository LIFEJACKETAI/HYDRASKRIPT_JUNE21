// HydraSkript - Worker Registry
// Maps job types to their corresponding implementation functions

import { db } from '@/lib/db';
import { generateOutline, generateChapter, finalizeBook } from '@/lib/services/bookGenerator';
import { exportBookAsPDF } from '@/lib/services/exportService';
import { generateImageWorker } from '@/lib/workers/generateImageWorker';
import { generateAudiobookWorker } from '@/lib/workers/generateAudiobookWorker';
import { editorialReviewWorker } from '@/lib/workers/editorialReviewWorker';

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

  generate_image: async (job) => {
    if (!job.bookId) throw new Error('Missing bookId for generate_image');
    if (!job.result) throw new Error('Missing result data for generate_image');
    const assetParams = JSON.parse(job.result);
    await generateImageWorker(job.id, assetParams);
  },

  generate_audiobook: async (job) => {
    if (!job.bookId) throw new Error('Missing bookId for generate_audiobook');
    await generateAudiobookWorker(job.id);
  },

  editorial_review: async (job) => {
    await editorialReviewWorker(job);
  },
};
