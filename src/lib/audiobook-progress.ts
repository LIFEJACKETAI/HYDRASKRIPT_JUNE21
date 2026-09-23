// HydraSkript - Audiobook progress tracker
// Turns the worker's `audiobookProgress` checkpoint into a realistic,
// realtime progress display: segments narrated vs total segments, percent
// remaining, and a time estimate derived from the rolling per-segment rate.

/** Long TTS stalls between segments look like live narration pauses. Only
 * gaps larger than this (30 min) are treated as interrupted-claim boundaries
 * and excluded from the rate estimate. */
const MAX_SEGMENT_GAP_MS = 30 * 60 * 1000;

export interface TrackerChapterPlanEntry {
  chapterPosition: number;
  chapterIndex: number;
  title: string;
  chunkCount: number;
}

interface TrackerSegment {
  chapterPosition?: number;
  chunkPosition?: number;
  title?: string;
  updatedAt?: string;
}

export interface AudiobookTracker {
  segmentsDone: number;
  segmentsTotal: number | null;
  percentComplete: number;
  percentRemaining: number;
  elapsedSeconds: number;
  avgSecondsPerSegment: number | null;
  remainingSegments: number | null;
  remainingSeconds: number | null;
  etaUtc: string | null;
  currentChapterTitle: string | null;
  currentChunk: number | null;
  currentChapterChunks: number | null;
  chapterCount: number;
}

export interface AudiobookTrackerInput {
  status: string;
  progressPercent: number;
  startedAt: string | Date | null;
  /** The value of `result.audiobookProgress` from a job row. */
  audiobookProgress?: unknown;
}

function asIsoDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/**
 * Estimate seconds-per-segment from the intervals between consecutive segment
 * checkpoints. Uses a median first, so a single long TTS stall (or a 20-minute
 * dead-claim gap) does not skew the remaining-time prediction.
 */
export function estimateSecondsPerSegment(
  segments: TrackerSegment[]
): number | null {
  const times: number[] = [];
  for (const segment of segments) {
    const iso = asIsoDate(segment.updatedAt);
    if (iso) times.push(Date.parse(iso));
  }
  if (times.length < 2) return null;

  const deltas: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const delta = times[i] - times[i - 1];
    if (delta > 0 && delta <= MAX_SEGMENT_GAP_MS) deltas.push(delta);
  }
  if (deltas.length === 0) return null;

  const sorted = [...deltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const trimmed = deltas.filter((d) => d <= Math.max(median * 5, 60_000));
  if (trimmed.length === 0) return null;

  const mean = trimmed.reduce((sum, d) => sum + d, 0) / trimmed.length;
  return Math.max(1, Math.round((mean / 1000) * 10) / 10);
}

function simpleNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function computeAudiobookTracker(input: AudiobookTrackerInput): AudiobookTracker | null {
  const progress = input.audiobookProgress;
  if (!progress || typeof progress !== 'object') return null;

  const record = progress as Record<string, unknown>;
  const segments = Array.isArray(record.segments) ? (record.segments as TrackerSegment[]) : [];

  let chapterPlan: TrackerChapterPlanEntry[] = [];
  if (Array.isArray(record.chapterPlan)) {
    chapterPlan = record.chapterPlan.filter(
      (entry): entry is TrackerChapterPlanEntry =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as TrackerChapterPlanEntry).chapterPosition === 'number' &&
        typeof (entry as TrackerChapterPlanEntry).chunkCount === 'number'
    );
  }

  let segmentsTotal = simpleNumber(record.totalSegments)
    ? (record.totalSegments as number)
    : null;
  if (
    segmentsTotal === null &&
    chapterPlan.some((entry) => entry.chunkCount > 0)
  ) {
    segmentsTotal = chapterPlan.reduce((sum, entry) => sum + entry.chunkCount, 0);
  }

  const segmentsDone = segments.length;
  const status = input.status;
  const finished = status === 'completed';

  let percentComplete =
    segmentsTotal !== null && segmentsTotal > 0
      ? Math.round((segmentsDone / segmentsTotal) * 100)
      : input.progressPercent;
  if (finished) percentComplete = 100;
  // Narration stays visually below "assembling" (90) until the whole book is
  // stitched together, mirroring the worker's own caps.
  else if (segmentsTotal !== null && segmentsTotal > 0) percentComplete = Math.min(percentComplete, 85);
  percentComplete = Math.max(0, Math.min(100, percentComplete));

  const percentRemaining = Math.max(0, 100 - percentComplete);

  const startedIso = asIsoDate(input.startedAt);
  const now = Date.now();
  const elapsedSeconds =
    startedIso !== null ? Math.max(0, Math.round((now - Date.parse(startedIso)) / 1000)) : 0;

  // Measure the true narration rate from per-segment timestamps. The fallback
  // (elapsed / done) is only good enough for an ETA — it includes interrupted
  // claim gaps — so it is never surfaced as the "seconds per segment" stat.
  const measuredRate = estimateSecondsPerSegment(segments);
  const rateForEta =
    measuredRate ??
    (segmentsDone > 0 && elapsedSeconds > 0 ? elapsedSeconds / segmentsDone : null);

  const remainingSegments =
    segmentsTotal !== null ? Math.max(0, segmentsTotal - segmentsDone) : null;
  const remainingSeconds =
    rateForEta !== null && remainingSegments !== null
      ? Math.round(remainingSegments * rateForEta)
      : null;
  const etaUtc =
    remainingSeconds !== null ? new Date(now + remainingSeconds * 1000).toISOString() : null;

  const last = segments[segments.length - 1];
  const lastChapterPosition =
    typeof last?.chapterPosition === 'number' ? last.chapterPosition : null;
  const currentChapter = chapterPlan.find(
    (entry) => entry.chapterPosition === lastChapterPosition
  );
  const chapterCount =
    chapterPlan.length > 0
      ? chapterPlan.length
      : new Set(segments.map((s) => s.chapterPosition)).size;

  return {
    segmentsDone,
    segmentsTotal,
    percentComplete,
    percentRemaining,
    elapsedSeconds,
    avgSecondsPerSegment:
      measuredRate !== null ? Math.round(measuredRate * 10) / 10 : null,
    remainingSegments,
    remainingSeconds,
    etaUtc,
    currentChapterTitle:
      last?.title ??
      currentChapter?.title ??
      null,
    currentChunk:
      typeof last?.chunkPosition === 'number'
        ? last.chunkPosition + 1
        : null,
    currentChapterChunks: currentChapter?.chunkCount ?? null,
    chapterCount: Math.max(1, chapterCount),
  };
}