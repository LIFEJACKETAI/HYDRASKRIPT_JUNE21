// HydraSkript - Book Helper Utilities
// Common operations for book and chapter management

import { db } from '@/lib/db';
import { FREE_SIGNUP_CREDITS } from '@/lib/utils/credits';
import type { BookStatus, ChapterStatus } from '@/types';

/**
 * Update a book's status.
 */
export async function updateBookStatus(bookId: string, status: BookStatus): Promise<void> {
  await db.book.update({
    where: { id: bookId },
    data: { status },
  });
}

/**
 * Update a chapter's status.
 */
export async function updateChapterStatus(chapterId: string, status: ChapterStatus): Promise<void> {
  await db.chapter.update({
    where: { id: chapterId },
    data: { status },
  });
}

/**
 * A book is exportable when it has chapter prose, or when generation marked
 * it completed (coloring books may have illustrations with empty content).
 */
export function isBookExportable(book: {
  status: string;
  chapters?: { content?: string | null; illustrationUrl?: string | null }[];
}): { ok: true } | { ok: false; error: string } {
  const chapters = book.chapters ?? [];
  const hasProse = chapters.some((c) => (c.content ?? '').trim().length > 0);
  const hasArt = chapters.some((c) => Boolean(c.illustrationUrl));
  if (hasProse || hasArt || book.status === 'completed') return { ok: true };
  return {
    ok: false,
    error: 'This book has no chapter content to export yet. Generate the book or upload a manuscript first.',
  };
}

/**
 * Get a book with all its chapters.
 */
export async function getBookWithChapters(bookId: string, ownerId: string) {
  return db.book.findUnique({
    where: { id: bookId, ownerId },
    include: {
      chapters: {
        orderBy: { index: 'asc' },
      },
      styleProfile: {
        select: { id: true, name: true, systemPrompt: true },
      },
    },
  });
}

/**
 * List all books for a user, including chapter metadata so the dashboard
 * can display titles, statuses, and word counts without a second API call.
 */
export async function listUserBooks(ownerId: string) {
  return db.book.findMany({
    where: { ownerId },
    select: {
      id: true,
      title: true,
      genre: true,
      targetAudience: true,
      status: true,
      coverImageUrl: true,
      totalCreditsEstimated: true,
      totalCreditsCharged: true,
      createdAt: true,
      _count: {
        select: { chapters: true },
      },
      chapters: {
        orderBy: { index: 'asc' },
        select: {
          id: true,
          index: true,
          title: true,
          synopsis: true,
          wordTarget: true,
          content: true,
          wordCount: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Delete a book and all its associated data.
 */
export async function deleteBook(bookId: string, ownerId: string): Promise<boolean> {
  try {
    await db.book.delete({
      where: { id: bookId, ownerId },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get or create a user profile.
 * If the profile doesn't exist, create one with default credits.
 */
export async function getOrCreateProfile(email: string, name?: string) {
  const existing = await db.profile.findUnique({
    where: { email },
  });

  if (existing) return existing;

  return db.$transaction(async (tx) => {
    const profile = await tx.profile.create({
      data: {
        email,
        name: name || email.split('@')[0],
        monthlyCredits: FREE_SIGNUP_CREDITS,
        freeCreditsGranted: true,
        tier: 'free',
      },
    });
    await tx.creditLedger.create({
      data: {
        profileId: profile.id,
        amount: FREE_SIGNUP_CREDITS,
        reason: 'Free tier signup bonus',
      },
    });
    return profile;
  });
}

/**
 * Get total word count for a book.
 */
export async function getBookWordCount(bookId: string): Promise<number> {
  const chapters = await db.chapter.findMany({
    where: { bookId },
    select: { wordCount: true },
  });
  return chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
}
