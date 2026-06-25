import { generateAudiobookWorker } from './src/lib/workers/generateAudiobookWorker';
import { db } from './src/lib/db';
import { jobQueue } from './src/lib/workers/queue';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mocking the TTS service to avoid API calls and costs
jest.mock('./src/lib/services/audioService', () => ({
  chunkText: (text: string) => [text.slice(0, 100), text.slice(100)],
  generateAudioChunk: async (text: string, voiceId: string) => ({
    success: true,
    audioBase64: Buffer.from('mock-audio-content').toString('base64'),
  }),
  saveAudioChunk: async (ownerId: string, bookId: string, index: number, audio: string) => ({
    success: true,
    publicUrl: `/assets/audio/mock_${index}.mp3`,
  }),
  getVoiceId: () => 'mock-voice-id',
}));

async function runTest() {
  console.log('Starting Audiobook Pipeline Test...');

  // 1. Setup mock data in DB
  const user = await db.user.create({ data: { email: 'test@example.com', credits: 1000 } });
  const book = await db.book.create({
    data: {
      title: 'Test Book',
      ownerId: user.id,
      chapters: {
        create: [
          { title: 'Chapter 1', content: 'This is a long piece of text for chapter 1. ' + 'a'.repeat(200), index: 0 },
          { title: 'Chapter 2', content: 'This is another long piece of text for chapter 2. ' + 'b'.repeat(200), index: 1 },
        ],
      },
    },
    include: { chapters: true },
  });

  const job = await db.job.create({
    data: {
      bookId: book.id,
      ownerId: user.id,
      jobType: 'generate_audiobook',
      status: 'queued',
      creditsReserved: 50,
    },
  });

  try {
    console.log('Executing worker for job:', job.id);
    await generateAudiobookWorker(job.id);
    console.log('Worker completed successfully!');

    const updatedJob = await db.job.findUnique({ where: { id: job.id } });
    if (updatedJob?.status === 'completed') {
      console.log('SUCCESS: Job status is completed.');
      console.log('Result URL:', updatedJob.result);
    } else {
      console.error('FAILURE: Job status is', updatedJob?.status);
    }
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

runTest();
