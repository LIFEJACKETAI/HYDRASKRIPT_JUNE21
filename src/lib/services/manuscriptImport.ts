// HydraSkript - Manuscript Import Service
// Story Bible entity extraction for an uploaded manuscript.
//
// This runs as a queued `manuscript_import` job, NOT inside the HTTP request.
// Entity extraction is a single LLM call over the manuscript and routinely takes
// minutes; a serverless function is killed at its `maxDuration` (Vercel: 300s on
// Hobby + Fluid Compute) and the browser only sees an opaque 504. The route
// therefore validates + extracts text + queues a job and answers immediately,
// and the client polls for progress.
//
// Everything here is written to be safe to re-run: a job whose lease expires
// (instance frozen, redeploy, crash) is reclaimed by the queue and executed
// again, so the writer de-duplicates against entities that already exist.

import { db } from '@/lib/db';
import { jobQueue } from '@/lib/workers/queue';
import { askLLMJSONWithFallback } from '@/lib/llm/fallback';
import { ManuscriptImportSchema, validateOrThrow } from '@/lib/llm/schema';
import type { ValidatedManuscriptImport } from '@/lib/llm/schema';
import { getManuscriptImportPrompt } from '@/lib/llm/prompts';
import { enqueueEditorialReview } from '@/lib/services/editorialReview';
import {
  parseManuscriptImportOutcome,
  parseManuscriptImportPayload,
  type ManuscriptImportOutcome,
} from '@/lib/manuscript-import';
import type { StoryBibleEntity } from '@prisma/client';

// ─── Tunables ─────────────────────────────────────────────────────────────────

/** Head of the manuscript sent to the LLM. Quality plateaus early; latency does not. */
const MAX_LLM_CHARS = 20_000;
/** Hard cap on entities written per import. */
const MAX_ENTITIES = 40;
/** Output budget. Smaller = faster = fits inside one function invocation. */
const LLM_MAX_TOKENS = 4000;
/** Per provider attempt. */
const LLM_ATTEMPT_TIMEOUT_MS = 90_000;
/** Whole fallback chain. Leaves headroom for the DB writes inside a 300s function. */
const LLM_DEADLINE_MS = 240_000;

// The job payload/outcome contract lives in `@/lib/manuscript-import` (pure — no
// DB or LLM imports) so the lightweight polling route can share it without
// pulling the extraction engine into its bundle.

// ─── Entity helpers ───────────────────────────────────────────────────────────

function entityKey(kind: string, name: string): string {
  return `${kind}::${name.trim().toLowerCase()}`;
}

function friendlyExtractionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/safety/i.test(message)) {
    return 'That manuscript was blocked by an AI safety filter, so the Story Bible could not be built from it.';
  }
  if (/timed out|deadline|aborted/i.test(message)) {
    return (
      'The AI ran out of time reading that manuscript. Try again, or upload a smaller ' +
      'excerpt (a .txt of the first few chapters is fastest).'
    );
  }
  if (/Validation error/i.test(message)) {
    return 'The AI returned a Story Bible we could not read. Please try the import again.';
  }
  if (/API key|not set in environment/i.test(message)) {
    return 'AI provider keys are not configured on this deployment, so the manuscript could not be parsed.';
  }
  return `Manuscript import failed: ${message}`;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run the Story Bible extraction for one `manuscript_import` job and mark it
 * completed. Throws on failure so the queue can apply its retry policy.
 */
export async function runManuscriptImport(jobId: string): Promise<ManuscriptImportOutcome> {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`Manuscript import job ${jobId} not found`);

  // Already finished (e.g. the job was reclaimed after the result was written).
  const alreadyDone = parseManuscriptImportOutcome(job.result);
  if (alreadyDone) {
    if (job.status !== 'completed') {
      await jobQueue.updateJobStatus(jobId, {
        status: 'completed',
        progressMessage: 'Import complete.',
        progressPercent: 100,
      });
    }
    return alreadyDone;
  }

  const payload = parseManuscriptImportPayload(job.result);
  if (!payload) throw new Error('Manuscript import job has no manuscript text to parse.');
  if (!payload.text.trim()) throw new Error('The uploaded manuscript did not contain readable text.');

  const { fileName, bookId, newBookCreated } = payload;

  await jobQueue.updateJobStatus(jobId, {
    status: 'active',
    progressMessage: `Reading "${fileName}"...`,
    progressPercent: 5,
  });

  const book = await db.book.findFirst({ where: { id: bookId }, select: { id: true } });
  if (!book) throw new Error(`Book ${bookId} no longer exists — cannot import the manuscript.`);

  const manuscriptForLLM =
    payload.text.length > MAX_LLM_CHARS ? payload.text.slice(0, MAX_LLM_CHARS) : payload.text;

  // Keeps the JSON small enough to be generated (and parsed) well inside the
  // deadline instead of being truncated mid-entity.
  const userPrompt =
    `Extract at most ${MAX_ENTITIES} entities in total, prioritising the most important ones. ` +
    `Keep each summary and description to two sentences or fewer so the whole JSON fits in ` +
    `${LLM_MAX_TOKENS} output tokens.\n\n--- MANUSCRIPT ---\n${manuscriptForLLM}`;

  await jobQueue.updateJobStatus(jobId, {
    progressMessage: 'Extracting characters, locations, objects, themes and history...',
    progressPercent: 15,
  });

  console.log(
    `[ManuscriptImport] job ${jobId}: parsing "${fileName}" (${payload.text.length} chars, ` +
    `${manuscriptForLLM.length} to the LLM) for book ${bookId}`
  );

  let validated: unknown;
  try {
    validated = await askLLMJSONWithFallback<unknown>(
      getManuscriptImportPrompt(),
      userPrompt,
      0.2,
      undefined,
      {
        maxTokens: LLM_MAX_TOKENS,
        timeoutMs: LLM_ATTEMPT_TIMEOUT_MS,
        retries: 1,
        maxCycles: 2,
        deadlineMs: LLM_DEADLINE_MS,
      }
    );
  } catch (error) {
    throw new Error(friendlyExtractionError(error));
  }

  let entities: ValidatedManuscriptImport['entities'];
  try {
    entities = validateOrThrow(ManuscriptImportSchema, validated).entities.slice(0, MAX_ENTITIES);
  } catch (error) {
    throw new Error(friendlyExtractionError(error));
  }

  await jobQueue.updateJobStatus(jobId, {
    progressMessage: `Writing ${entities.length} entities to the Story Bible...`,
    progressPercent: 75,
  });

  // De-duplicate: a retried job (or a second import of the same manuscript)
  // must never create a second copy of the same character.
  const existing: StoryBibleEntity[] = await db.storyBibleEntity.findMany({ where: { bookId } });
  const existingByKey = new Map<string, StoryBibleEntity>(
    existing.map((row) => [entityKey(row.kind, row.name), row])
  );
  const seen = new Set<string>();
  const toCreate = entities.filter((entity) => {
    const key = entityKey(entity.kind, entity.name);
    if (existingByKey.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const created: StoryBibleEntity[] = toCreate.length
    ? await db.$transaction(
        toCreate.map((entity) =>
          db.storyBibleEntity.create({
            data: {
              ownerId: job.ownerId,
              bookId,
              kind: entity.kind,
              name: entity.name.trim(),
              role: entity.role,
              summary: entity.summary,
              motivation: entity.motivation,
              description: entity.description,
              physicalTraits: JSON.stringify({ tags: entity.tags, notes: '' }),
              secrets: JSON.stringify({ confidential: '', isPrivate: true }),
            },
          })
        )
      )
    : [];

  const matchedExisting = entities
    .map((entity) => existingByKey.get(entityKey(entity.kind, entity.name)))
    .filter((row): row is StoryBibleEntity => Boolean(row));

  // What this import produced: freshly created rows plus rows it matched that
  // were already in the bible (so a retry still reports a useful result).
  const importedRows = [...created, ...matchedExisting];
  const counts = importedRows.reduce<Record<string, number>>((acc, entity) => {
    acc[entity.kind] = (acc[entity.kind] ?? 0) + 1;
    return acc;
  }, {});

  const outcome: ManuscriptImportOutcome = {
    imported: true,
    fileName,
    bookId,
    newBookCreated,
    counts,
    total: importedRows.length,
    importedAt: new Date().toISOString(),
  };

  console.log(
    `[ManuscriptImport] job ${jobId}: ${created.length} created, ${matchedExisting.length} already present`,
    counts
  );

  // Auto-populate the Universe (Editorial Review) for this uploaded manuscript.
  // Non-fatal — a failure here must not fail the import.
  await jobQueue.updateJobStatus(jobId, {
    progressMessage: 'Queuing the Universe editorial review...',
    progressPercent: 92,
  });
  try {
    await enqueueEditorialReview({
      ownerId: job.ownerId,
      bookId,
      scope: 'manuscript',
      sourceLabel: fileName,
      sourceText: payload.text,
    });
    console.log(`[Universe] Auto-enqueued editorial review for imported manuscript (book ${bookId})`);
  } catch (error) {
    console.error('[Universe] Auto-review enqueue failed (non-fatal):', error);
  }

  await jobQueue.updateJobStatus(jobId, {
    status: 'completed',
    progressMessage: `Imported ${outcome.total} Story Bible entries from "${fileName}".`,
    progressPercent: 100,
    result: outcome as unknown as Record<string, unknown>,
  });

  return outcome;
}
