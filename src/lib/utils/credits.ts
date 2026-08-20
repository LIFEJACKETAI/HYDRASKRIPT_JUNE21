// HydraSkript - Credit Management System
// Multi-wallet credit system: monthlyCredits, purchasedCredits, lifetimeCredits
// Credits consumed in order: monthlyCredits -> lifetimeCredits -> purchasedCredits

import { db } from '@/lib/db';
import { CREDIT_COSTS, AUDIENCE_CONFIG, COLORING_THEMES, type TargetAudience, type ColoringTheme } from '@/types';

// Admin account that gets unlimited free generation (see consumeFromWallets).
const ADMIN_FREE_EMAIL = 'admin@hydraskript.com';

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
 * Calculate audiobook cost based on word count (dynamic pricing).
 * Base fee + per-minute cost.
 */
export function calculateAudiobookCost(wordCount: number): number {
  // Average reading speed: ~150 words per minute
  const estimatedMinutes = Math.ceil(wordCount / 150);
  
  // Base cost + Variable cost per minute
  // Example: 10 credits base + 5 credits per minute
  const cost = 10 + (estimatedMinutes * 5);
  
  return cost;
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

// ─── Multi-Wallet Credit Balance ──────────────────────────────────────────────

/**
 * Get all credit wallets for a profile.
 */
export async function getCreditBalances(profileId: string): Promise<{
  monthlyCredits: number;
  purchasedCredits: number;
  lifetimeCredits: number;
  total: number;
}> {
  const profile = await db.profile.findUnique({
    where: { id: profileId },
    select: {
      monthlyCredits: true,
      purchasedCredits: true,
      lifetimeCredits: true,
      credits: true, // legacy
    },
  });

  if (!profile) {
    return { monthlyCredits: 0, purchasedCredits: 0, lifetimeCredits: 0, total: 0 };
  }

  // For backward compatibility, include legacy credits in total
  const legacyCredits = profile.credits ?? 0;
  
  return {
    monthlyCredits: profile.monthlyCredits ?? 0,
    purchasedCredits: profile.purchasedCredits ?? 0,
    lifetimeCredits: profile.lifetimeCredits ?? 0,
    total: (profile.monthlyCredits ?? 0) + (profile.purchasedCredits ?? 0) + (profile.lifetimeCredits ?? 0) + legacyCredits,
  };
}

/**
 * Get total available credits (for simple display).
 */
export async function getTotalCredits(profileId: string): Promise<number> {
  const balances = await getCreditBalances(profileId);
  return balances.total;
}

/**
 * Check if user has enough total credits.
 */
export async function hasEnoughCredits(profileId: string, amount: number): Promise<boolean> {
  const total = await getTotalCredits(profileId);
  return total >= amount;
}

// ─── Atomic Credit Operations (Multi-Wallet) ──────────────────────────────────

/**
 * Consume credits from wallets in priority order:
 * 1. monthlyCredits (expire monthly)
 * 2. lifetimeCredits (promotional)
 * 3. purchasedCredits (never expire)
 * 4. legacy credits (fallback)
 */
async function consumeFromWallets(
  tx: any,
  profileId: string,
  amount: number,
  reason: string,
  jobId: string
): Promise<{ success: boolean; consumed: { monthly: number; lifetime: number; purchased: number; legacy: number } }> {
  const profile = await tx.profile.findUnique({
    where: { id: profileId },
    select: {
      monthlyCredits: true,
      purchasedCredits: true,
      lifetimeCredits: true,
      credits: true,
      email: true,
    },
  });

  if (!profile) return { success: false, consumed: { monthly: 0, lifetime: 0, purchased: 0, legacy: 0 } };

  // ADMIN BYPASS: Unlimited credits for admin@hydraskript.com
  if (profile.email === ADMIN_FREE_EMAIL) {
    await tx.creditLedger.create({
      data: {
        profileId,
        amount: 0,
        reason: `ADMIN-FREE: ${reason}`,
        jobId,
      },
    });
    return { success: true, consumed: { monthly: 0, lifetime: 0, purchased: 0, legacy: 0 } };
  }

  let remaining = amount;
  const consumed = { monthly: 0, lifetime: 0, purchased: 0, legacy: 0 };

  // 1. Consume from monthlyCredits first
  if (remaining > 0 && (profile.monthlyCredits ?? 0) > 0) {
    const take = Math.min(remaining, profile.monthlyCredits ?? 0);
    await tx.profile.update({
      where: { id: profileId },
      data: { monthlyCredits: { decrement: take } },
    });
    consumed.monthly = take;
    remaining -= take;
  }

  // 2. Consume from lifetimeCredits
  if (remaining > 0 && (profile.lifetimeCredits ?? 0) > 0) {
    const take = Math.min(remaining, profile.lifetimeCredits ?? 0);
    await tx.profile.update({
      where: { id: profileId },
      data: { lifetimeCredits: { decrement: take } },
    });
    consumed.lifetime = take;
    remaining -= take;
  }

  // 3. Consume from purchasedCredits
  if (remaining > 0 && (profile.purchasedCredits ?? 0) > 0) {
    const take = Math.min(remaining, profile.purchasedCredits ?? 0);
    await tx.profile.update({
      where: { id: profileId },
      data: { purchasedCredits: { decrement: take } },
    });
    consumed.purchased = take;
    remaining -= take;
  }

  // 4. Fallback to legacy credits
  if (remaining > 0 && (profile.credits ?? 0) > 0) {
    const take = Math.min(remaining, profile.credits ?? 0);
    await tx.profile.update({
      where: { id: profileId },
      data: { credits: { decrement: take } },
    });
    consumed.legacy = take;
    remaining -= take;
  }

  if (remaining > 0) {
    // Not enough credits - rollback what we consumed
    if (consumed.monthly > 0) {
      await tx.profile.update({ where: { id: profileId }, data: { monthlyCredits: { increment: consumed.monthly } } });
    }
    if (consumed.lifetime > 0) {
      await tx.profile.update({ where: { id: profileId }, data: { lifetimeCredits: { increment: consumed.lifetime } } });
    }
    if (consumed.purchased > 0) {
      await tx.profile.update({ where: { id: profileId }, data: { purchasedCredits: { increment: consumed.purchased } } });
    }
    if (consumed.legacy > 0) {
      await tx.profile.update({ where: { id: profileId }, data: { credits: { increment: consumed.legacy } } });
    }
    return { success: false, consumed: { monthly: 0, lifetime: 0, purchased: 0, legacy: 0 } };
  }

  // Record in ledger
  await tx.creditLedger.create({
    data: {
      profileId,
      amount: -amount,
      reason: `CONSUMED: ${reason}`,
      jobId,
    },
  });

  return { success: true, consumed };
}

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
      // Check total available credits
      const balances = await getCreditBalances(profileId);
      if (balances.total < amount) {
        return false; // Insufficient funds
      }

      // Hold the credits now (escrow): deduct from wallets so the
      // balance visibly decreases as soon as generation starts.
      const result = await consumeFromWallets(tx, profileId, amount, reason, jobId);
      if (!result.success) {
        return false;
      }

      // Record reservation marker so consumeCredits/refundCredits can settle
      await tx.creditLedger.create({
        data: {
          profileId,
          amount: 0,
          reason: `RESERVED: ${reason}`,
          jobId,
        },
      });

      // Update job with reserved amount
      await tx.job.update({
        where: { id: jobId },
        data: { creditsReserved: amount },
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
      const job = await tx.job.findUnique({
        where: { id: jobId },
        select: { creditsReserved: true },
      });

      const reserved = job?.creditsReserved ?? 0;

      if (reserved > 0) {
        // Credits were already deducted at reservation time (escrow).
        // Reconcile the difference between the actual cost and the reserved amount.
        const diff = amount - reserved;

        if (diff > 0) {
          const result = await consumeFromWallets(tx, profileId, diff, `${reason} (adjustment)`, jobId);
          if (!result.success) {
            return false;
          }
        } else if (diff < 0) {
          // Return the over-reserved portion (skipped for the free admin account)
          const profile = await tx.profile.findUnique({
            where: { id: profileId },
            select: { email: true },
          });
          if (profile?.email !== ADMIN_FREE_EMAIL) {
            await tx.profile.update({
              where: { id: profileId },
              data: { monthlyCredits: { increment: -diff } },
            });
            await tx.creditLedger.create({
              data: {
                profileId,
                amount: -diff,
                reason: `REFUND: ${reason} (adjustment)`,
                jobId,
              },
            });
          }
        }

        // Mark the reservation as consumed (prevents a later double-refund)
        await tx.job.update({
          where: { id: jobId },
          data: { creditsConsumed: amount, creditsReserved: 0 },
        });

        return true;
      }

      // No prior reservation: consume directly from wallets
      const result = await consumeFromWallets(tx, profileId, amount, reason, jobId);
      if (!result.success) {
        return false;
      }

      await tx.job.update({
        where: { id: jobId },
        data: { creditsConsumed: amount, creditsReserved: 0 },
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

      // Return credits to profile - add to monthlyCredits (expire monthly) or purchasedCredits
      // For refunds, we add back to the most flexible wallet.
      // The free admin account never had credits deducted, so skip the refund.
      const owner = await tx.profile.findUnique({
        where: { id: job.ownerId },
        select: { email: true },
      });

      if (owner?.email !== ADMIN_FREE_EMAIL) {
        await tx.profile.update({
          where: { id: job.ownerId },
          data: { monthlyCredits: { increment: job.creditsReserved } },
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

      // Reset job reserved amount
      await tx.job.update({
        where: { id: jobId },
        data: { creditsReserved: 0 },
      });

      return true;
    });
  } catch (error) {
    console.error('[Credits] Refund failed:', error);
    return false;
  }
}

/**
 * Refund any outstanding escrow reservation for a book's outline job.
 * Prevents credits from being stranded if a book fails mid-flow
 * (after outline approval but before finalization).
 */
export async function refundOutstandingReservation(bookId: string, reason: string): Promise<boolean> {
  try {
    const outlineJob = await db.job.findFirst({
      where: { bookId, creditsReserved: { gt: 0 } },
      select: { id: true },
    });
    if (!outlineJob) {
      return true;
    }
    return refundCredits(outlineJob.id, reason);
  } catch (error) {
    console.error('[Credits] Refund outstanding reservation failed:', error);
    return false;
  }
}

/**
 * Add credits to a profile (from purchase or admin action).
 * Specify wallet type: 'monthly', 'purchased', 'lifetime', or 'legacy'
 */
export async function addCredits(
  profileId: string,
  amount: number,
  reason: string,
  wallet: 'monthly' | 'purchased' | 'lifetime' | 'legacy' = 'purchased'
): Promise<boolean> {
  try {
    await db.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({
        where: { id: profileId },
        select: { credits: true, monthlyCredits: true, purchasedCredits: true, lifetimeCredits: true },
      });

      if (!profile) throw new Error('Profile not found');

      const walletField = wallet === 'monthly' ? 'monthlyCredits' : 
                         wallet === 'purchased' ? 'purchasedCredits' : 
                         wallet === 'lifetime' ? 'lifetimeCredits' : 'credits';

      await tx.profile.update({
        where: { id: profileId },
        data: { [walletField]: { increment: amount } },
      });

      await tx.creditLedger.create({
        data: {
          profileId,
          amount,
          reason: `${wallet.toUpperCase()}: ${reason}`,
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
 * Grant Founder monthly credits (500 credits).
 * Idempotent: checks if already granted this month.
 */
export async function grantFounderMonthlyCredits(profileId: string): Promise<boolean> {
  try {
    return await db.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({
        where: { id: profileId },
        select: { 
          isLifetime: true, 
          monthlyCreditAllowance: true,
          monthlyCreditsLastGrantedAt: true,
          monthlyCredits: true,
        },
      });

      if (!profile || !profile.isLifetime || (profile.monthlyCreditAllowance ?? 0) <= 0) {
        return false; // Not a Founder or no allowance
      }

      // Check if already granted this month
      const now = new Date();
      if (profile.monthlyCreditsLastGrantedAt) {
        const lastGrant = new Date(profile.monthlyCreditsLastGrantedAt);
        if (lastGrant.getFullYear() === now.getFullYear() && lastGrant.getMonth() === now.getMonth()) {
          console.log(`[Credits] Founder monthly credits already granted this month`);
          return true; // Already granted, idempotent
        }
      }

      const allowance = profile.monthlyCreditAllowance ?? 500;

      // Reset monthly credits to allowance (non-rollover)
      await tx.profile.update({
        where: { id: profileId },
        data: {
          monthlyCredits: allowance,
          monthlyCreditsLastGrantedAt: now,
        },
      });

      // Record in ledger
      await tx.creditLedger.create({
        data: {
          profileId,
          amount: allowance,
          reason: 'Founder monthly credit refresh',
        },
      });

      console.log(`[Credits] Granted ${allowance} Founder monthly credits to ${profileId}`);
      return true;
    });
  } catch (error) {
    console.error('[Credits] Founder monthly grant failed:', error);
    return false;
  }
}

/**
 * Grant free tier signup credits (25 credits one-time).
 */
export async function grantFreeTierCredits(profileId: string): Promise<boolean> {
  try {
    return await db.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({
        where: { id: profileId },
        select: { freeCreditsGranted: true, tier: true },
      });

      if (!profile || profile.freeCreditsGranted || profile.tier !== 'free') {
        return false; // Already granted or not free tier
      }

      // Grant 25 credits to monthlyCredits (expire monthly for free tier)
      await tx.profile.update({
        where: { id: profileId },
        data: { 
          monthlyCredits: 25,
          freeCreditsGranted: true,
        },
      });

      // Record in ledger
      await tx.creditLedger.create({
        data: {
          profileId,
          amount: 25,
          reason: 'Free tier signup bonus',
        },
      });

      return true;
    });
  } catch (error) {
    console.error('[Credits] Free tier grant failed:', error);
    return false;
  }
}

/**
 * Get current credit balance for a profile (legacy - returns total).
 */
export async function getCreditBalance(profileId: string): Promise<number> {
  return getTotalCredits(profileId);
}

// ─── Credit Estimation Helpers ────────────────────────────────────────────────

/**
 * Check if user can afford audiobook generation.
 * Returns cost and whether they have enough credits.
 */
export async function checkAudiobookAffordability(
  profileId: string,
  wordCount: number
): Promise<{ cost: number; canAfford: boolean; balance: number }> {
  const cost = calculateAudiobookCost(wordCount);
  const balance = await getTotalCredits(profileId);
  return {
    cost,
    canAfford: balance >= cost,
    balance,
  };
}