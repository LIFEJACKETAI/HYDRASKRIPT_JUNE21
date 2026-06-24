// HydraSkript - Image Generation Worker
// Handles the generation of book covers and chapter illustrations with tiered fallback

import { db } from '@/lib/db';
import { jobQueue } from '@/lib/workers/queue';
import { generateBookCover, generateChapterIllustration, generateColoringPage } from '@/lib/services/imageService';
import { askLLMJSON } from '@/lib/llm/openrouter';
import { getImagePromptExtractionPrompt, getImagePromptExtractionUserPrompt } from '@/lib/llm/prompts';
import { ImagePromptSchema, validateOrThrow } from '@/lib/llm/schema';
import { AUDIENCE_CONFIG } from '@/types';

export async function generateImageWorker(jobId: string, assetParams: {
  bookId: string,
  ownerId: string,
  type: 'cover' | 'illustration' | 'coloring_page',
  chapterIndex?: number,
  prompt?: string,
  genre?: string,
  targetAudience?: string,
  coloringTheme?: string | null
}) {
  const { bookId, ownerId, type, chapterIndex, prompt, genre, targetAudience, coloringTheme } = assetParams;

  try {
    let result;

    if (type === 'cover') {
      result = await generateBookCover(bookId, ownerId, 'Book Title', genre || 'fiction', targetAudience || 'adult', coloringTheme);
    } else if (type === 'coloring_page') {
      if (chapterIndex === undefined) throw new Error('chapterIndex is required for coloring pages');
      // Find the chapter by its index to get the synopsis
      const chapter = await db.chapter.findFirst({ where: { bookId, index: chapterIndex } });
      const subject = chapter?.synopsis || 'A beautiful scene';
      result = await generateColoringPage(bookId, ownerId, chapterIndex, subject, coloringTheme);
    } else {
      // Illustration
      const targetPrompt = prompt || 'A cinematic scene from the story';
      const style = targetAudience ? AUDIENCE_CONFIG[targetAudience as any]?.illustrationStyle || 'pixar' : 'pixar';
      result = await generateChapterIllustration(bookId, ownerId, chapterIndex || 0, targetPrompt, style);
    }

    if (!result.success) {
      throw new Error(`Image generation failed: ${result.error}`);
    }

    // Update the database to link the image to the asset
    if (type === 'cover') {
      await db.book.update({ where: { id: bookId }, data: { coverImageUrl: result.publicUrl } });
    } else {
      // Find the chapter by index and update its illustrationUrl
      const chapter = await db.chapter.findFirst({ where: { bookId, index: chapterIndex } });
      if (chapter) {
        await db.chapter.update({
          where: { id: chapter.id },
          data: { illustrationUrl: result.publicUrl }
        });
      }
    }

    console.log(`[ImageWorker] Successfully generated ${type} for book ${bookId}`);

  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error(`[ImageWorker] Failed to generate ${type}:`, errMessage);
    throw error;
  }
}
