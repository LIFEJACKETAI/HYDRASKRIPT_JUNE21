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
import { audioBase64ToPlayableBuffer, concatenateWavBuffers } from '@/lib/services/audioFormat';
import { consumeCredits } from '@/lib/utils/credits';
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

  const { model } = getGeminiTtsConfig();
  await db.job.update({
    where: { id: jobId },
    data: { provider: 'Gemini TTS', modelName: model },
  });
  console.info(`[AudiobookWorker] Job ${jobId}: Gemini TTS (${model})`);

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

    await jobQueue.updateJobStatus(jobId, {
      progressMessage: `Preparing Gemini TTS audiobook (${model})...`,
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
        const progress = 5 + Math.floor(((chapterPosition + chunkPosition / chapterChunks.length) / chapters.length) * 80);
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

        const playable = audioBase64ToPlayableBuffer(result.audioBase64, result.audioMimeType);
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

    // Gemini returns PCM, which is saved as WAV above. Concatenating the PCM
    // payloads gives us a valid audiobook even when FFmpeg is not installed.
    const allWav = segments.every((segment) => segment.extension === 'wav');
    if (!allWav) {
      throw new Error('The generated audio segments use an unsupported container. Please retry the audiobook.');
    }

    const assembledWav = concatenateWavBuffers(segments.map((segment) => segment.buffer));
    const wavFilename = generateFilename(`audiobook_${bookId || jobId}`, 'wav');
    const wavPath = path.join(tempDir, wavFilename);
    await fs.writeFile(wavPath, assembledWav);

    let finalBuffer = assembledWav;
    let finalExtension = 'wav';
    let finalContentType = 'audio/wav';

    const m4bFilename = generateFilename(`audiobook_${bookId || jobId}`, 'm4b');
    const m4bPath = path.join(tempDir, m4bFilename);
    if (await convertWavToM4b(wavPath, m4bPath)) {
      finalBuffer = await fs.readFile(m4bPath);
      finalExtension = 'm4b';
      finalContentType = 'audio/mp4';
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
