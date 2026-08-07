// HydraSkript - Editorial Review Service
// The "publishing house editor" engine. Reads a manuscript (from book chapters
// or an uploaded file), audits every window with the LLM, cross-examines a
// continuity ledger for contradictions, and persists structured findings.
//
// Architecture:
//   Pass 1 - per-window editorial audit (findings + continuity ledger entries)
//   Pass 2 - global coherence audit over the full ledger (cross-chapter findings)
//   Merge  - dedupe and persist findings per review

import { db } from '@/lib/db';
import { jobQueue } from '@/lib/workers/queue';
import { askLLMJSONWithFallback } from '@/lib/llm/fallback';
import {
  getEditorialReviewSystemPrompt,
  getEditorialReviewChunkUserPrompt,
  getEditorialCoherenceSystemPrompt,
  getEditorialCoherenceUserPrompt,
} from '@/lib/llm/prompts';
import {
  EDITORIAL_CATEGORIES,
  EDITORIAL_SEVERITIES,
  EditorialChunkResultSchema,
  EditorialCoherenceResultSchema,
  validateOrThrow,
} from '@/lib/llm/schema';
import type { EditorialFinding, EditorialContinuityNote } from '@/lib/llm/schema';

type ReviewFinding = EditorialFinding & { bookTitle?: string };

// ─── Tunables ─────────────────────────────────────────────────────────────────

const REVIEW_WINDOW_CHARS = 26000;
const REVIEW_WINDOW_OVERLAP = 3000;
export const MAX_REVIEW_CHARS = 500000;
const MAX_PRIOR_CONTEXT_CHARS = 6000;
const MAX_LEDGER_CHARS = 50000;
const MAX_FINDINGS = 300;

const REVIEW_MODEL =
  process.env.EDITORIAL_REVIEW_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';

// ─── Manuscript assembly ──────────────────────────────────────────────────────

const CHAPTER_HEADING_RE =
  /^\s*(?:chapter|prologue|epilogue|part|act|book)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|[ivxlcdm]+|\d{1,3})\b.*$/i;

export interface ReviewWindow {
  index: number;
  location: string;
  bookTitle: string;
  text: string;
}

export async function assembleBooksManuscript(bookIds: string[], ownerId: string): Promise<string> {
  const books = await db.book.findMany({
    where: { id: { in: bookIds }, ownerId },
    orderBy: { createdAt: 'asc' },
    include: { chapters: { orderBy: { index: 'asc' } } },
  });

  const blocks: string[] = [];
  for (const book of books) {
    const contentChapters = book.chapters.filter((c) => (c.content || '').trim().length > 0);
    if (contentChapters.length === 0) continue;
    blocks.push(`=== [BOOK] ${book.title} ===`);
    for (const chapter of contentChapters) {
      const label = `Chapter ${chapter.index + 1}${chapter.title ? `: ${chapter.title}` : ''}`;
      blocks.push(`\n${label}\n${chapter.content.trim()}`);
    }
  }

  return blocks.join('\n');
}

/**
 * Split raw manuscript text into labelled audit windows. Chapter headings are
 * detected so each window carries a readable location reference. When the text
 * was assembled from multiple books (`=== [BOOK] Title ===` markers), each
 * window is tagged with the book it came from.
 */
export function splitIntoWindows(text: string): ReviewWindow[] {
  const lines = text.split('\n');
  const sections: { label: string; bookTitle: string; text: string }[] = [];
  let currentLabel = '';
  let currentBook = '';
  let buffer: string[] = [];
  let foundHeading = false;

  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body) sections.push({ label: currentLabel, bookTitle: currentBook, text: body });
    buffer = [];
  };

  for (const line of lines) {
    const bookMatch = line.trim().match(/^=== \[BOOK\]\s+(.+)\s+===$/i);
    if (bookMatch) {
      flush();
      currentBook = bookMatch[1].trim();
      currentLabel = '';
      continue;
    }
    if (CHAPTER_HEADING_RE.test(line)) {
      flush();
      foundHeading = true;
      currentLabel = line.trim();
    }
    buffer.push(line);
  }
  flush();

  if (!foundHeading && sections.length === 0) {
    sections.push({ label: '', bookTitle: currentBook, text: text.trim() });
  }

  const windows: ReviewWindow[] = [];
  let index = 0;
  for (const section of sections) {
    const length = section.text.length;
    const makeLabel = (lbl: string) => (section.bookTitle ? `${section.bookTitle} · ${lbl}` : lbl);
    if (length <= REVIEW_WINDOW_CHARS) {
      windows.push({
        index: index++,
        location: makeLabel(section.label || `Part ${index}`),
        bookTitle: section.bookTitle,
        text: section.text,
      });
      continue;
    }

    let start = 0;
    let part = 1;
    const totalParts = Math.ceil(length / REVIEW_WINDOW_CHARS);
    while (start < length) {
      let end = Math.min(length, start + REVIEW_WINDOW_CHARS);
      if (end < length) {
        const nextNewline = section.text.lastIndexOf('\n', end);
        if (nextNewline > start + REVIEW_WINDOW_CHARS * 0.6) end = nextNewline;
      }
      const label = section.label
        ? `${section.label} (part ${part}/${totalParts})`
        : `Part ${part}/${totalParts}`;
      windows.push({
        index: index++,
        location: makeLabel(label),
        bookTitle: section.bookTitle,
        text: section.text.slice(start, end).trim(),
      });
      part++;
      if (end >= length) break;
      start = Math.max(0, end - REVIEW_WINDOW_OVERLAP);
    }
  }

  return windows;
}

// ─── Ledger helpers ───────────────────────────────────────────────────────────

function formatLedger(notes: EditorialContinuityNote[]): string {
  const entries = notes.map((n) => `- ${n.entity} [${n.category}] (${n.location || 'unlabelled'}): ${n.fact}`);
  return entries.join('\n').slice(0, MAX_LEDGER_CHARS);
}

function formatPriorContext(notes: EditorialContinuityNote[]): string {
  const entries = notes.map((n) => `- ${n.entity} [${n.category}] (${n.location || 'unlabelled'}): ${n.fact}`);
  let acc = '';
  for (let i = entries.length - 1; i >= 0; i--) {
    const next = acc ? `${entries[i]}\n${acc}` : entries[i];
    if (next.length > MAX_PRIOR_CONTEXT_CHARS) break;
    acc = next;
  }
  return acc;
}

// ─── Finding merge / dedupe ───────────────────────────────────────────────────

function normalizeText(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findingKey(f: EditorialFinding): string {
  const quote = normalizeText(f.quote).slice(0, 90);
  const title = normalizeText(f.title).slice(0, 40);
  return `${f.category}|${f.severity}|${quote || title}`;
}

function mergeFindings(lists: ReviewFinding[][]): ReviewFinding[] {
  const seen = new Set<string>();
  const out: EditorialFinding[] = [];
  for (const list of lists) {
    for (const finding of list) {
      const key = findingKey(finding);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(finding);
    }
  }
  return out;
}

// ─── LLM output sanitisation ──────────────────────────────────────────────────
// The model may return near-miss enum values or skip fields; instead of burning
// an LLM retry on a strict validation failure, coerce values to the nearest
// valid option and drop items that are unusable.

const NOTE_CATEGORIES = new Set(['PHYSICAL', 'RELATIONSHIP', 'TIMELINE', 'LOCATION', 'STATUS', 'OBJECT']);
const FINDING_CATEGORIES = new Set<string>(EDITORIAL_CATEGORIES);
const SEVERITIES = new Set<string>(EDITORIAL_SEVERITIES);

function sanitizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeFinding(raw: unknown): EditorialFinding | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = sanitizeString(r.title);
  const description = sanitizeString(r.description);
  if (!title && !description) return null;
  const category = sanitizeString(r.category).toUpperCase();
  const severity = sanitizeString(r.severity).toLowerCase();
  return {
    severity: SEVERITIES.has(severity) ? (severity as EditorialFinding['severity']) : 'warning',
    category: FINDING_CATEGORIES.has(category) ? (category as EditorialFinding['category']) : 'OTHER',
    title: title || 'Editorial note',
    description: description || 'No description provided.',
    quote: sanitizeString(r.quote),
    location: sanitizeString(r.location),
    suggestion: sanitizeString(r.suggestion),
  };
}

function sanitizeContinuityNote(raw: unknown): EditorialContinuityNote | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const entity = sanitizeString(r.entity);
  const fact = sanitizeString(r.fact);
  if (!entity && !fact) return null;
  const category = sanitizeString(r.category).toUpperCase();
  return {
    entity: entity || 'Unnamed',
    category: NOTE_CATEGORIES.has(category) ? category as EditorialContinuityNote['category'] : 'STATUS',
    fact: fact || 'No fact provided.',
    location: sanitizeString(r.location),
  };
}

function sanitizeChunkResult(raw: unknown): { findings: unknown; continuity: unknown } {
  if (!raw || typeof raw !== 'object') return { findings: [], continuity: [] };
  const r = raw as Record<string, unknown>;
  return {
    findings: Array.isArray(r.findings)
      ? r.findings.map(sanitizeFinding).filter((f): f is EditorialFinding => f !== null)
      : [],
    continuity: Array.isArray(r.continuity)
      ? r.continuity.map(sanitizeContinuityNote).filter((n): n is EditorialContinuityNote => n !== null)
      : [],
  };
}

function sanitizeCoherenceResult(raw: unknown): { findings: unknown } {
  if (!raw || typeof raw !== 'object') return { findings: [] };
  const r = raw as Record<string, unknown>;
  return {
    findings: Array.isArray(r.findings)
      ? r.findings.map(sanitizeFinding).filter((f): f is EditorialFinding => f !== null)
      : [],
  };
}

// ─── Orchestration ────────────────────────────────────────────────────────────

async function auditWindow(
  window: ReviewWindow,
  documentTitle: string,
  totalChunks: number,
  priorNotes: EditorialContinuityNote[]
): Promise<{ findings: ReviewFinding[]; continuity: EditorialContinuityNote[] }> {
  const system = getEditorialReviewSystemPrompt();
  const user = getEditorialReviewChunkUserPrompt({
    documentTitle,
    chunkIndex: window.index + 1,
    totalChunks,
    text: window.text,
    priorContext: priorNotes.length > 0 ? formatPriorContext(priorNotes) : undefined,
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await askLLMJSONWithFallback<unknown>(system, user, 0.2, REVIEW_MODEL);
      const validated = validateOrThrow(EditorialChunkResultSchema, sanitizeChunkResult(raw));
      return {
        findings: validated.findings.map((f) => ({
          ...f,
          bookTitle: window.bookTitle,
          location: f.location || window.location,
        })),
        continuity: validated.continuity,
      };
    } catch (error) {
      lastError = error;
      console.warn(`[EditorialReview] Window audit attempt ${attempt + 1} failed:`, error instanceof Error ? error.message : String(error));
    }
  }
  throw lastError;
}

async function runCoherenceAudit(
  documentTitle: string,
  allNotes: EditorialContinuityNote[]
): Promise<ReviewFinding[]> {
  if (allNotes.length === 0) return [];
  const ledger = formatLedger(allNotes);
  const raw = await askLLMJSONWithFallback<unknown>(
    getEditorialCoherenceSystemPrompt(),
    getEditorialCoherenceUserPrompt(ledger),
    0.2,
    REVIEW_MODEL
  );
  const validated = validateOrThrow(EditorialCoherenceResultSchema, sanitizeCoherenceResult(raw));
  return validated.findings;
}

/**
 * Run the full editorial audit for a review row and persist the findings.
 * Intended to be called from the editorial_review worker.
 */
export async function runEditorialReview(reviewId: string): Promise<void> {
  const review = await db.editorialReview.findUnique({ where: { id: reviewId } });
  if (!review) throw new Error(`Editorial review ${reviewId} not found`);
  if (!review.sourceText) throw new Error('Editorial review has no source text to audit');
  if (!review.jobId) throw new Error('Editorial review has no backing job id');

  await jobQueue.updateJobStatus(review.jobId, {
    status: 'active',
    progressMessage: 'Preparing manuscript...',
    progressPercent: 2,
  });
  await db.editorialReview.update({ where: { id: reviewId }, data: { status: 'active' } });

  const text = review.sourceText.slice(0, MAX_REVIEW_CHARS);
  const windows = splitIntoWindows(text);

  if (windows.length === 0) {
    throw new Error('No readable text found in the manuscript to review.');
  }

  const allFindings: ReviewFinding[][] = [];
  const allNotes: EditorialContinuityNote[] = [];

  // Pass 1 - per-window audit.
  for (const window of windows) {
    await jobQueue.updateJobStatus(review.jobId, {
      progressMessage: `Auditing ${window.location || `window ${window.index + 1}`} (${window.index + 1}/${windows.length})...`,
      progressPercent: Math.round(2 + (window.index / windows.length) * 78),
    });

    const result = await auditWindow(window, review.sourceLabel, windows.length, allNotes);
    allFindings.push(result.findings);
    allNotes.push(...result.continuity);
  }

  // Pass 2 - global coherence audit across the full ledger.
  await jobQueue.updateJobStatus(review.jobId, {
    progressMessage: 'Cross-checking continuity across all chapters...',
    progressPercent: 85,
  });

  let coherenceFindings: ReviewFinding[] = [];
  try {
    coherenceFindings = await runCoherenceAudit(review.sourceLabel, allNotes);
  } catch (error) {
    console.warn('[EditorialReview] Coherence pass failed, continuing with window findings:', error instanceof Error ? error.message : String(error));
  }
  allFindings.push(coherenceFindings);

  const merged = mergeFindings(allFindings).slice(0, MAX_FINDINGS);

  // Persist findings.
  await db.$transaction([
    db.editorialFinding.deleteMany({ where: { reviewId } }),
    db.editorialFinding.createMany({
      data: merged.map((f) => ({
        reviewId,
        severity: f.severity,
        category: f.category,
        title: f.title,
        description: f.description,
        quote: f.quote,
        location: f.location,
        bookTitle: f.bookTitle || '',
        suggestion: f.suggestion,
      })),
    }),
  ]);

  const completedAt = new Date();
  await db.$transaction([
    db.editorialReview.update({
      where: { id: reviewId },
      data: {
        status: 'completed',
        textLength: text.length,
        completedAt,
        sourceText: null, // release the stored manuscript once audited
      },
    }),
    db.job.update({
      where: { id: review.jobId! },
      data: {
        status: 'completed',
        progressPercent: 100,
        progressMessage: 'Editorial review complete.',
        completedAt,
      },
    }),  ]);

  console.log(`[EditorialReview] Completed review ${reviewId}: ${merged.length} findings across ${windows.length} windows.`);
}
