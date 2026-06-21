// HydraSkript - Audiobook Generation Worker
// Orchestrates the full pipeline: Text -> Chunks -> TTS -> FFmpeg Assembly -> Final Asset

import { db } from '@/lib/db';
import { jobQueue } from '@/lib/workers/queue';
import { chunkText, generateAudioChunk, saveAudioChunk, getVoiceId } from '@/lib/services/audioService';
import { reserveCredits, consumeCredits, refundCredits } from '@/lib/utils/credits';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { saveFile, generateFilename } from '@/lib/utils/storage';
import { createMediaAsset } from '@/lib/utils/storage';

const execPromise = promisify(exec);

export async function generateAudiobookWorker(jobId: string) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || !job.bookId) throw new Error('Invalid job or missing book ID');

  const book = await db.book.findUnique({
    where: { id: job.bookId },
    include: {
      chapters: { orderBy: { index: 'asc' } },
      owner: true
    },
  });

  if (!book) throw new Error('Book not found');

  try {
    // 1. Setup Temp Workspace
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hydra-audio-'));
    const chunkFiles: string[] = [];

    await jobQueue.updateJobStatus(jobId, {
      progressMessage: 'Preparing audiobook pipeline...',
      progressPercent: 5
    });

    // 2. Process Chapters
    const chapters = book.chapters;
    const totalChapters = chapters.length;
    const voiceId = getVoiceId('female'); // Default to female storyteller

    for (let i = 0; i < totalChapters; i++) {
      const chapter = chapters[i];
      const progress = 5 + Math.floor((i / totalChapters) * 80);

      await jobQueue.updateJobStatus(jobId, {
        progressMessage: `Generating audio for Chapter ${i + 1}/${totalChapters}...`,
        progressPercent: progress
      });

      // Chunk the chapter text
      const chunks = chunkText(chapter.content);

      for (let j = 0; j < chunks.length; j++) {
        const result = await generateAudioChunk(chunks[j], voiceId);

        if (!result.success) {
          throw new Error(`TTS failed at chapter ${i + 1}, chunk ${j}: ${result.error}`);
        }

        // Save chunk to storage and get URL
        const saveResult = await saveAudioChunk(book.ownerId, book.id, (i * 100) + j, result.audioBase64!);
        if (!saveResult.success) throw new Error(`Failed to save audio chunk: ${saveResult.error}`);

        // Also save locally for FFmpeg assembly
        const localPath = path.join(tempDir, `chunk_${i}_${j}.mp3`);
        await fs.writeFile(localPath, Buffer.from(result.audioBase64!, 'base64'));
        chunkFiles.push(localPath);
      }
    }

    // 3. Assemble with FFmpeg
    await jobQueue.updateJobStatus(jobId, {
      progressMessage: 'Assembling final audiobook file...',
      progressPercent: 90
    });

    const finalFilename = generateFilename(`audiobook_${book.id}`, 'm4b');
    const finalLocalPath = path.join(tempDir, finalFilename);

    // Create FFmpeg concat list
    const listFilePath = path.join(tempDir, 'list.txt');
    const listContent = chunkFiles.map(f => `file '${f}'`).join('\n');
    await fs.writeFile(listFilePath, listContent);

    // Run FFmpeg: concat demuxer -> m4b container
    await execPromise(`ffmpeg -f concat -safe 0 -i ${listFilePath} -c copy ${finalLocalPath}`);

    // 4. Upload Final Asset
    const finalBuffer = await fs.readFile(finalLocalPath);
    const publicUrl = saveFile('audiobooks', finalFilename, finalBuffer);

    await createMediaAsset({
      ownerId: book.ownerId,
      bookId: book.id,
      assetType: 'audiobook_complete',
      storagePath: publicUrl,
      publicUrl,
      metadata: {
        totalChapters: totalChapters,
        generatedAt: new Date().toISOString()
      },
    });

    // 5. Finalize Credits and Status
    await consumeCredits(book.ownerId, job.creditsReserved, jobId, 'Audiobook generation completed');

    await jobQueue.updateJobStatus(jobId, {
      status: 'completed',
      progressMessage: 'Audiobook generation complete!',
      progressPercent: 100,
      result: { publicUrl, fileName: finalFilename }
    });

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });

  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error(`[AudiobookWorker] Job ${jobId} failed:`, errMessage);

    await refundCredits(jobId, `Audiobook failed: ${errMessage}`);
    await jobQueue.updateJobStatus(jobId, {
      status: 'failed',
      errorMessage: errMessage,
      progressMessage: `Failed: ${errMessage}`
    });

    // Attempt cleanup if tempDir was created
    // (In a production environment, we'd track the tempDir path in the job state)
    throw error;
  }
}
