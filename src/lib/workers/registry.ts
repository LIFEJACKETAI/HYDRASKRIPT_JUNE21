// HydraSkript - Worker Registry
// Maps job types to their corresponding implementation functions

import { generateOutline, generateChapter, finalizeBook } from '@/lib/services/bookGenerator';
import { exportBookAsPDF } from '@/lib/services/exportService'; 
import type { JobData } from '@/lib/api';

export type WorkerFunction = (job: JobData) => Promise<void>;

export const WorkerRegistry: Record<string, WorkerFunction> = {
  
  // 1. Blueprint Phase
  'generate_outline': async (job) => {
    // Passes bookId, ownerId, and the jobId
    await generateOutline(job.bookId!, job.ownerId, job.id);
  },

  // 2. Chapter Writing Phase
  'write_chapter': async (job) => {
    // stepIndex is used as the chapterIndex
    await generateChapter(job.bookId!, job.ownerId, job.id, job.stepIndex || 0);
  },

  // 3. Finalization Phase
  'finalize_book': async (job) => {
    await finalizeBook(job.bookId!, job.ownerId, job.id, job.creditsConsumed || 0);
  },

  // Export Phase
  'export_pdf': async (job) => {
    await exportBookAsPDF(job.bookId!, job.ownerId);
  },
  
  // 'generate_audiobook': async (job) => {
  //   await generateAudiobook(job.bookId!, job.ownerId);
  // },
};
