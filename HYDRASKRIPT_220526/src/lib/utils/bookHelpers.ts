// HydraSkript - Book Helper Utilities
// Common operations for book and chapter management

import { db } from '@/lib/db';
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
 * List all books for a user.
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

  return db.profile.create({
    data: {
      email,
      name: name || email.split('@')[0],
      credits: 100, // Free starter credits
      tier: 'starter',
    },
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
