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