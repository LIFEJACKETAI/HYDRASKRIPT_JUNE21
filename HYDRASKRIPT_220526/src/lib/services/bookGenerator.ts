// HydraSkript - Book Generator Service
// Orchestrates the entire book generation pipeline
// State Machine: INIT -> OUTLINE -> [CHAPTER_1 -> CHAPTER_2 -> ... -> CHAPTER_N] -> ASSEMBLE -> COMPLETE
// Each state transition creates a Job. If any step fails, trigger refund.

import { db } from '@/lib/db';
import { jobQueue } from '@/lib/workers/queue';
import { reserveCredits, consumeCredits, refundCredits, estimateBookCredits, estimateColoringBookCredits, getBookDefaults, calculateChapterCredits, calculateImageCredits } from '@/lib/utils/credits';
import { askLLMJSON } from '@/lib/llm/openrouter';
import { getOutlinePrompt, getOutlineUserPrompt, getChapterWritePrompt, getChapterUserPrompt, getImagePromptExtractionPrompt, getImagePromptExtractionUserPrompt, getChildrensChapterPrompt, getSummaryPrompt, getColoringOutlinePrompt, getColoringOutlineUserPrompt, getColoringChapterPrompt } from '@/lib/llm/prompts';
import { BookOutlineSchema, ChapterGenerationSchema, ImagePromptSchema, validateOrThrow } from '@/lib/llm/schema';
import { generateBookCover, generateChapterIllustration, generateColoringPage } from '@/lib/services/imageService';
import { getStyleSystemPrompt } from '@/lib/services/styleAnalyzer';
import { updateBookStatus, updateChapterStatus } from '@/lib/utils/bookHelpers';
import type { TargetAudience, Genre, ColoringTheme } from '@/types';
import { AUDIENCE_CONFIG, COLORING_THEMES } from '@/types';

// ─── Start Book Generation ────────────────────────────────────────────────────

/**
 * Start the full book generation pipeline.
 * 1. Reserve credits
 * 2. Create a job
 * 3. Generate outline
 * 4. Create chapter records
 * 5. Queue chapter writing jobs
 * 6. Generate cover image
 */
export async function startBookGeneration(
  bookId: string,
  ownerId: string
): Promise<{ jobId: string; estimatedCredits: number } | { error: string }> {
  // Get book details
  const book = await db.book.findUnique({
    where: { id: bookId, ownerId },
    include: { styleProfile: true },
  });

  if (!book) {
    return { error: 'Book not found' };
  }

  if (book.status === 'generating') {
    return { error: 'Book is already being generated' };
  }

  // Calculate estimated credits
  const defaults = getBookDefaults(book.targetAudience as TargetAudience);
  const isChildrenBook = ['0-5', '6-9', '10-14'].includes(book.targetAudience);
  const isColoringBook = book.genre === 'coloring';
  const coloringTheme = book.coloringTheme as ColoringTheme | null;
  
  // Get chapter count from outline or use defaults
  let chapterCount = defaults.chapterCount;
  try {
    const existingOutline = JSON.parse(book.outline || '{}');
    if (existingOutline.requestedChapters) {
      chapterCount = existingOutline.requestedChapters;
    }
  } catch {
    // Use default chapter count
  }
  
  // Use appropriate credit estimation based on book type
  let estimatedCredits: number;
  if (isColoringBook) {
    estimatedCredits = estimateColoringBookCredits(chapterCount, coloringTheme);
  } else {
    estimatedCredits = estimateBookCredits(
      book.targetAudience as TargetAudience,
      defaults.chapterCount,
      defaults.wordsPerChapter,
      isChildrenBook,
      false // No audiobook by default
    );
  }

  // Step 1: Create the job record first (we need the ID for the FK constraint)
  const jobId = await jobQueue.createJob({
    bookId,
    ownerId,
    jobType: 'generate_outline',
    creditsReserved: estimatedCredits,
    stepIndex: 0,
  });

  // Step 2: Reserve credits with the real jobId
  const reserved = await reserveCredits(ownerId, estimatedCredits, jobId, 'Book generation estimate');
  if (!reserved) {
    // Couldn't reserve credits — cancel the job
    await jobQueue.updateJobStatus(jobId, {
      status: 'failed',
      errorMessage: 'Insufficient credits',
      progressMessage: 'Failed: Insufficient credits',
    });
    await db.job.update({ where: { id: jobId }, data: { creditsReserved: 0 } });
    return { error: 'Insufficient credits. Please purchase more credits to continue.' };
  }

  // Step 3: Update book status
  await db.book.update({
    where: { id: bookId },
    data: { status: 'generating', totalCreditsEstimated: estimatedCredits },
  });

  // Step 4: NOW enqueue the job for actual execution
  await jobQueue.startJob(jobId, 'generate_outline', async () => {
    await executeFullGeneration(bookId, ownerId, jobId, estimatedCredits);
  });

  return { jobId, estimatedCredits };
}

// ─── Full Generation Pipeline ─────────────────────────────────────────────────

async function executeFullGeneration(
  bookId: string,
  ownerId: string,
  mainJobId: string,
  totalCredits: number
): Promise<void> {
  const book = await db.book.findUnique({
    where: { id: bookId },
    include: { chapters: { orderBy: { index: 'asc' } } },
  });

  if (!book) throw new Error('Book not found');

  const stylePrompt = await getStyleSystemPrompt(book.styleProfileId);
  const targetAudience = book.targetAudience as TargetAudience;
  const genre = book.genre as Genre;
  const isChildrenBook = ['0-5', '6-9', '10-14'].includes(targetAudience);
  const isColoringBook = genre === 'coloring';
  const config = AUDIENCE_CONFIG[targetAudience];

  try {
    // ─── Step 1: Generate Outline ───────────────────────────────────────────
    await jobQueue.updateJobStatus(mainJobId, {
      progressMessage: 'Generating book outline...',
      progressPercent: 5,
    });

    // Use chapterCount from book's outline (which stores the user's requested count) or default
    let chapterCount = config.defaultChapters;
    try {
      const existingOutline = JSON.parse(book.outline || '{}');
      if (existingOutline.requestedChapters) {
        chapterCount = existingOutline.requestedChapters;
      } else if (existingOutline.chapters && existingOutline.chapters.length > 0) {
        chapterCount = existingOutline.chapters.length;
      }
    } catch {
      // Use default chapter count
    }
    
    // Use specialized coloring book outline prompt if applicable
    const coloringTheme = book.coloringTheme as ColoringTheme | null;
    let outlinePrompt: string;
    let outlineUser: string;
    
    if (isColoringBook && coloringTheme && COLORING_THEMES[coloringTheme]) {
      console.log(`[BookGenerator] Using coloring book outline prompt for theme: ${coloringTheme}`);
      outlinePrompt = getColoringOutlinePrompt(coloringTheme, chapterCount);
      outlineUser = getColoringOutlineUserPrompt(book.title, coloringTheme);
    } else {
      outlinePrompt = getOutlinePrompt(genre, targetAudience, chapterCount, stylePrompt);
      outlineUser = getOutlineUserPrompt(book.title, genre, targetAudience);
    }

    console.log(`[BookGenerator] Calling LLM for outline generation...`);
    const outlineResult = await askLLMJSON<unknown>(outlinePrompt, outlineUser, 0.7);
    console.log(`[BookGenerator] Outline LLM response received`);
    
    const outline = validateOrThrow(BookOutlineSchema, outlineResult);

    // Save outline to book
    await db.book.update({
      where: { id: bookId },
      data: { outline: JSON.stringify(outline) },
    });

    // Create chapter records
    for (let i = 0; i < outline.chapters.length; i++) {
      const ch = outline.chapters[i];
      await db.chapter.upsert({
        where: { bookId_index: { bookId, index: i } },
        create: {
          bookId,
          index: i,
          title: ch.title,
          synopsis: ch.synopsis,
          wordTarget: ch.wordTarget,
          status: 'pending',
          generationJobId: mainJobId,
        },
        update: {
          title: ch.title,
          synopsis: ch.synopsis,
          wordTarget: ch.wordTarget,
          status: 'pending',
          generationJobId: mainJobId,
        },
      });
    }

    await jobQueue.updateJobStatus(mainJobId, {
      progressMessage: 'Outline complete! Starting chapter generation...',
      progressPercent: 10,
    });

    // ─── Step 2: Generate Cover Image ───────────────────────────────────────
    if (isChildrenBook || isColoringBook) {
      await jobQueue.updateJobStatus(mainJobId, {
        progressMessage: 'Creating cover art...',
        progressPercent: 15,
      });

      const coverResult = await generateBookCover(
        bookId, ownerId, book.title, genre, targetAudience, coloringTheme
      );

      if (coverResult.success && coverResult.publicUrl) {
        await db.book.update({
          where: { id: bookId },
          data: { coverImageUrl: coverResult.publicUrl },
        });
      }
    }

    // ─── Step 3: Write Chapters Sequentially ────────────────────────────────
    const chapters = outline.chapters;
    let previousSummary = '';

    for (let i = 0; i < chapters.length; i++) {
      const chapterProgress = 15 + Math.floor((i / chapters.length) * 75);

      await jobQueue.updateJobStatus(mainJobId, {
        progressMessage: `Writing chapter ${i + 1}/${chapters.length}: "${chapters[i].title}"...`,
        progressPercent: chapterProgress,
      });

      // Update chapter status
      await db.chapter.updateMany({
        where: { bookId, index: i },
        data: { status: 'writing' },
      });

      // Check idempotency: has this chapter already been generated?
      const existingChapter = await db.chapter.findFirst({
        where: { bookId, index: i, status: 'completed' },
      });

      if (existingChapter && existingChapter.content) {
        previousSummary = existingChapter.summaryForNext;
        continue; // Skip already-completed chapter
      }

      // Generate chapter content (or coloring page description)
      let fullSystemPrompt: string;
      let chapterUser: string;
      
      if (isColoringBook && coloringTheme && COLORING_THEMES[coloringTheme]) {
        // For coloring books: generate brief page description instead of prose
        fullSystemPrompt = getColoringChapterPrompt(coloringTheme, i, chapters.length);
        chapterUser = `Write a brief, poetic description for the coloring page titled "${chapters[i].title}". Visual subject: ${chapters[i].synopsis}`;
      } else {
        const chapterPrompt = getChapterWritePrompt(
          stylePrompt,
          book.title,
          genre,
          i,
          chapters.length,
          previousSummary
        );

        // Add children's-specific guidance
        const childrensPrompt = isChildrenBook ? getChildrensChapterPrompt(targetAudience) : '';
        fullSystemPrompt = childrensPrompt ? `${childrensPrompt}\n\n${chapterPrompt}` : chapterPrompt;

        chapterUser = getChapterUserPrompt(
          chapters[i].title,
          chapters[i].synopsis,
          chapters[i].wordTarget
        );
      }

      let chapterResult;
      try {
        console.log(`[BookGenerator] Calling LLM for chapter ${i + 1}/${chapters.length}...`);
        const rawResult = await askLLMJSON<unknown>(fullSystemPrompt, chapterUser, 0.7);
        console.log(`[BookGenerator] Chapter ${i + 1} LLM response received`);
        chapterResult = validateOrThrow(ChapterGenerationSchema, rawResult);
      } catch (error) {
        console.error(`[BookGenerator] Chapter ${i + 1} generation failed:`, error);
        await db.chapter.updateMany({
          where: { bookId, index: i },
          data: { status: 'failed' },
        });
        throw error;
      }

      // Calculate word count
      const words = chapterResult.content.split(/\s+/).filter(Boolean).length;

      // Save chapter content
      await db.chapter.updateMany({
        where: { bookId, index: i },
        data: {
          content: chapterResult.content,
          wordCount: words,
          charactersIntroduced: JSON.stringify(chapterResult.charactersIntroduced),
          summaryForNext: chapterResult.summaryForNextChapter,
          status: 'completed',
        },
      });

      previousSummary = chapterResult.summaryForNextChapter;

      // ─── Step 3b: Generate Illustration for Children's Books ──────────
      if (isChildrenBook && !isColoringBook) {
        await jobQueue.updateJobStatus(mainJobId, {
          progressMessage: `Creating illustration for chapter ${i + 1}...`,
          progressPercent: chapterProgress + Math.floor(75 / chapters.length / 2),
        });

        // Extract key visual moment from chapter
        try {
          const imgPromptSystem = getImagePromptExtractionPrompt();
          const imgPromptUser = getImagePromptExtractionUserPrompt(chapterResult.content);
          const imgPromptResult = await askLLMJSON<unknown>(imgPromptSystem, imgPromptUser, 0.3);
          const validatedPrompt = validateOrThrow(ImagePromptSchema, imgPromptResult);

          const illustrationStyle = config.illustrationStyle;
          const illustration = await generateChapterIllustration(
            bookId, ownerId, i, validatedPrompt.prompt, illustrationStyle
          );

          if (illustration.success && illustration.publicUrl) {
            await db.chapter.updateMany({
              where: { bookId, index: i },
              data: {
                illustrationUrl: illustration.publicUrl,
                illustrationPrompt: validatedPrompt.prompt,
              },
            });
          }
        } catch (error) {
          console.error(`[BookGenerator] Illustration for chapter ${i + 1} failed:`, error);
          // Non-critical: continue without illustration
        }
      }

      // ─── Step 3c: Generate Coloring Page ───────────────────────────────
      if (isColoringBook) {
        try {
          // Use the full synopsis as the coloring page subject (it's already a visual description)
          const subject = chapters[i].synopsis;
          const theme = coloringTheme && COLORING_THEMES[coloringTheme] ? coloringTheme : null;
          const coloringPage = await generateColoringPage(bookId, ownerId, i, subject, theme);

          if (coloringPage.success && coloringPage.publicUrl) {
            await db.chapter.updateMany({
              where: { bookId, index: i },
              data: {
                illustrationUrl: coloringPage.publicUrl,
              },
            });
          }
        } catch (error) {
          console.error(`[BookGenerator] Coloring page for chapter ${i + 1} failed:`, error);
        }
      }
    }

    // ─── Step 4: Finalize ───────────────────────────────────────────────────
    await jobQueue.updateJobStatus(mainJobId, {
      progressMessage: 'Finalizing your book...',
      progressPercent: 95,
    });

    // Generate a cover image for adult books if not already done
    if (!isChildrenBook && !book.coverImageUrl) {
      const coverResult = await generateBookCover(bookId, ownerId, book.title, genre, targetAudience);
      if (coverResult.success && coverResult.publicUrl) {
        await db.book.update({
          where: { id: bookId },
          data: { coverImageUrl: coverResult.publicUrl },
        });
      }
    }

    // Update book status to completed
    await db.book.update({
      where: { id: bookId },
      data: { status: 'completed', totalCreditsCharged: totalCredits },
    });

    // Consume credits (convert reserved to consumed)
    await consumeCredits(ownerId, totalCredits, mainJobId, 'Book generation completed');

    await jobQueue.updateJobStatus(mainJobId, {
      status: 'completed',
      progressMessage: 'Book generation completed!',
      progressPercent: 100,
      completedAt: new Date(),
      result: { bookId, chapterCount: chapters.length },
    });

    console.log(`[BookGenerator] Book ${bookId} completed with ${chapters.length} chapters`);

  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error(`[BookGenerator] Generation failed for book ${bookId}:`, errMessage);

    // Update book status to failed
    await db.book.update({
      where: { id: bookId },
      data: { status: 'failed' },
    });

    // Refund credits
    await refundCredits(mainJobId, `Book generation failed: ${errMessage}`);

    // Update job status
    await jobQueue.updateJobStatus(mainJobId, {
      status: 'failed',
      errorMessage: errMessage,
      progressMessage: `Failed: ${errMessage}`,
    });

    throw error;
  }
}
