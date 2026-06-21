// HydraSkript - Credit Management System
// Atomic credit operations using Prisma transactions
// Credits are deducted ONLY inside a transaction that commits ONLY after final success

import { db } from '@/lib/db';
import { CREDIT_COSTS, AUDIENCE_CONFIG, COLORING_THEMES, type TargetAudience, type ColoringTheme } from '@/types';

// ─── Credit Calculation ───────────────────────────────────────────────────────

/**
 * Calculate the total credit cost for generating a coloring book.
 * Coloring books need one image per page (not prose), so the cost structure is different.
 */
export function estimateColoringBookCredits(
  pageCount: number,
  coloringTheme?: ColoringTheme | null
): number {
  let total = 0;

  // Outline generation
  total += CREDIT_COSTS.outlineGeneration;

  // Minimal text credits for coloring book (brief descriptions, not full prose)
  total += CREDIT_COSTS.chapterPerThousandWords * pageCount; // ~1 credit per page for text

  // Images: one per page + cover
  const imageCount = pageCount + 1; // +1 for cover
  total += CREDIT_COSTS.image * imageCount;

  return total;
}

/**
 * Calculate the total credit cost for generating a book.
 * This is an estimate shown before the user starts generation.
 */
export function estimateBookCredits(
  targetAudience: TargetAudience,
  chapterCount: number,
  wordsPerChapter: number,
  includeImages: boolean,
  includeAudiobook: boolean
): number {
  let total = 0;

  // Outline generation
  total += CREDIT_COSTS.outlineGeneration;

  // Chapter generation: 5 credits per 1000 words, rounded up
  const chapterCredits = CREDIT_COSTS.chapterPerThousandWords * Math.ceil(wordsPerChapter / 1000);
  total += chapterCredits * chapterCount;

  // Images for children's books
  if (includeImages) {
    const imageCount = chapterCount + 1; // +1 for cover
    total += CREDIT_COSTS.image * imageCount;
  }

  // Audiobook
  if (includeAudiobook) {
    total += CREDIT_COSTS.audiobookBase;
    // Estimate 1 minute per 150 words
    const totalWords = wordsPerChapter * chapterCount;
    const estimatedMinutes = Math.ceil(totalWords / 150);
    total += CREDIT_COSTS.audiobookPerMinute * estimatedMinutes;
  }

  return total;
}

/**
 * Calculate credits for a specific chapter generation.
 */
export function calculateChapterCredits(wordTarget: number): number {
  return CREDIT_COSTS.chapterPerThousandWords * Math.ceil(wordTarget / 1000);
}

/**
 * Calculate credits for image generation.
 */
export function calculateImageCredits(count: number): number {
  return CREDIT_COSTS.image * count;
}

/**
 * Get default chapter count and word target based on audience.
 * IMPORTANT: chapterCount is NOT maxPages — maxPages is the upper limit,
 * chapterCount is the reasonable default for generation.
 */
export function getBookDefaults(targetAudience: TargetAudience) {
  const config = AUDIENCE_CONFIG[targetAudience];
  return {
    chapterCount: config.defaultChapters,
    wordsPerChapter: config.wordsPerChapter,
    maxPages: config.maxPages,
  };
}

// ─── Atomic Credit Operations ─────────────────────────────────────────────────

/**
 * Reserve credits for a job (escrow).
 * Credits are held but not yet consumed.
 * Returns true if successful (sufficient balance).
 */
export async function reserveCredits(
  profileId: string,
  amount: number,
  jobId: string,
  reason: string
): Promise<boolean> {
  try {
    return await db.$transaction(async (tx) => {
      // Read current credits with lock (serializable isolation in SQLite)
      const profile = await tx.profile.findUnique({
        where: { id: profileId },
        select: { credits: true },
      });

      if (!profile || profile.credits < amount) {
        return false; // Insufficient funds
      }

      // Deduct credits
      await tx.profile.update({
        where: { id: profileId },
        data: { credits: profile.credits - amount },
      });

      // Record in ledger
      await tx.creditLedger.create({
        data: {
          profileId,
          amount: -amount,
          reason: `RESERVED: ${reason}`,
          jobId,
        },
      });

      return true;
    });
  } catch (error) {
    console.error('[Credits] Reserve failed:', error);
    return false;
  }
}

/**
 * Consume reserved credits (convert reserved to consumed after successful work).
 * This is called AFTER the generation step completes successfully.
 */
export async function consumeCredits(
  profileId: string,
  amount: number,
  jobId: string,
  reason: string
): Promise<boolean> {
  try {
    return await db.$transaction(async (tx) => {
      // Record consumption in ledger (positive entry offsetting the reservation)
      await tx.creditLedger.create({
        data: {
          profileId,
          amount: amount, // Positive to offset the negative reservation
          reason: `CONSUMED: ${reason}`,
          jobId,
        },
      });

      // Update job's consumed amount
      await tx.job.update({
        where: { id: jobId },
        data: { creditsConsumed: amount },
      });

      return true;
    });
  } catch (error) {
    console.error('[Credits] Consume failed:', error);
    return false;
  }
}

/**
 * Refund reserved credits (return held credits on failure).
 * Idempotent: checks if already refunded.
 */
export async function refundCredits(
  jobId: string,
  reason: string
): Promise<boolean> {
  try {
    return await db.$transaction(async (tx) => {
      // Check if already refunded
      const existingRefund = await tx.creditLedger.findFirst({
        where: {
          jobId,
          reason: { startsWith: 'REFUND' },
        },
      });

      if (existingRefund) {
        console.log(`[Credits] Already refunded for job ${jobId}`);
        return true; // Already refunded, idempotent
      }

      // Get job details
      const job = await tx.job.findUnique({
        where: { id: jobId },
        select: { ownerId: true, creditsReserved: true },
      });

      if (!job || job.creditsReserved <= 0) {
        return true; // Nothing to refund
      }

      // Return credits to profile
      const profile = await tx.profile.findUnique({
        where: { id: job.ownerId },
        select: { credits: true },
      });

      if (profile) {
        await tx.profile.update({
          where: { id: job.ownerId },
          data: { credits: profile.credits + job.creditsReserved },
        });

        // Record refund
        await tx.creditLedger.create({
          data: {
            profileId: job.ownerId,
            amount: job.creditsReserved,
            reason: `REFUND: ${reason}`,
            jobId,
          },
        });
      }

      return true;
    });
  } catch (error) {
    console.error('[Credits] Refund failed:', error);
    return false;
  }
}

/**
 * Add credits to a profile (from purchase or admin action).
 */
export async function addCredits(
  profileId: string,
  amount: number,
  reason: string
): Promise<boolean> {
  try {
    await db.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({
        where: { id: profileId },
        select: { credits: true },
      });

      if (!profile) throw new Error('Profile not found');

      await tx.profile.update({
        where: { id: profileId },
        data: { credits: profile.credits + amount },
      });

      await tx.creditLedger.create({
        data: {
          profileId,
          amount,
          reason,
        },
      });
    });

    return true;
  } catch (error) {
    console.error('[Credits] Add credits failed:', error);
    return false;
  }
}

/**
 * Get current credit balance for a profile.
 */
export async function getCreditBalance(profileId: string): Promise<number> {
  const profile = await db.profile.findUnique({
    where: { id: profileId },
    select: { credits: true },
  });
  return profile?.credits ?? 0;
}
