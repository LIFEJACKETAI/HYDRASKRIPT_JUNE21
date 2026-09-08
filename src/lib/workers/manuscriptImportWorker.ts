// HydraSkript - Manuscript Import Worker
// Runs the Story Bible entity extraction for a queued `manuscript_import` job.
// Thin adapter over `runManuscriptImport`, matching `editorialReviewWorker`.

import { runManuscriptImport } from '@/lib/services/manuscriptImport';

export async function manuscriptImportWorker(job: { id: string }): Promise<void> {
  await runManuscriptImport(job.id);
}
