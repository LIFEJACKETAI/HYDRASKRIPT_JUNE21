// HydraSkript - Chapter Writing Worker
// Handles the generation of a single chapter with idempotency and continuity

import { db } from '@/lib/db';
import { jobQueue } from '@/lib/workers/queue';
import { askLLMJSONWithFallback } from '@/lib/llm/fallback';
import { getChapterWritePrompt, getChapterUserPrompt, getChildrensChapterPrompt } from '@/lib/llm/prompts';
import { ChapterGenerationSchema, validateOrThrow } from '@/lib/llm/schema';
import { getStyleSystemPrompt } from '@/lib/services/styleAnalyzer';
import { TargetAudience, type Genre } from '@/types';

export async function writeChapterWorker(jobId: string, chapterId: string) {
  const chapter = await db.chapter.findUnique({
    where: { id: chapterId },
    include: { book: { include: { styleProfile: true } } }
  });

  if (!chapter) throw new Error('Chapter not found');
  const { book } = chapter;

  // 1. Idempotency Check
  // If the chapter is already completed and the job matches, skip
  if (chapter.status === 'completed' && chapter.generationJobId === jobId) {
    console.log(`[WriteWorker] Chapter ${chapter.index} already completed. Skipping.`);
    return;
  }

  try {
    await jobQueue.updateJobStatus(jobId, {
      progressMessage: `Writing ${chapter.title}...`,
    });

    await db.chapter.update({
      where: { id: chapterId },
      data: { status: 'writing' }
    });

    // 2. Context Gathering
    const stylePrompt = await getStyleSystemPrompt(book.styleProfileId);
    const targetAudience = book.targetAudience as TargetAudience;

    // Get summaries of previous chapters for continuity (last 3, oldest first)
    const prevChapters = await db.chapter.findMany({
      where: { bookId: book.id, index: { lt: chapter.index } },
      orderBy: { index: 'desc' },
      take: 3,
    });
    const previousSummary = prevChapters.length > 0
      ? [...prevChapters].reverse()
          .map((c) => `Ch ${c.index + 1} (${c.title}): ${c.summaryForNext || 'no summary'}`)
          .join('\n')
      : 'This is the beginning of the story.';

    // characterNames is a Postgres String[] — Prisma always returns it as a JS string[].
    // No JSON.parse needed; that would throw on a real array value.
    const characterNames: string[] = Array.isArray(book.characterNames)
      ? (book.characterNames as string[])
      : [];

    // 3. Prompt Construction
    // Get total chapters + full outline from book outline for continuity
    let totalChapters = 0;
    let fullOutline = '';
    try {
      const outlineData = JSON.parse(book.outline || '{}');
      totalChapters = outlineData?.chapters?.length ?? 0;
      if (Array.isArray(outlineData?.chapters)) {
        fullOutline = outlineData.chapters
          .map((c: { title?: string; synopsis?: string }, i: number) => `Ch ${i + 1} "${c.title ?? ''}": ${c.synopsis ?? ''}`)
          .join('\n');
      }
    } catch {}
    if (totalChapters === 0) {
      totalChapters = await db.chapter.count({ where: { bookId: book.id } });
    }

    const chapterPrompt = getChapterWritePrompt(
      stylePrompt,
      book.title,
      book.genre as Genre,
      chapter.index,
      totalChapters,
      previousSummary,
      characterNames.length > 0 ? characterNames : undefined,
      {
        description: (book as { description?: string | null }).description ?? undefined,
        fullOutline: fullOutline || undefined,
        currentSynopsis: `${chapter.title}: ${chapter.synopsis}`,
      }
    );

    const childrensPrompt = ['0-5', '6-9', '10-14'].includes(targetAudience)
      ? getChildrensChapterPrompt(targetAudience)
      : '';

    const fullSystemPrompt = childrensPrompt ? `${childrensPrompt}\n\n${chapterPrompt}` : chapterPrompt;
    const chapterUser = getChapterUserPrompt(chapter.title, chapter.synopsis, chapter.wordTarget);

    // 4. Generation
    const rawResult = await askLLMJSONWithFallback<unknown>(fullSystemPrompt, chapterUser, 0.7);
    const chapterResult = validateOrThrow(ChapterGenerationSchema, rawResult);

    // 5. Persistence
    await db.chapter.update({
      where: { id: chapterId },
      data: {
        content: chapterResult.content,
        wordCount: chapterResult.content.split(/\s+/).length,
        charactersIntroduced: JSON.stringify(chapterResult.charactersIntroduced),
        summaryForNext: chapterResult.summaryForNextChapter,
        status: 'completed',
      },
    });

    console.log(`[WriteWorker] Successfully wrote chapter ${chapter.index}`);

    // 6. Chain to next pending chapter or finalize.
    // NOTE: chaining is driven by the job queue (the /api/queue/pump in
    // serverless). We only ENQUEUE the next job; we never auto-approve. In
    // interactive mode the chapter must stop at awaiting_approval — creating a
    // follow-up job here previously caused chapters to barrel ahead without
    // the user reviewing, which also contributed to off-outline drift.
    const nextPendingChapter = await db.chapter.findFirst({
      where: { bookId: book.id, status: 'pending' },
      orderBy: { index: 'asc' },
    });

    if (nextPendingChapter) {
      await jobQueue.createJob({
        bookId: book.id,
        ownerId: book.ownerId,
        jobType: 'write_chapter',
        creditsReserved: 0,
        stepIndex: nextPendingChapter.index,
      });
      console.log(`[WriteWorker] Enqueued next pending chapter ${nextPendingChapter.index}`);
    } else {
      const bookWithCredits = await db.book.findUnique({ where: { id: book.id } });
      const totalCredits = bookWithCredits?.totalCreditsEstimated || 0;

      await jobQueue.createJob({
        bookId: book.id,
        ownerId: book.ownerId,
        jobType: 'finalize_book',
        creditsReserved: 0,
        creditsConsumed: totalCredits,
      });

      await db.book.update({ where: { id: book.id }, data: { status: 'finalizing' } });

      console.log(`[WriteWorker] All chapters enqueued for finalization.`);
    }

  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error(`[WriteWorker] Failed to write chapter ${chapterId}:`, errMessage);

    await db.chapter.update({
      where: { id: chapterId },
      data: { status: 'failed' }
    });

    throw error;
  }
}
