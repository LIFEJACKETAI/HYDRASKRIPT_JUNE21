// HydraSkript - Audiobook Generation Worker
// Text -> Gemini TTS chunks -> playable audio -> optional M4B assembly -> asset.

import { db } from '@/lib/db';
import { jobQueue } from '@/lib/workers/queue';
import {
  chunkText,
  getGeminiTtsConfig,
  generateAudioChunk,
  normalizeVoiceId,
  saveAudioChunk,
} from '@/lib/services/audioService';
import {
  audioBase64ToPlayableBuffer,
  concatenateWavBuffers,
  type PlayableAudio,
} from '@/lib/services/audioFormat';
import { consumeCredits } from '@/lib/utils/credits';
import {
  clampTimeoutMs,
  defaultRequestTimeoutMs,
  hasBudgetForAttempt,
  LlmBudgetExceededError,
} from '@/lib/llm/budget';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { saveFile, generateFilename, createMediaAsset } from '@/lib/utils/storage';

const execFilePromise = promisify(execFile);

interface AudioChapter {
  id?: string;
  index: number;
  title: string;
  content: string;
}

interface AudioJobPayload {
  voiceId?: string;
  source?: 'book' | 'upload';
  bookTitle?: string;
  chapters?: AudioChapter[];
  audiobookProgress?: unknown;
}

interface LocalAudioSegment {
  buffer: Buffer;
  extension: string;
}

function parseJobPayload(raw: string | null | undefined): AudioJobPayload {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as AudioJobPayload) : {};
  } catch {
    return {};
  }
}

/**
 * Resumable-audiobook checkpointing.
 *
 * The durable queue re-claims a job whenever the function running it is killed
 * (Vercel function cap, a Prisma pool timeout, a redeploy). Without a
 * checkpoint every retry re-generates EVERY TTS segment from scratch — slow
 * and wasteful enough that a long book can loop on "generating" forever. Each
 * completed segment is persisted into `job.result` under `audiobookProgress`;
 * a later claim skips segments already produced and re-downloads their bytes
 * for the final assembly instead of re-running TTS.
 */
interface SegmentProgress {
  segmentIndex: number;
  chapterIndex: number;
  chapterPosition: number;
  chunkPosition: number;
  title: string;
  publicUrl: string;
  extension: string;
  mimeType: string;
  /** ISO timestamp of when this segment's audio finished saving to storage.
   *  Older checkpoints (pre-tracker) lack it; the estimator simply skips them. */
  updatedAt?: string;
}

interface ChapterPlanEntry {
  chapterPosition: number;
  chapterIndex: number;
  title: string;
  chunkCount: number;
}

interface AudiobookProgress {
  fingerprint: string;
  /** Total TTS segments across all chapters, known up-front from the chunker. */
  totalSegments?: number;
  chapterPlan?: ChapterPlanEntry[];
  segments: SegmentProgress[];
}

/**
 * Cheap structural fingerprint of the chapter layout. Content is identified by
 * length (not copied), so audio saved for a *different* chapter arrangement is
 * never reused — a book whose text changed must re-narrate from scratch.
 */
function chapterFingerprint(chapters: AudioChapter[]): string {
  return chapters
    .map((chapter) => `${chapter.index}:${chapter.title}:${chapter.content.length}`)
    .join('|');
}

function parseAudiobookProgress(raw: unknown, fingerprint: string): SegmentProgress[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as { fingerprint?: unknown; segments?: unknown };
  if (record.fingerprint !== fingerprint || !Array.isArray(record.segments)) return null;

  const segments: SegmentProgress[] = [];
  for (const entry of record.segments) {
    const s = entry as Record<string, unknown>;
    if (
      typeof s.publicUrl !== 'string' ||
      typeof s.extension !== 'string' ||
      typeof s.mimeType !== 'string' ||
      typeof s.chapterIndex !== 'number' ||
      typeof s.chapterPosition !== 'number' ||
      typeof s.chunkPosition !== 'number' ||
      typeof s.segmentIndex !== 'number' ||
      typeof s.title !== 'string'
    ) {
      return null;
    }
    segments.push({
      segmentIndex: s.segmentIndex,
      chapterIndex: s.chapterIndex,
      chapterPosition: s.chapterPosition,
      chunkPosition: s.chunkPosition,
      title: s.title,
      publicUrl: s.publicUrl,
      extension: s.extension,
      mimeType: s.mimeType,
      // Older checkpoints have no timestamp; the rate estimator simply skips
      // them until freshly-produced segments (with times) take over.
      ...(typeof s.updatedAt === 'string' ? { updatedAt: s.updatedAt } : {}),
    });
  }
  return segments.length > 0 ? segments : null;
}

async function persistAudiobookProgress(
  jobId: string,
  fingerprint: string,
  segments: SegmentProgress[],
  progressMessage: string,
  progressPercent: number,
  meta?: { totalSegments?: number; chapterPlan?: ChapterPlanEntry[] }
): Promise<void> {
  await jobQueue.updateJobStatus(jobId, {
    progressMessage,
    progressPercent,
    result: {
      audiobookProgress: {
        fingerprint,
        ...(meta?.totalSegments !== undefined ? { totalSegments: meta.totalSegments } : {}),
        ...(meta?.chapterPlan !== undefined ? { chapterPlan: meta.chapterPlan } : {}),
        segments,
      },
    },
    mergeResult: true,
  });
}

async function fetchSegmentBuffer(publicUrl: string): Promise<Buffer> {
  if (!/^https?:\/\//.test(publicUrl)) {
    throw new Error(`Cannot resume audio segment "${publicUrl}": not an absolute URL.`);
  }
  try {
    // Bounded so one stalled storage fetch cannot block the claim forever.
    const response = await fetch(publicUrl, {
      signal: AbortSignal.timeout(clampTimeoutMs(defaultRequestTimeoutMs())),
    });
    if (!response.ok) {
      throw new Error(`resume fetch returned HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    throw new Error(
      `Failed to re-download resumed audio segment (${error instanceof Error ? error.message : String(error)}).`
    );
  }
}

async function convertWavToM4b(wavPath: string, m4bPath: string): Promise<boolean> {
  try {
    // FFmpeg is available in the full Node/Docker deployment, but not in every
    // serverless runtime. The caller keeps the valid WAV when it is unavailable.
    await execFilePromise('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-i',
      wavPath,
      '-vn',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      m4bPath,
    ]);
    return true;
  } catch (error) {
    console.warn(
      '[AudiobookWorker] FFmpeg M4B conversion unavailable; returning WAV instead:',
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

export async function generateAudiobookWorker(jobId: string) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('Invalid audiobook job');

  const fishModel = process.env.FISH_AUDIO_MODEL?.trim() || 's2.1-pro';
  const geminiModel = getGeminiTtsConfig().model;
  let activeProvider = 'Fish Audio';
  let activeModel = fishModel;
  let providerRecorded = false;

  const payload = parseJobPayload(job.result);
  const selectedVoice = normalizeVoiceId(payload.voiceId);
  let bookId: string | undefined = job.bookId ?? undefined;
  let ownerId = job.ownerId;
  let bookTitle = payload.bookTitle || 'Audiobook';
  let chapters: AudioChapter[] = [];

  if (job.bookId) {
    const book = await db.book.findUnique({
      where: { id: job.bookId },
      include: {
        // Only narrate finished chapters. This mirrors the API validation and
        // prevents empty/pending chapters from producing blank audio segments.
        chapters: {
          where: { status: 'completed' },
          orderBy: { index: 'asc' },
        },
      },
    });

    if (!book) throw new Error('Book not found');

    ownerId = book.ownerId;
    bookTitle = book.title;
    chapters = book.chapters.map((chapter) => ({
      id: chapter.id,
      index: chapter.index,
      title: chapter.title || `Chapter ${chapter.index + 1}`,
      content: chapter.content,
    }));
  } else if (Array.isArray(payload.chapters)) {
    // Upload mode intentionally has no Book row. The API stores the extracted
    // chapters in the job payload so the durable queue can process them after
    // the request that received the file has finished.
    chapters = payload.chapters
      .filter((chapter) => typeof chapter?.content === 'string' && chapter.content.trim().length > 0)
      .map((chapter, index) => ({
        id: chapter.id,
        index: Number.isInteger(chapter.index) ? chapter.index : index,
        title: chapter.title || `Chapter ${index + 1}`,
        content: chapter.content,
      }));
  }

  if (chapters.length === 0) {
    throw new Error('There are no readable chapters to narrate.');
  }

  let tempDir: string | null = null;

  try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hydra-audio-'));
    const segments: LocalAudioSegment[] = [];
    const chapterAssets: { chapterIndex: number; title: string; publicUrl: string }[] = [];
    let segmentIndex = 0;

    // Resume support: reuse audio produced by an earlier, interrupted claim
    // instead of regenerating every TTS segment from the beginning.
    const fingerprint = chapterFingerprint(chapters);
    const savedSegments = parseAudiobookProgress(payload.audiobookProgress, fingerprint);
    const resumeByKey = new Map<string, SegmentProgress>();
    const progressSegments: SegmentProgress[] = [];
    for (const saved of savedSegments ?? []) {
      resumeByKey.set(`${saved.chapterPosition}:${saved.chunkPosition}`, saved);
      progressSegments.push(saved);
    }
    segmentIndex = progressSegments.length;
    if (progressSegments.length > 0) {
      console.info(
        `[AudiobookWorker] Job ${jobId}: resuming with ${progressSegments.length} segment(s) already produced.`
      );
    }

    // The chunker is deterministic, so tally the exact narration plan up-front.
    // This is what powers the realtime tracker (percent done, segments left).
    const chapterPlan: ChapterPlanEntry[] = chapters.map((chapter, chapterPosition) => ({
      chapterPosition,
      chapterIndex: chapter.index,
      title: chapter.title,
      chunkCount: chunkText(chapter.content).length,
    }));
    const totalSegments = chapterPlan.reduce((sum, chapter) => sum + chapter.chunkCount, 0);

    await jobQueue.updateJobStatus(jobId, {
      progressMessage:
        totalSegments > 0
          ? `Preparing TTS for ${chapters.length} chapter(s), ~${totalSegments} segment(s)...`
          : `Preparing TTS audiobook...`,
      progressPercent: 5,
    });
    await jobQueue.heartbeat(jobId);

    for (let chapterPosition = 0; chapterPosition < chapters.length; chapterPosition++) {
      const chapter = chapters[chapterPosition];
      const chapterChunks = chunkText(chapter.content);

      if (chapterChunks.length === 0) {
        continue;
      }

      for (let chunkPosition = 0; chunkPosition < chapterChunks.length; chunkPosition++) {
        // Stop cleanly at a segment boundary when the per-claim window is nearly
        // spent. Without this the loop keeps making short-timeout TTS calls until
        // Vercel hard-kills the function at maxDuration, leaving the job `active`
        // until lease recovery and re-claiming it oldest-first — which starves
        // every newer job behind it. Throwing here makes the queue re-queue with
        // backoff; the checkpoint resumes from this exact segment next claim.
        if (!hasBudgetForAttempt()) {
          throw new LlmBudgetExceededError(
            `Audiobook claim budget exhausted after ${segmentIndex}/${Math.max(totalSegments, 1)} segment(s) — re-queued to resume.`
          );
        }

        const progress = 5 + Math.floor((segmentIndex / Math.max(totalSegments, 1)) * 80);

        // Checkpoint hit? A previous claim already narrated this exact segment
        // (same chapter layout fingerprint). Reuse its bytes instead of paying
        // for TTS again.
        const resumed = resumeByKey.get(`${chapterPosition}:${chunkPosition}`);
        if (resumed) {
          await jobQueue.updateJobStatus(jobId, {
            progressMessage: `Resuming existing audio for ${chapter.title} (${chunkPosition + 1}/${chapterChunks.length})...`,
            progressPercent: Math.min(progress, 85),
          });
          await jobQueue.heartbeat(jobId);

          const buffer = await fetchSegmentBuffer(resumed.publicUrl);
          segments.push({ buffer, extension: resumed.extension });
          chapterAssets.push({
            chapterIndex: chapter.index,
            title: chapterChunks.length > 1 ? `${chapter.title} — Part ${chunkPosition + 1}` : chapter.title,
            publicUrl: resumed.publicUrl,
          });
          segmentIndex++;
          continue;
        }

        await jobQueue.updateJobStatus(jobId, {
          progressMessage: `Generating audio for ${chapter.title} (${chunkPosition + 1}/${chapterChunks.length})...`,
          progressPercent: Math.min(progress, 85),
        });
        await jobQueue.heartbeat(jobId);

        const result = await generateAudioChunk(chapterChunks[chunkPosition], selectedVoice);
        if (!result.success || !result.audioBase64) {
          throw new Error(
            `TTS failed at ${chapter.title}, segment ${chunkPosition + 1}: ${result.error || 'no audio returned'}`
          );
        }

        if (!providerRecorded) {
          providerRecorded = true;
          activeProvider = result.provider === 'gemini' ? 'Gemini TTS' : 'Fish Audio';
          activeModel = result.provider === 'gemini' ? geminiModel : fishModel;
          await db.job.update({
            where: { id: jobId },
            data: { provider: activeProvider, modelName: activeModel },
          });
          console.info(`[AudiobookWorker] Job ${jobId}: ${activeProvider} (${activeModel})`);
        }

        const playable: PlayableAudio = audioBase64ToPlayableBuffer(result.audioBase64, result.audioMimeType);
        segments.push({ buffer: playable.buffer, extension: playable.extension });

        const saveResult = await saveAudioChunk(ownerId, bookId, segmentIndex, result.audioBase64, {
          audioMimeType: result.audioMimeType,
          filePrefix: `audio_chunk_${bookId || jobId}_${chapterPosition}_${chunkPosition}`,
          metadata: {
            jobId,
            chapterIndex: chapter.index,
            chapterTitle: chapter.title,
            segmentIndex,
            voiceId: selectedVoice,
          },
        });
        if (!saveResult.success || !saveResult.publicUrl) {
          throw new Error(`Failed to save audio segment: ${saveResult.error || 'unknown storage error'}`);
        }

        // Checkpoint BEFORE any other step can kill this claim, so the next
        // recovery resumes from here instead of regenerating the book. The
        // timestamp lets the realtime tracker estimate remaining time.
        progressSegments.push({
          segmentIndex,
          chapterIndex: chapter.index,
          chapterPosition,
          chunkPosition,
          title: chapter.title,
          publicUrl: saveResult.publicUrl,
          extension: playable.extension,
          mimeType: playable.mimeType,
          updatedAt: new Date().toISOString(),
        });
        await persistAudiobookProgress(
          jobId,
          fingerprint,
          progressSegments,
          `Saved audio for ${chapter.title} (${chunkPosition + 1}/${chapterChunks.length}) — ${progressSegments.length} segment(s) so far.`,
          Math.min(progress, 85),
          { totalSegments, chapterPlan }
        );

        chapterAssets.push({
          chapterIndex: chapter.index,
          title: chapterChunks.length > 1 ? `${chapter.title} — Part ${chunkPosition + 1}` : chapter.title,
          publicUrl: saveResult.publicUrl,
        });
        segmentIndex++;
      }
    }

    if (segments.length === 0) {
      throw new Error('The selected source did not produce any audio segments.');
    }

    await jobQueue.updateJobStatus(jobId, {
      progressMessage: 'Assembling final audiobook file...',
      progressPercent: 90,
    });
    await jobQueue.heartbeat(jobId);

    const allWav = segments.every((segment) => segment.extension === 'wav');
    const allMp3 = segments.every((segment) => segment.extension === 'mp3');
    if (!allWav && !allMp3) {
      throw new Error('The generated audio segments use an unsupported container. Please retry the audiobook.');
    }

    let finalBuffer: Buffer;
    let finalExtension = 'wav';
    let finalContentType = 'audio/wav';

    if (allWav) {
      // Gemini returns PCM, which is saved as WAV above. Concatenating the PCM
      // payloads gives us a valid audiobook even when FFmpeg is not installed.
      const assembledWav = concatenateWavBuffers(segments.map((segment) => segment.buffer));
      const wavFilename = generateFilename(`audiobook_${bookId || jobId}`, 'wav');
      const wavPath = path.join(tempDir, wavFilename);
      await fs.writeFile(wavPath, assembledWav);

      finalBuffer = assembledWav;

      const m4bFilename = generateFilename(`audiobook_${bookId || jobId}`, 'm4b');
      const m4bPath = path.join(tempDir, m4bFilename);
      if (await convertWavToM4b(wavPath, m4bPath)) {
        finalBuffer = await fs.readFile(m4bPath);
        finalExtension = 'm4b';
        finalContentType = 'audio/mp4';
      }
    } else {
      // Fish Audio returns MP3. Byte-concatenate the segments (MP3 frames are
      // self-contained), preferring an FFmpeg concat demuxer pass when present.
      const segmentPaths: string[] = [];
      for (let index = 0; index < segments.length; index++) {
        const segmentPath = path.join(tempDir, `segment_${index}.mp3`);
        await fs.writeFile(segmentPath, segments[index].buffer);
        segmentPaths.push(segmentPath);
      }

      const listFilePath = path.join(tempDir, 'mp3-list.txt');
      await fs.writeFile(listFilePath, segmentPaths.map((file) => `file '${file}'`).join('\n'));

      const finalMp3Filename = generateFilename(`audiobook_${bookId || jobId}`, 'mp3');
      const concatPath = path.join(tempDir, finalMp3Filename);

      try {
        await execFilePromise('ffmpeg', [
          '-y',
          '-loglevel',
          'error',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          listFilePath,
          '-c',
          'copy',
          concatPath,
        ]);
        finalBuffer = await fs.readFile(concatPath);
      } catch (error) {
        console.warn(
          '[AudiobookWorker] FFmpeg MP3 concat unavailable; appending MP3 frames instead:',
          error instanceof Error ? error.message : String(error)
        );
        finalBuffer = Buffer.concat(segments.map((segment) => segment.buffer));
      }

      finalExtension = 'mp3';
      finalContentType = 'audio/mpeg';
    }

    const finalFilename = generateFilename(`audiobook_${bookId || jobId}`, finalExtension);
    const publicUrl = await saveFile('audiobooks', finalFilename, finalBuffer, {
      contentType: finalContentType,
    });

    await createMediaAsset({
      ownerId,
      bookId,
      assetType: 'audiobook_complete',
      storagePath: publicUrl,
      publicUrl,
      metadata: {
        jobId,
        title: bookTitle,
        totalChapters: chapters.length,
        totalSegments: segments.length,
        voiceId: selectedVoice,
        format: finalExtension,
        generatedAt: new Date().toISOString(),
      },
    });

    const consumed = await consumeCredits(ownerId, job.creditsReserved, jobId, 'Audiobook generation completed');
    if (!consumed) {
      throw new Error('Audiobook was generated, but credits could not be finalized.');
    }

    await jobQueue.updateJobStatus(jobId, {
      status: 'completed',
      progressMessage: 'Audiobook generation complete!',
      progressPercent: 100,
      result: {
        publicUrl,
        // `fullAudiobook` keeps the response compatible with the existing UI.
        fullAudiobook: publicUrl,
        fileName: finalFilename,
        format: finalExtension,
        title: bookTitle,
        voiceId: selectedVoice,
        chapters: chapterAssets,
      },
    });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error(`[AudiobookWorker] Job ${jobId} failed:`, errMessage);

    // The queue owns escrow refunds so a retry does not refund credits before
    // the job has exhausted its retry budget.
    await jobQueue.updateJobStatus(jobId, {
      status: 'failed',
      errorMessage: errMessage,
      progressMessage: `Failed: ${errMessage}`,
    });

    throw error;
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch((cleanupError) => {
        console.warn('[AudiobookWorker] Temporary audio cleanup failed:', cleanupError);
      });
    }
  }
}
