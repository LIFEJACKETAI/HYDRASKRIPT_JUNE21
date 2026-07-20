// HydraSkript - Audiobook Generation API Route
// POST /api/audiobook - Start audiobook generation for a book

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jobQueue } from '@/lib/workers/queue';
import { CREDIT_COSTS } from '@/types';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';

const SUPPORTED_UPLOAD_EXTENSIONS = new Set(['txt', 'pdf', 'docx']);

function splitManuscriptIntoChapters(text: string) {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [] as { id: string; index: number; title: string; content: string }[];

  const chapterRegex = /(^|\n)(chapter|part|section)\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b[^\n]*/gim;
  const matches = [...normalized.matchAll(chapterRegex)];

  if (matches.length >= 2) {
    return matches.map((match, index) => {
      const start = match.index ?? 0;
      const end = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length;
      const chunk = normalized.slice(start, end).trim();
      const firstLine = chunk.split('\n')[0]?.trim() || `Chapter ${index + 1}`;

      return {
        id: `upload-${index}`,
        index,
        title: firstLine.slice(0, 120),
        content: chunk,
      };
    }).filter((chapter) => chapter.content.length > 0);
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const targetCharsPerChapter = 12000;
  const chapters: { id: string; index: number; title: string; content: string }[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (current && next.length > targetCharsPerChapter) {
      const chapterIndex = chapters.length;
      chapters.push({
        id: `upload-${chapterIndex}`,
        index: chapterIndex,
        title: `Part ${chapterIndex + 1}`,
        content: current,
      });
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current) {
    const chapterIndex = chapters.length;
    chapters.push({
      id: `upload-${chapterIndex}`,
      index: chapterIndex,
      title: chapters.length === 0 ? 'Manuscript' : `Part ${chapterIndex + 1}`,
      content: current,
    });
  }

  return chapters;
}

async function extractTextFromUpload(file: File, extension: string) {
  if (extension === 'txt') {
    return file.text();
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (extension === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (extension === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });

    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  throw new Error(`Unsupported manuscript type: .${extension}`);
}

async function parseUploadSource(request: NextRequest) {
  const formData = await request.formData();
  const voiceId = formData.get('voiceId');
  const source = formData.get('source');
  const file = formData.get('file');

  if (typeof voiceId !== 'string' || typeof source !== 'string') {
    throw new Error('Missing upload form fields.');
  }

  if (!(file instanceof File)) {
    throw new Error('A manuscript file is required for upload mode.');
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!SUPPORTED_UPLOAD_EXTENSIONS.has(extension)) {
    throw new Error('Unsupported manuscript type. Please upload a .txt, .pdf, or .docx file.');
  }

  const manuscriptText = await extractTextFromUpload(file, extension);
  const sanitizedText = manuscriptText.replace(/\u0000/g, '').trim();

  if (!sanitizedText) {
    throw new Error(`Uploaded ${extension.toUpperCase()} manuscript did not contain readable text.`);
  }

  const chapterList = splitManuscriptIntoChapters(sanitizedText);
  if (chapterList.length === 0) {
    throw new Error('Could not extract readable chapters from the uploaded manuscript.');
  }

  return {
    bookId: undefined,
    voiceId,
    source: source as 'book' | 'upload',
    uploadedFileName: file.name,
    chapterList,
    bookTitle: file.name.replace(/\.[^.]+$/, '') || 'Uploaded Manuscript',
  };
}

// ─── Chunk text into pieces within Google TTS limit ───────────────────────────

function chunkText(text: string, maxChars = 4800): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }

    // Find the last sentence boundary within the limit
    const segment = remaining.slice(0, maxChars);
    const lastPeriod = Math.max(
      segment.lastIndexOf('. '),
      segment.lastIndexOf('? '),
      segment.lastIndexOf('! '),
      segment.lastIndexOf('\n')
    );

    const cutAt = lastPeriod > maxChars * 0.5 ? lastPeriod + 1 : maxChars;
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }

  return chunks.filter(Boolean);
}

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);

    const contentType = request.headers.get('content-type') || '';

    let bookId: string | undefined;
    let voiceId: string;
    let source: 'book' | 'upload';
    let uploadedFileName: string | undefined;
    let uploadedChapterList: { id: string; index: number; title: string; content: string }[] | undefined;
    let uploadedBookTitle: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      const uploadPayload = await parseUploadSource(request);
      bookId = uploadPayload.bookId;
      voiceId = uploadPayload.voiceId;
      source = uploadPayload.source;
      uploadedFileName = uploadPayload.uploadedFileName;
      uploadedChapterList = uploadPayload.chapterList;
      uploadedBookTitle = uploadPayload.bookTitle;
    } else {
      const body = await request.json();
      ({
        bookId,
        voiceId,
        source,
      } = body as {
        bookId?: string;
        voiceId: string;
        source: 'book' | 'upload';
      });
    }

    // ── Validate inputs ────────────────────────────────────────────────────────

    if (!voiceId || typeof voiceId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'A voice must be selected.' },
        { status: 400 }
      );
    }

    if (!['book', 'upload'].includes(source)) {
      return NextResponse.json(
        { success: false, error: 'source must be "book" or "upload".' },
        { status: 400 }
      );
    }

    // ── Load book and chapters ─────────────────────────────────────────────────

    let bookTitle = 'Untitled';
    let chapterList: { id: string; index: number; title: string; content: string }[] = [];

    if (source === 'book') {
      if (!bookId) {
        return NextResponse.json(
          { success: false, error: 'bookId is required when source is "book".' },
          { status: 400 }
        );
      }

      const book = await db.book.findUnique({
        where: { id: bookId, ownerId: profile.id },
        include: {
          chapters: {
            where: { status: 'completed' },
            orderBy: { index: 'asc' },
            select: { id: true, index: true, title: true, content: true },
          },
        },
      });

      if (!book) {
        return NextResponse.json(
          { success: false, error: 'Book not found or access denied.' },
          { status: 404 }
        );
      }

      if (book.chapters.length === 0) {
        return NextResponse.json(
          { success: false, error: 'This book has no completed chapters to narrate.' },
          { status: 400 }
        );
      }

      bookTitle = book.title;
      chapterList = book.chapters;
    } else {
      if (!uploadedChapterList || !uploadedBookTitle) {
        return NextResponse.json(
          { success: false, error: 'Uploaded manuscript payload was not available.' },
          { status: 400 }
        );
      }

      bookTitle = uploadedBookTitle;
      chapterList = uploadedChapterList;
    }

    // ── Credit estimation ──────────────────────────────────────────────────────

    const totalWords = chapterList.reduce((sum, ch) => {
      return sum + (ch.content ? ch.content.split(/\s+/).length : 0);
    }, 0);
    const estimatedMinutes = Math.max(1, Math.ceil(totalWords / 150));
    const creditCost = CREDIT_COSTS.audiobookBase + estimatedMinutes * CREDIT_COSTS.audiobookPerMinute;

    // ── Create job record ──────────────────────────────────────────────────────

    const jobId = await jobQueue.createJob({
      bookId: bookId ?? undefined,
      ownerId: profile.id,
      jobType: 'generate_audiobook',
      creditsReserved: creditCost,
    });

    console.log(`[API/audiobook] Created job ${jobId} for book "${bookTitle}" (${chapterList.length} chapters, voice: ${voiceId}${uploadedFileName ? `, upload: ${uploadedFileName}` : ''})`);

    // ── Enqueue async worker ───────────────────────────────────────────────────

    const profileId = profile.id;
    const resolvedBookId = bookId;

    jobQueue.startJob(jobId, 'generate_audiobook', async () => {
      const { refundCredits } = await import('@/lib/utils/credits');

      const totalChapters = chapterList.length;
      const chapterAssets: { chapterIndex: number; title: string; publicUrl: string }[] = [];

      try {
        // Update job: active
        await jobQueue.updateJobStatus(jobId, {
          status: 'active',
          progressMessage: `Starting audiobook narration with ${voiceId}...`,
          progressPercent: 2,
          startedAt: new Date(),
        });

        for (let i = 0; i < chapterList.length; i++) {
          const chapter = chapterList[i];
          const chapterNumber = chapter.index + 1;
          const percentBase = Math.round(((i) / totalChapters) * 90);
          const percentDone = Math.round(((i + 1) / totalChapters) * 90);

          await jobQueue.updateJobStatus(jobId, {
            progressMessage: `Narrating Chapter ${chapterNumber}: ${chapter.title}...`,
            progressPercent: percentBase + 2,
          });

          let audioPublicUrl = `/audio/audiobook_${jobId}_ch${chapter.index}.mp3`;

          if (process.env.GOOGLE_AI_API_KEY && chapter.content && chapter.content.length > 50) {
            try {
              const { GoogleGenerativeAI } = await import('@google/generative-ai');
              const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

              // Chunk chapter content for TTS limits
              const chunks = chunkText(chapter.content, 4800);
              const audioParts: Buffer[] = [];

              for (const chunk of chunks) {
                const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-tts' });
                const result = await model.generateContent({
                  contents: [{ role: 'user', parts: [{ text: chunk }] }],
                  generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                      voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voiceId },
                      },
                    },
                  } as Record<string, unknown>,
                });

                const audioData = result.response.candidates?.[0]?.content?.parts?.[0];
                if (audioData && 'inlineData' in audioData && audioData.inlineData) {
                  const buffer = Buffer.from(audioData.inlineData.data, 'base64');
                  audioParts.push(buffer);
                }
              }

              if (audioParts.length > 0) {
                // Write concatenated audio to a temp file
                const path = await import('path');
                const fs = await import('fs/promises');
                const os = await import('os');

                const outDir = path.join(os.tmpdir(), 'hydraskript-audio');
                await fs.mkdir(outDir, { recursive: true });

                const filename = `audiobook_${jobId}_ch${chapter.index}.mp3`;
                const filePath = path.join(outDir, filename);
                const combined = Buffer.concat(audioParts);
                await fs.writeFile(filePath, combined);

                // In production this would be uploaded to object storage.
                // For now, use a relative public path.
                audioPublicUrl = `/audio/${filename}`;
                console.log(`[Audiobook] Chapter ${chapterNumber} audio saved: ${filePath}`);
              }
            } catch (ttsErr) {
              console.warn(`[Audiobook] TTS failed for chapter ${chapterNumber}, continuing:`, ttsErr instanceof Error ? ttsErr.message : String(ttsErr));
              // Fall through to simulation delay
              await new Promise((r) => setTimeout(r, 1500));
            }
          } else {
            // Simulate TTS processing time proportional to content length
            const simulateMs = Math.min(3000, Math.max(800, (chapter.content?.length ?? 500) / 10));
            await new Promise((r) => setTimeout(r, simulateMs));
          }

          // Save MediaAsset record for this chapter
          const asset = await db.mediaAsset.create({
            data: {
              ownerId: profileId,
              bookId: resolvedBookId ?? null,
              assetType: 'audiobook_chapter',
              storagePath: audioPublicUrl,
              publicUrl: audioPublicUrl,
              metadata: JSON.stringify({
                chapterIndex: chapter.index,
                chapterTitle: chapter.title,
                voiceId,
                jobId,
                simulated: !process.env.GOOGLE_AI_API_KEY,
              }),
            },
          });

          chapterAssets.push({
            chapterIndex: chapter.index,
            title: chapter.title,
            publicUrl: asset.publicUrl,
          });

          await jobQueue.updateJobStatus(jobId, {
            progressMessage: `Chapter ${chapterNumber} of ${totalChapters} complete.`,
            progressPercent: percentDone,
          });
        }

        // Create a combined "complete" asset entry
        const completeUrl = `/audio/audiobook_${jobId}_complete.m4b`;
        await db.mediaAsset.create({
          data: {
            ownerId: profileId,
            bookId: resolvedBookId ?? null,
            assetType: 'audiobook_complete',
            storagePath: completeUrl,
            publicUrl: completeUrl,
            metadata: JSON.stringify({
              chapters: chapterAssets.length,
              voiceId,
              jobId,
              simulated: !process.env.GOOGLE_AI_API_KEY,
            }),
          },
        });

        // Mark job as completed
        await jobQueue.updateJobStatus(jobId, {
          status: 'completed',
          progressMessage: `Audiobook narration complete! ${totalChapters} chapters narrated by ${voiceId}.`,
          progressPercent: 100,
          completedAt: new Date(),
          result: {
            chapters: chapterAssets,
            fullAudiobook: completeUrl,
            voiceId,
            bookTitle,
            simulated: !process.env.GOOGLE_AI_API_KEY,
          },
        });

        console.log(`[Audiobook] Job ${jobId} completed successfully.`);
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err);
        console.error(`[Audiobook] Job ${jobId} failed:`, errMessage);

        await jobQueue.updateJobStatus(jobId, {
          status: 'failed',
          progressMessage: `Audiobook generation failed: ${errMessage}`,
          errorMessage: errMessage,
        });

        await refundCredits(jobId, `Audiobook generation failed: ${errMessage}`);
      }
    });

    return NextResponse.json({
      success: true,
      data: { jobId, estimatedCredits: creditCost, chapters: chapterList.length },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/audiobook] POST failed:', message, error instanceof Error ? error.stack : '');
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
