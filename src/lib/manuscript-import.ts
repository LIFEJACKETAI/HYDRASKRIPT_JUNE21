// HydraSkript - Manuscript Import job payload
//
// Pure helpers (no DB, no LLM imports) for the `manuscript_import` job type, so
// both the queueing route and the lightweight polling route can share the
// contract without pulling the extraction engine into their bundles.

/** Stored in `jobs.result` when the import job is created. */
export interface ManuscriptImportPayload {
  fileName: string;
  bookId: string;
  newBookCreated: boolean;
  text: string;
}

/** Written to `jobs.result` when the import finishes. */
export interface ManuscriptImportOutcome {
  imported: true;
  fileName: string;
  bookId: string;
  newBookCreated: boolean;
  counts: Record<string, number>;
  total: number;
  importedAt: string;
}

export function serializeManuscriptImportPayload(payload: ManuscriptImportPayload): string {
  return JSON.stringify(payload);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((v) => typeof v === 'number');
}

/**
 * Parse a queued job's payload. Returns `null` for anything that is not a
 * pending import — including a completed job's outcome — so a reclaimed job is
 * never mistaken for work that still has to run.
 */
export function parseManuscriptImportPayload(
  raw: string | null | undefined
): ManuscriptImportPayload | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (parsed.imported === true) return null;
    if (typeof parsed.bookId !== 'string' || typeof parsed.text !== 'string') return null;
    return {
      fileName: typeof parsed.fileName === 'string' ? parsed.fileName : 'manuscript',
      bookId: parsed.bookId,
      newBookCreated: parsed.newBookCreated === true,
      text: parsed.text,
    };
  } catch {
    return null;
  }
}

/** Parse a finished job's outcome. Returns `null` while the job is still running. */
export function parseManuscriptImportOutcome(
  raw: string | null | undefined
): ManuscriptImportOutcome | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.imported !== true) return null;
    if (typeof parsed.bookId !== 'string') return null;
    return {
      imported: true,
      fileName: typeof parsed.fileName === 'string' ? parsed.fileName : 'manuscript',
      bookId: parsed.bookId,
      newBookCreated: parsed.newBookCreated === true,
      counts: isStringRecord(parsed.counts) ? parsed.counts : {},
      total: typeof parsed.total === 'number' ? parsed.total : 0,
      importedAt:
        typeof parsed.importedAt === 'string' ? parsed.importedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}
