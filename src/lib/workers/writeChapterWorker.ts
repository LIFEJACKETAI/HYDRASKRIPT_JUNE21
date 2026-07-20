// HydraSkript - Chapter Writing Worker
// Handles the generation of a single chapter with idempotency and continuity

import { db } from '@/lib/db';
import { jobQueue } from '@/lib/workers/queue';
import { askLLMJSON } from '@/lib/llm/openrouter';
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

    // Get summary of previous chapter for continuity
    const prevChapter = await db.chapter.findFirst({
      where: { bookId: book.id, index: { lt: chapter.index } },
      orderBy: { index: 'desc' }
    });
    const previousSummary = prevChapter?.summaryForNext || 'This is the beginning of the story.';

    // characterNames is a Postgres String[] — Prisma always returns it as a JS string[].
    // No JSON.parse needed; that would throw on a real array value.
    const characterNames: string[] = Array.isArray(book.characterNames)
      ? (book.characterNames as string[])
      : [];

    // 3. Prompt Construction
    // Get total chapters from book outline for accurate progress reporting
    let totalChapters = 0;
    try {
      const outlineData = JSON.parse(book.outline || '{}');
      totalChapters = outlineData?.chapters?.length ?? 0;
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
      characterNames.length > 0 ? characterNames : undefined
    );

    const childrensPrompt = ['0-5', '6-9', '10-14'].includes(targetAudience)
      ? getChildrensChapterPrompt(targetAudience)
      : '';

    const fullSystemPrompt = childrensPrompt ? `${childrensPrompt}\n\n${chapterPrompt}` : chapterPrompt;
    const chapterUser = getChapterUserPrompt(chapter.title, chapter.synopsis, chapter.wordTarget);

    // 4. Generation
    const rawResult = await askLLMJSON<unknown>(fullSystemPrompt, chapterUser, 0.7);
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
