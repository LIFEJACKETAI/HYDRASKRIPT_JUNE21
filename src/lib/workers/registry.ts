// HydraSkript - Worker Registry
// Maps job types to their corresponding implementation functions

import { startBookGeneration } from '@/lib/services/bookGenerator';
// import { generateAudiobook } from '@/lib/services/audioService'; // <-- Commented out because it doesn't exist yet
import { exportBookAsPDF } from '@/lib/services/exportService'; 
import type { JobData } from '@/lib/api';

export type WorkerFunction = (job: JobData) => Promise<void>;

export const WorkerRegistry: Record<string, WorkerFunction> = {
  'generate_outline': async (job) => {
    await startBookGeneration(job.bookId!, job.ownerId);
  },
  // 'generate_audiobook': async (job) => {
  //   await generateAudiobook(job.bookId!, job.ownerId);
  // },
  'export_pdf': async (job) => {
    await exportBookAsPDF(job.bookId!, job.ownerId);
  },
};
