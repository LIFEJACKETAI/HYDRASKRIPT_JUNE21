// HydraSkript - Async Manuscript Import Worker (import_manuscript jobs)
//
// WHY THIS RUNS IN THE QUEUE:
// A full novel is split into ~36k-char windows, each needing its own LLM call.
// On Vercel that is 5-15 minutes of work — far beyond the serverless function
// cap (300s max, 60s on Hobby), so the old synchronous /import-manuscript POST
// died with "Task timed out after 300 seconds" and the Story Bible stayed empty.
//
// This worker executes the import in SMALL BATCHES across many queue claims:
//   batch -> LLM-mine a few windows -> checkpoint state into job.result ->
//   re-queue self -> (pump or in-process loop claims it again immediately).
// Each invocation stays well under the function budget, and if an invocation is
// ever killed mid-window the lease expires, the job is recovered to `queued`,
// and the next claim resumes from the last checkpoint (idempotent: merge is
// by kind + normalized name, so re-mined windows cannot duplicate entities).

import { db } from '@/lib/db';
import { jobQueue } from '@/lib/workers/queue';
import { askLLMJSONWithFallback } from '@/lib/llm/fallback';
import { getManuscriptImportPrompt, getManuscriptCoveragePrompt } from '@/lib/llm/prompts';
import {
  splitManuscriptWindows,
  buildManuscriptDigest,
  absorbEntities,
  normalizeName,
  ManuscriptPortionSchema,
  EXTRACTION_KINDS,
  type ExtractedStoryBibleEntity,
  type CapturedEntityRef,
} from '@/lib/story-bible-extraction';
import { validateOrThrow } from '@/lib/llm/schema';
import { enqueueEditorialReview } from '@/lib/services/editorialReview';
import { toDTO } from '@/lib/story-bible-helpers';

/** Serializable per-job progress. Persisted to `job.result` after every batch. */
export interface ManuscriptImportState {
  fileName: string;
  /** The (truncated) manuscript text being mined. */
  text: string;
  bookId: string | null;
  newBookCreated: boolean;
  /** Optional storage path for the original uploaded file (for reference). */
  storagePath?: string;
  /** Index of the next window to mine (0-based). */
  nextWindow: number;
  windowsTotal: number;
  windowsFailed: number;
  warnings: string[];
  /** Merged entities keyed by `${kind}::${normalized name}` (JSON-safe). */
  merged: Record<string, ExtractedStoryBibleEntity>;
  capturedRefs: CapturedEntityRef[];
  truncatedChars: boolean;
  coverageDone: boolean;
}

// ─── Tuning ───────────────────────────────────────────────────────────────────
// One LLM window per checkpoint keeps a single invocation short (~30-90s typical,
// worst case a minute or two) while the queue's lease (5 min) and the pump's
// 280s budget still cover it comfortably.
const WINDOW_CHARS = 36000;
const OVERLAP_CHARS = 4000;
const MAX_ENTITIES_PER_PORTION = 25;
const MAX_ENTITIES = 200;

function defaultState(): ManuscriptImportState {
  return {
    fileName: '',
    text: '',
    bookId: null,
    newBookCreated: false,
    storagePath: undefined,
    nextWindow: 0,
    windowsTotal: 0,
    windowsFailed: 0,
    warnings: [],
    merged: {},
    capturedRefs: [],
    truncatedChars: false,
    coverageDone: false,
  };
}

function parseState(raw: string | null): ManuscriptImportState {
  const state = defaultState();
  if (!raw || raw === '{}') return state;
  try {
    const parsed = JSON.parse(raw) as Partial<ManuscriptImportState>;
    state.fileName = parsed.fileName ?? '';
    state.text = parsed.text ?? '';
    state.bookId = parsed.bookId ?? null;
    state.newBookCreated = Boolean(parsed.newBookCreated);
    state.storagePath = parsed.storagePath;
    state.nextWindow = Number(parsed.nextWindow) || 0;
    state.windowsTotal = Number(parsed.windowsTotal) || 0;
    state.windowsFailed = Number(parsed.windowsFailed) || 0;
    state.warnings = Array.isArray(parsed.warnings) ? [...parsed.warnings] : [];
    state.merged =
      parsed.merged && typeof parsed.merged === 'object' ? (parsed.merged as ManuscriptImportState['merged']) : {};
    state.capturedRefs = Array.isArray(parsed.capturedRefs) ? [...parsed.capturedRefs] : [];
    state.truncatedChars = Boolean(parsed.truncatedChars);
    state.coverageDone = Boolean(parsed.coverageDone);
  } catch {
    // Corrupt checkpoint — treat as fresh; the batch is idempotent anyway.
  }
  return state;
}
function mergedMap(state: ManuscriptImportState): Map<string, ExtractedStoryBibleEntity> {
  return new Map(Object.entries(state.merged));
}

function saveMerged(state: ManuscriptImportState, map: Map<string, ExtractedStoryBibleEntity>): void {
  state.merged = Object.fromEntries(map);
}

function recordCaptured(state: ManuscriptImportState, entities: ExtractedStoryBibleEntity[]): void {
  for (const entity of entities) {
    const name = (entity.name ?? '').trim();
    if (!name) continue;
    const normalized = normalizeName(name);
    if (
      !state.capturedRefs.some(
        (ref) => ref.kind === entity.kind && normalizeName(ref.name) === normalized
      )
    ) {
      state.capturedRefs.push({ kind: entity.kind, name });
    }
  }
}

async function checkpoint(
  jobId: string,
  state: ManuscriptImportState,
  message: string,
  percent: number
): Promise<void> {
  await jobQueue.updateJobStatus(jobId, {
    status: 'queued', // re-queue self: next claim resumes from this checkpoint
    progressMessage: message,
    progressPercent: percent,
    result: state as unknown as Record<string, unknown>,
  });
}

/**
 * Resume/advance the import. Each queue-claim of this job runs exactly one
 * window batch, one coverage pass, or the final persist step, then returns.
 */
export async function importManuscriptWorker(job: { id: string }): Promise<void> {
  const jobRow = await db.job.findUnique({ where: { id: job.id } });
  if (!jobRow) throw new Error(`Import job ${job.id} not found`);

  const state = parseState(jobRow.result);
  if (!state.text) throw new Error(`Import job ${job.id} has no manuscript payload`);

  // Lazily compute the window count on the first claim (POST only stores the
  // text; the windowing grid is cheap and deterministic to recompute).
  if (state.windowsTotal === 0) {
    state.windowsTotal = splitManuscriptWindows(state.text, WINDOW_CHARS, OVERLAP_CHARS).length;
    if (state.windowsTotal === 0) {
      throw new Error('Manuscript text is empty — nothing to analyze.');
    }
  }

  // ── Phase 1: mine windows one at a time ───────────────────────────────────
  if (state.nextWindow < state.windowsTotal) {
    const windows = splitManuscriptWindows(state.text, WINDOW_CHARS, OVERLAP_CHARS);

    const idx = state.nextWindow;
    const windowText = windows[idx] ?? '';
    const userPrompt =
      idx === 0
        ? windowText
        : `This is portion ${idx + 1} of ${state.windowsTotal} of the SAME manuscript (earlier portions have already been mined for entities).\n\n${windowText}`;

    try {
      const raw = await askLLMJSONWithFallback<unknown>(
        getManuscriptImportPrompt(state.capturedRefs),
        userPrompt,
        0.2
      );
      const parsed = validateOrThrow(ManuscriptPortionSchema, raw);
      const entities = parsed.entities.slice(0, MAX_ENTITIES_PER_PORTION);
      const map = mergedMap(state);
      absorbEntities(entities, map);
      saveMerged(state, map);
      recordCaptured(state, entities);
      state.nextWindow++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      state.windowsFailed++;
      state.nextWindow++; // skip a window the LLM could not parse (non-fatal)
      state.warnings.push(`Window ${idx + 1}/${state.windowsTotal} could not be analyzed: ${msg}`);
      console.warn(`[ImportWorker] Window ${idx + 1}/${state.windowsTotal} failed: ${msg}`);
    }

    const percent = Math.min(90, Math.round((state.nextWindow / state.windowsTotal) * 85));
    await checkpoint(
      job.id,
      state,
      `Analyzing manuscript — window ${Math.min(state.nextWindow + 1, state.windowsTotal)} of ${state.windowsTotal} (${percent}%)…`,
      percent
    );
    return;
  }

  // ── Phase 2: coverage pass for still-empty sections ───────────────────────
  if (!state.coverageDone) {
    const map = mergedMap(state);
    const missingKinds = EXTRACTION_KINDS.filter((kind) => ![ ...map.values() ].some((e) => e.kind === kind));
    if (missingKinds.length > 0) {
      try {
        const raw = await askLLMJSONWithFallback<unknown>(
          getManuscriptCoveragePrompt(state.capturedRefs, [...missingKinds]),
          buildManuscriptDigest(state.text),
          0.3
        );
        const parsed = validateOrThrow(ManuscriptPortionSchema, raw);
        const fillers = parsed.entities
          .filter((e) => missingKinds.includes(e.kind as (typeof EXTRACTION_KINDS)[number]))
          .slice(0, MAX_ENTITIES_PER_PORTION);
        absorbEntities(fillers, map);
        recordCaptured(state, fillers);
        saveMerged(state, map);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        state.warnings.push(`Coverage pass for empty sections (${missingKinds.join(', ')}) failed: ${msg}`);
        console.warn(`[ImportWorker] Coverage pass failed: ${msg}`);
      }
    }
    state.coverageDone = true;
    await checkpoint(job.id, state, 'Reviewing the full manuscript for missing sections…', 92);
    return;
  }

  // ── Phase 3: persist everything ───────────────────────────────────────────
  await finalizeImport(jobRow.id, jobRow.ownerId, jobRow.bookId, state);
}
async function finalizeImport(
  jobId: string,
  ownerId: string,
  jobBookId: string | null,
  state: ManuscriptImportState
): Promise<void> {
  const targetBookId = state.bookId ?? jobBookId;
  if (!targetBookId) throw new Error('Import job has no book to save entities into');

  const map = mergedMap(state);
  const candidates = [...map.values()].slice(0, MAX_ENTITIES);

  if (candidates.length === 0) {
    const message =
      state.windowsFailed === state.windowsTotal
        ? `The AI could not analyze the manuscript (${state.windowsFailed}/${state.windowsTotal} portions failed). Check that your AI provider keys are configured, then retry.`
        : 'The AI could not identify any story bible entities in that manuscript. Try a .txt file or a shorter portion of the book.';
    await jobQueue.updateJobStatus(jobId, {
      status: 'failed',
      errorMessage: message,
      progressMessage: `Failed: ${message}`,
    });
    return;
  }

  // Re-imports are safe: skip entities already captured for this book.
  const existing = await db.storyBibleEntity.findMany({
    where: { bookId: targetBookId },
    select: { kind: true, name: true },
  });
  const existingKinds = new Set(existing.map((e) => e.kind));
  const seen = new Set(existing.map((e) => `${e.kind}:${e.name.toLowerCase().trim()}`));
  const entitiesToCreate = candidates.filter(
    (e) => !seen.has(`${e.kind}:${e.name.toLowerCase().trim()}`)
  );
  const duplicatesSkipped = candidates.length - entitiesToCreate.length;

  if (duplicatesSkipped > 0) {
    console.log(
      `[ImportWorker] Skipped ${duplicatesSkipped}/${candidates.length} entities already present in book ${targetBookId}`
    );
  }

  console.log(`[ImportWorker] Persisting ${entitiesToCreate.length} story bible entities for book ${targetBookId}...`);

  const created =
    entitiesToCreate.length > 0
      ? await db.$transaction(
          entitiesToCreate.map((entity) =>
            db.storyBibleEntity.create({
              data: {
                ownerId,
                bookId: targetBookId,
                kind: entity.kind,
                name: entity.name.trim(),
                role: entity.role,
                summary: entity.summary,
                motivation: entity.motivation,
                description: entity.description,
                physicalTraits: JSON.stringify({ tags: entity.tags, notes: '' }),
                // Auto-populate the "Secrets & Hidden Lore" section from what the
                // extractor found (plot secrets, later reveals, hidden motives).
                secrets: JSON.stringify({ confidential: entity.secret ?? '', isPrivate: true }),
              },
            })
          )
        )
      : [];

  const counts = created.reduce<Record<string, number>>((acc, entity) => {
    acc[entity.kind] = (acc[entity.kind] ?? 0) + 1;
    return acc;
  }, {});

  const presentKinds = new Set([...existingKinds, ...created.map((e) => e.kind)]);
  const emptyKinds = EXTRACTION_KINDS.filter((k) => !presentKinds.has(k));

  const finalResult = {
    fileName: state.fileName,
    entities: created.map(toDTO),
    counts,
    total: created.length,
    duplicatesSkipped,
    portionsSkipped: state.windowsFailed,
    truncated: state.truncatedChars,
    emptyKinds,
    bookId: targetBookId,
    storagePath: state.storagePath,
  };

  // Auto-populate the Universe (Editorial Review) for this manuscript. Non-fatal.
  try {
    await enqueueEditorialReview({
      ownerId,
      bookId: targetBookId,
      scope: 'manuscript',
      sourceLabel: state.fileName,
      sourceText: state.text,
    });
    console.log(`[Universe] Auto-enqueued editorial review for uploaded manuscript (book ${targetBookId})`);
  } catch (e) {
    console.error('[Universe] Auto-review enqueue failed (non-fatal):', e);
  }

  await jobQueue.updateJobStatus(jobId, {
    status: 'completed',
    progressMessage:
      created.length === 0
        ? 'Import complete — nothing new to add.'
        : `Import complete — added ${created.length} story bible entit${created.length === 1 ? 'y' : 'ies'}.`,
    progressPercent: 100,
    result: finalResult,
  });

  console.log(
    `[ImportWorker] Import job ${jobId} complete: ${created.length}/${candidates.length} novel entities saved.`,
    counts
  );
}