// HydraSkript - Book Generator Service (Interactive Studio Version)
import { db } from '@/lib/db';
import { jobQueue } from '@/lib/workers/queue';
import { reserveCredits, consumeCredits, refundCredits, estimateBookCredits, estimateColoringBookCredits, getBookDefaults } from '@/lib/utils/credits';
import { askLLMJSON } from '@/lib/llm/openrouter';
import { getOutlinePrompt, getOutlineUserPrompt, getChapterWritePrompt, getChapterUserPrompt, getImagePromptExtractionPrompt, getImagePromptExtractionUserPrompt, getChildrensChapterPrompt, getColoringOutlinePrompt, getColoringOutlineUserPrompt, getColoringChapterPrompt } from '@/lib/llm/prompts';
import { BookOutlineSchema, ChapterGenerationSchema, ImagePromptSchema, validateOrThrow } from '@/lib/llm/schema';
import { generateBookCover, generateChapterIllustration, generateColoringPage } from '@/lib/services/imageService';
import { getStyleSystemPrompt } from '@/lib/services/styleAnalyzer';
import type { TargetAudience, Genre, ColoringTheme } from '@/types';
import { AUDIENCE_CONFIG, COLORING_THEMES } from '@/types';

/**
 * Initial entry point to start the book generation process.
 * Now only handles credit reservation and triggers the Outline phase.
 */
export async function startBookGeneration(
  bookId: string,
  ownerId: string
): Promise<{ jobId: string; estimatedCredits: number } | { error: string }> {
  const book = await db.book.findUnique({
    where: { id: bookId, ownerId },
    include: { styleProfile: true },
  });

  if (!book) return { error: 'Book not found' };
  if (['outlining', 'writing', 'finalizing'].includes(book.status)) {
    return { error: 'Book is already in a generation state' };
  }

  const defaults = getBookDefaults(book.targetAudience as TargetAudience);
  const isChildrenBook = ['0-5', '6-9', '10-14'].includes(book.targetAudience);
  const isColoringBook = book.genre === 'coloring';
  const coloringTheme = book.coloringTheme as ColoringTheme | null;

  let chapterCount = defaults.chapterCount;
  try {
    const existingOutline = JSON.parse(book.outline || '{}');
    if (existingOutline.requestedChapters) chapterCount = existingOutline.requestedChapters;
  } catch {}

  let estimatedCredits: number;
  if (isColoringBook) {
    estimatedCredits = estimateColoringBookCredits(chapterCount, coloringTheme);
  } else {
    estimatedCredits = estimateBookCredits(
      book.targetAudience as TargetAudience,
      defaults.chapterCount,
      defaults.wordsPerChapter,
      isChildrenBook,
      false
    );
  }

  const jobId = await jobQueue.createJob({
    bookId,
    ownerId,
    jobType: 'generate_outline',
    creditsReserved: estimatedCredits,
    stepIndex: 0,
  });

  const reserved = await reserveCredits(ownerId, estimatedCredits, jobId, 'Book generation estimate');
  if (!reserved) {
    await jobQueue.updateJobStatus(jobId, {
      status: 'failed',
      errorMessage: 'Insufficient credits',
      progressMessage: 'Failed: Insufficient credits',
    });
    await db.job.update({ where: { id: jobId }, data: { creditsReserved: 0 } });
    return { error: 'Insufficient credits.' };
  }

  await db.book.update({
    where: { id: bookId },
    data: { status: 'outlining', totalCreditsEstimated: estimatedCredits },
  });

  // Trigger the outline generation via the queue
  await jobQueue.startJob(jobId, 'generate_outline');

  return { jobId, estimatedCredits };
}

/**
 * PHASE 1: Outline Generation
 * Generates the story blueprint and stops for user approval.
 */
export async function generateOutline(bookId: string, ownerId: string, jobId: string): Promise<void> {
  console.log(`[DEBUG] 1. generateOutline started for bookId: ${bookId}`);
  
  const book = await db.book.findUnique({
    where: { id: bookId },
    include: { styleProfile: true },
  });

  if (!book) {
    console.log(`[DEBUG] X. Book not found!`);
    throw new Error('Book not found');
  }

  try {
    console.log(`[DEBUG] 2. Updating job status to 10%...`);
    await jobQueue.updateJobStatus(jobId, { progressMessage: 'Generating story blueprint...', progressPercent: 10 });

    console.log(`[DEBUG] 3. Getting style system prompt...`);
    const stylePrompt = await getStyleSystemPrompt(book.styleProfileId);
    
    const targetAudience = book.targetAudience as TargetAudience;
    const genre = book.genre as Genre;
    const config = AUDIENCE_CONFIG[targetAudience];
    const coloringTheme = book.coloringTheme as ColoringTheme | null;

    let chapterCount = config.defaultChapters;
    try {
      const existingOutline = JSON.parse(book.outline || '{}');
      if (existingOutline.requestedChapters) chapterCount = existingOutline.requestedChapters;
    } catch {}

    let outlinePrompt: string;
    let outlineUser: string;

    if (genre === 'coloring' && coloringTheme && COLORING_THEMES[coloringTheme]) {
      outlinePrompt = getColoringOutlinePrompt(coloringTheme, chapterCount);
      outlineUser = getColoringOutlineUserPrompt(book.title, coloringTheme);
    } else {
      console.log(`[DEBUG] 4. Parsing character names...`);
      // characterNames is Postgres String[] — Prisma returns a JS array directly, never a JSON string
      const characterNames: string[] = Array.isArray(book.characterNames)
        ? (book.characterNames as string[])
        : [];

      outlinePrompt = getOutlinePrompt(genre, targetAudience, chapterCount, stylePrompt, characterNames.length > 0 ? characterNames : undefined, book.adventureType ?? undefined);
      outlineUser = getOutlineUserPrompt(book.title, genre, targetAudience);
    }

    console.log(`[DEBUG] 5. Calling askLLMJSON (waiting for AI response...)`);
    const outlineResult = await askLLMJSON<unknown>(outlinePrompt, outlineUser, 0.7);
    
    console.log(`[DEBUG] 6. AI responded! Validating schema...`);
    const outline = validateOrThrow(BookOutlineSchema, outlineResult);

    console.log(`[DEBUG] 7. Saving outline to database...`);
    await db.book.update({
      where: { id: bookId },
      data: {
        outline: JSON.stringify(outline),
        status: 'awaiting_outline_approval'
      }
    });

    console.log(`[DEBUG] 8. Initializing empty chapters...`);
    for (let i = 0; i < outline.chapters.length; i++) {
      const ch = outline.chapters[i];
      await db.chapter.upsert({
        where: { bookId_index: { bookId, index: i } },
        create: { bookId, index: i, title: ch.title, synopsis: ch.synopsis, wordTarget: ch.wordTarget, status: 'pending', generationJobId: jobId },
        update: { title: ch.title, synopsis: ch.synopsis, wordTarget: ch.wordTarget, status: 'pending', generationJobId: jobId },
      });
    }

    console.log(`[DEBUG] 9. Outline complete! Updating job to 100%`);
    await jobQueue.updateJobStatus(jobId, {
      status: 'completed',
      progressMessage: 'Blueprint complete! Please review and approve your outline.',
      progressPercent: 100
    });

  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error("[Queue] OUTLINE GENERATION FAILED:", errMessage);
    await db.book.update({ where: { id: bookId }, data: { status: 'failed' } });
    await refundCredits(jobId, `Outline failed: ${errMessage}`);
    await jobQueue.updateJobStatus(jobId, { status: 'failed', errorMessage: errMessage, progressMessage: `Failed: ${errMessage}` });
    throw error;
  }
}

/**
 * PHASE 2: Iterative Chapter Generation
 * Writes a single chapter and stops for user approval.
 */
export async function generateChapter(bookId: string, ownerId: string, jobId: string, chapterIndex: number): Promise<void> {
  const book = await db.book.findUnique({
    where: { id: bookId },
    include: { styleProfile: true },
  });

  if (!book) throw new Error('Book not found');

  try {
    await jobQueue.updateJobStatus(jobId, { progressMessage: `Writing chapter ${chapterIndex + 1}...`, progressPercent: 20 });

    // Find the previous chapter to get the continuity summary
    const prevChapter = await db.chapter.findFirst({
      where: { bookId, index: { lt: chapterIndex } },
      orderBy: { index: 'desc' },
    });
    const previousSummary = prevChapter?.summaryForNext || '';

    const stylePrompt = await getStyleSystemPrompt(book.styleProfileId);
    const targetAudience = book.targetAudience as TargetAudience;
    const genre = book.genre as Genre;
    const isChildrenBook = ['0-5', '6-9', '10-14'].includes(targetAudience);
    const isColoringBook = genre === 'coloring';
    const coloringTheme = book.coloringTheme as ColoringTheme | null;
    const config = AUDIENCE_CONFIG[targetAudience];

    const chapter = await db.chapter.findUnique({
      where: { bookId_index: { bookId, index: chapterIndex } },
    });

    if (!chapter) throw new Error(`Chapter ${chapterIndex} not found`);

    let fullSystemPrompt: string;
    let chapterUser: string;

    if (isColoringBook && coloringTheme && COLORING_THEMES[coloringTheme]) {
      fullSystemPrompt = getColoringChapterPrompt(coloringTheme, chapterIndex, 10); // approximate total chapters
      chapterUser = `Write a brief, poetic description for the coloring page titled "${chapter.title}". Visual subject: ${chapter.synopsis}`;
    } else {
      // characterNames is Postgres String[] — Prisma returns a JS array directly, never a JSON string
      const characterNames: string[] = Array.isArray(book.characterNames)
        ? (book.characterNames as string[])
        : [];

      const chapterPrompt = getChapterWritePrompt(stylePrompt, book.title, genre, chapterIndex, 10, previousSummary, characterNames.length > 0 ? characterNames : undefined);
      const childrensPrompt = isChildrenBook ? getChildrensChapterPrompt(targetAudience) : '';
      fullSystemPrompt = childrensPrompt ? `${childrensPrompt}\n\n${chapterPrompt}` : chapterPrompt;
      chapterUser = getChapterUserPrompt(chapter.title, chapter.synopsis, chapter.wordTarget);
    }

    const rawResult = await askLLMJSON<unknown>(fullSystemPrompt, chapterUser, 0.7);
    const chapterResult = validateOrThrow(ChapterGenerationSchema, rawResult);

    await db.chapter.update({
      where: { id: chapter.id },
      data: {
        content: chapterResult.content,
        wordCount: chapterResult.content.split(/\s+/).length,
        charactersIntroduced: JSON.stringify(chapterResult.charactersIntroduced),
        summaryForNext: chapterResult.summaryForNextChapter,
        status: 'awaiting_approval', // New state for interactive steering
      },
    });

    // Handle Illustrations
    if (isChildrenBook && !isColoringBook) {
      try {
        const imgPromptResult = await askLLMJSON<unknown>(getImagePromptExtractionPrompt(), getImagePromptExtractionUserPrompt(chapterResult.content), 0.3);
        const validatedPrompt = validateOrThrow(ImagePromptSchema, imgPromptResult);
        const illustration = await generateChapterIllustration(bookId, ownerId, chapterIndex, validatedPrompt.prompt, config.illustrationStyle);
        if (illustration.success && illustration.publicUrl) {
          await db.chapter.update({ where: { id: chapter.id }, data: { illustrationUrl: illustration.publicUrl, illustrationPrompt: validatedPrompt.prompt } });
        }
      } catch (e) { console.error('Illustration failed', e); }
    } else if (isColoringBook) {
      try {
        const coloringPage = await generateColoringPage(bookId, ownerId, chapterIndex, chapter.synopsis, coloringTheme);
        if (coloringPage.success && coloringPage.publicUrl) {
          await db.chapter.update({ where: { id: chapter.id }, data: { illustrationUrl: coloringPage.publicUrl } });
        }
      } catch (e) { console.error('Coloring page failed', e); }
    }

    await jobQueue.updateJobStatus(jobId, {
      status: 'completed',
      progressMessage: `Chapter ${chapterIndex + 1} drafted! Please review and approve.`,
      progressPercent: 100
    });

  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error("[Queue] CHAPTER GENERATION FAILED:", errMessage); // <-- ADDED LOGGING HERE
    await db.chapter.update({
      where: { bookId_index: { bookId, index: chapterIndex } },
      data: { status: 'failed' }
    });
    await jobQueue.updateJobStatus(jobId, { status: 'failed', errorMessage: errMessage, progressMessage: `Failed: ${errMessage}` });
    throw error;
  }
}

/**
 * PHASE 3: Final Assembly
 * Completes the book, generates the cover, and charges credits.
 */
export async function finalizeBook(bookId: string, ownerId: string, jobId: string, totalCredits: number): Promise<void> {
  const book = await db.book.findUnique({
    where: { id: bookId },
  });

  if (!book) throw new Error('Book not found');

  try {
    await jobQueue.updateJobStatus(jobId, { progressMessage: 'Finalizing your book...', progressPercent: 10 });

    const targetAudience = book.targetAudience as TargetAudience;
    const genre = book.genre as Genre;
    const isChildrenBook = ['0-5', '6-9', '10-14'].includes(targetAudience);
    const isColoringBook = genre === 'coloring';
    const coloringTheme = book.coloringTheme as ColoringTheme | null;

    // Cover Art
    if (isChildrenBook || isColoringBook || !book.coverImageUrl) {
      await jobQueue.updateJobStatus(jobId, { progressMessage: 'Creating cover art...', progressPercent: 50 });
      const coverResult = await generateBookCover(bookId, ownerId, book.title, genre, targetAudience, coloringTheme);
      if (coverResult.success && coverResult.publicUrl) {
        await db.book.update({ where: { id: bookId }, data: { coverImageUrl: coverResult.publicUrl } });
      }
    }

    await db.book.update({
      where: { id: bookId },
      data: {
        status: 'completed',
        totalCreditsCharged: totalCredits
      }
    });

    await consumeCredits(ownerId, totalCredits, jobId, 'Book generation completed');
    await jobQueue.updateJobStatus(jobId, {
      status: 'completed',
      progressMessage: 'Book completed! Your masterpiece is ready.',
      progressPercent: 100,
      completedAt: new Date()
    });

  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error("[Queue] BOOK FINALIZATION FAILED:", errMessage); // <-- ADDED LOGGING HERE
    await db.book.update({ where: { id: bookId }, data: { status: 'failed' } });
    await refundCredits(jobId, `Finalization failed: ${errMessage}`);
    await jobQueue.updateJobStatus(jobId, { status: 'failed', errorMessage: errMessage, progressMessage: `Failed: ${errMessage}` });
    throw error;
  }
}