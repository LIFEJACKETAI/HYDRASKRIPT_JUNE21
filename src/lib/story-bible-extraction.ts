// HydraSkript - Whole-manuscript Story Bible entity extraction
//
// Why this file exists:
// The story-bible import used to send only the FIRST ~30k characters of a
// manuscript to the LLM (about a prologue + the first few chapters), and the
// auto-population path at book finalization was capped even lower by an 80k
// truncation. Characters, locations, and lore that only appear later in the
// book were therefore never captured, and the Story Bible looked like it had
// "read" just the opening chapters.
//
// This module instead walks the ENTIRE manuscript in overlapping windows,
// asks the LLM for the NEW entities introduced in each window (telling it
// what has already been captured from earlier portions), then merges the
// results by kind + normalized name. Recurring entities anywhere in the book
// end up in the Story Bible — not just the opening scenes.

import { askLLMJSONWithFallback } from '@/lib/llm/fallback';
import { getManuscriptImportPrompt } from '@/lib/llm/prompts';
import {
  ManuscriptEntitySchema,
  ManuscriptImportSchema,
  validateOrThrow,
} from '@/lib/llm/schema';
import { z } from 'zod';

export type ExtractedStoryBibleEntity = z.infer<typeof ManuscriptEntitySchema>;

export interface CapturedEntityRef {
  kind: string;
  name: string;
}

export interface ExtractionManifest {
  entities: ExtractedStoryBibleEntity[];
  /** Total windows the manuscript was split into. */
  windows: number;
  windowsSucceeded: number;
  windowsFailed: number;
  /** True when the input was longer than the analysis budget (chars). */
  truncatedChars: boolean;
  warnings: string[];
}

export interface ExtractionOptions {
  windowChars?: number;
  overlapChars?: number;
  maxConcurrentWindows?: number;
  maxEntitiesPerPortion?: number;
  maxEntities?: number;
  maxSourceChars?: number;
}

// Tuned so a single window stays comfortably inside even modest model context
// windows (~9k tokens) while the number of LLM round-trips stays low enough
// for a synchronous request.
const DEFAULT_WINDOW_CHARS = 36000;
const DEFAULT_OVERLAP_CHARS = 4000;
const DEFAULT_MAX_CONCURRENT = 4;
const DEFAULT_MAX_ENTITIES_PER_PORTION = 25;
const DEFAULT_MAX_ENTITIES = 200;
// Same budget as the editorial-review pipeline. Anything beyond this cannot be
// mined inside one synchronous request; a warning is emitted for the tail.
const DEFAULT_MAX_SOURCE_CHARS = 500000;

// A later portion may legitimately contain zero NEW entities (everything was
// already introduced earlier), so per-window parsing accepts an empty list.
// The "must have found something" rule is enforced by callers after merging.
const ManuscriptPortionSchema = ManuscriptImportSchema.extend({
  entities: z.array(ManuscriptEntitySchema).default([]),
});

type PortionResult =
  | { ok: true; entities: ExtractedStoryBibleEntity[] }
  | { ok: false; message: string };

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function longerText(a: string, b: string): string {
  return b.length > a.length ? b : a;
}

/** Split `text` into overlapping windows that together cover every character. */
export function splitManuscriptWindows(
  text: string,
  windowChars: number = DEFAULT_WINDOW_CHARS,
  overlapChars: number = DEFAULT_OVERLAP_CHARS
): string[] {
  const cleaned = text.replace(/\u0000/g, '').trim();
  if (!cleaned) return [];
  if (cleaned.length <= windowChars) return [cleaned];

  const step = Math.max(1, windowChars - overlapChars);
  const windows: string[] = [];
  for (let start = 0; start < cleaned.length; start += step) {
    windows.push(cleaned.slice(start, start + windowChars));
  }
  return windows;
}

/** Add one window's entities into the merged map, deduped by kind + name. */
function absorbEntities(
  incoming: ExtractedStoryBibleEntity[],
  into: Map<string, ExtractedStoryBibleEntity>
): void {
  for (const entity of incoming) {
    const name = (entity.name ?? '').trim();
    if (!name) continue;

    const key = `${entity.kind}::${normalizeName(name)}`;
    const existing = into.get(key);
    if (!existing) {
      into.set(key, { ...entity, name, tags: [...(entity.tags ?? [])] });
      continue;
    }

    // Same entity found in a later window: keep the richest canonical text.
    existing.role = longerText(existing.role ?? '', entity.role ?? '');
    existing.summary = longerText(existing.summary ?? '', entity.summary ?? '');
    existing.motivation = longerText(existing.motivation ?? '', entity.motivation ?? '');
    existing.description = longerText(existing.description ?? '', entity.description ?? '');
    const mergedTags = [...new Set([...(existing.tags ?? []), ...(entity.tags ?? [])])];
    existing.tags = mergedTags.slice(0, 16);
  }
}

/**
 * Extract every recurring story-bible entity from a full manuscript.
 *
 * The manuscript is split into overlapping windows; each window is sent to the
 * LLM together with the list of entities captured so far, and results are
 * merged by kind + normalized name. A failing window is logged and skipped so
 * one flaky call cannot void the whole import; if no window yields any entity,
 * the first error is rethrown so the caller can surface it to the user.
 */
export async function extractEntitiesFromManuscript(
  manuscriptText: string,
  options: ExtractionOptions = {}
): Promise<ExtractionManifest> {
  const windowChars = options.windowChars ?? DEFAULT_WINDOW_CHARS;
  const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;
  const maxConcurrent = options.maxConcurrentWindows ?? DEFAULT_MAX_CONCURRENT;
  const maxEntitiesPerPortion =
    options.maxEntitiesPerPortion ?? DEFAULT_MAX_ENTITIES_PER_PORTION;
  const maxEntities = options.maxEntities ?? DEFAULT_MAX_ENTITIES;
  const maxSourceChars = options.maxSourceChars ?? DEFAULT_MAX_SOURCE_CHARS;

  const truncatedChars = manuscriptText.length > maxSourceChars;
  const text = manuscriptText.replace(/\u0000/g, '').trim().slice(0, maxSourceChars);
  const windows = splitManuscriptWindows(text, windowChars, overlapChars);
  if (windows.length === 0) {
    throw new Error('Manuscript did not contain readable text');
  }

  const merged = new Map<string, ExtractedStoryBibleEntity>();
  const capturedRefs: CapturedEntityRef[] = [];
  const warnings: string[] = [];
  let windowsFailed = 0;
  let firstError: Error | null = null;

  for (let offset = 0; offset < windows.length; offset += maxConcurrent) {
    const batch = windows.slice(offset, offset + maxConcurrent);

    const results: PortionResult[] = await Promise.all(
      batch.map(async (windowText, indexWithinBatch) => {
        const portionIndex = offset + indexWithinBatch;
        try {
          const userPrompt =
            portionIndex === 0
              ? windowText
              : `This is portion ${portionIndex + 1} of ${windows.length} of the SAME manuscript (earlier portions have already been mined for entities).\n\n${windowText}`;
          const raw = await askLLMJSONWithFallback<unknown>(
            getManuscriptImportPrompt(capturedRefs),
            userPrompt,
            0.2
          );
          const parsed = validateOrThrow(ManuscriptPortionSchema, raw);
          return { ok: true as const, entities: parsed.entities.slice(0, maxEntitiesPerPortion) };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (!firstError) {
            firstError = error instanceof Error ? error : new Error(msg);
          }
          return { ok: false as const, message: msg };
        }
      })
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (!result.ok) {
        windowsFailed += 1;
        const portionNumber = offset + i + 1;
        warnings.push(
          `Portion ${portionNumber}/${windows.length} could not be analyzed: ${result.message}`
        );
        console.warn(`[StoryBibleExtraction] ${warnings[warnings.length - 1]}`);
        continue;
      }

      absorbEntities(result.entities, merged);
      for (const entity of result.entities) {
        const name = (entity.name ?? '').trim();
        if (!name) continue;
        const normalized = normalizeName(name);
        if (
          !capturedRefs.some(
            (ref) => ref.kind === entity.kind && normalizeName(ref.name) === normalized
          )
        ) {
          capturedRefs.push({ kind: entity.kind, name });
        }
      }
    }
  }

  const entities = [...merged.values()].slice(0, maxEntities);
  if (entities.length === 0) {
    throw (
      firstError ??
      new Error('No story bible entities could be extracted from the manuscript.')
    );
  }

  if (truncatedChars) {
    warnings.push(
      `Manuscript exceeds ${maxSourceChars.toLocaleString()} characters; only the first ${maxSourceChars.toLocaleString()} were analyzed. Split the file for full coverage of the tail.`
    );
    console.warn(`[StoryBibleExtraction] ${warnings[warnings.length - 1]}`);
  }

  console.log(
    `[StoryBibleExtraction] Mined ${windows.length - windowsFailed}/${windows.length} windows of ${windows.length} → ${entities.length} unique entities`
  );
  return {
    entities,
    windows: windows.length,
    windowsSucceeded: windows.length - windowsFailed,
    windowsFailed,
    truncatedChars,
    warnings,
  };
}
