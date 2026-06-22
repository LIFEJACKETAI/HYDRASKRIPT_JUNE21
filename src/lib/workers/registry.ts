// HydraSkript - Worker Registry
// Maps job types to their corresponding implementation functions

import { startBookGeneration } from '@/lib/services/bookGenerator';
import { generateAudiobook } from '@/lib/services/audioService';
import { exportBookAsPDF } from '@/lib/services/exportService'; // Note the capital PDF
import type { JobData } from '@/lib/api';

export type WorkerFunction = (job: JobData) => Promise<void>;

export const WorkerRegistry: Record<string, WorkerFunction> = {
  'generate_outline': async (job) => {
    // Only pass the 2 arguments the function actually expects
    await startBookGeneration(job.bookId!, job.ownerId);
  },
  'generate_audiobook': async (job) => {
    await generateAudiobook(job.bookId!, job.ownerId);
  },
  'export_pdf': async (job) => {
    // Fixed capitalization to match the import exactly!
    await exportBookAsPDF(job.bookId!, job.ownerId);
  },
};