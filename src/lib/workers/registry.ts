// HydraSkript - Worker Registry
// Maps job types to their corresponding implementation functions

import { executeFullGeneration } from '@/lib/services/bookGenerator';
import { generateAudiobook } from '@/lib/services/audioService';
import { exportBookToPdf } from '@/lib/services/exportService';
import type { JobData } from '@/lib/api';

export type WorkerFunction = (job: JobData) => Promise<void>;

export const WorkerRegistry: Record<string, WorkerFunction> = {
  'generate_outline': async (job) => {
    // In the new state machine, this is part of executeFullGeneration
    // but we can trigger the start of the process here.
    await executeFullGeneration(job.bookId!, job.ownerId, job.id, job.creditsReserved);
  },
  'generate_audiobook': async (job) => {
    await generateAudiobook(job.bookId!, job.ownerId, job.id);
  },
  'export_pdf': async (job) => {
    await exportBookToPdf(job.bookId!, job.ownerId, job.id);
  },
};
