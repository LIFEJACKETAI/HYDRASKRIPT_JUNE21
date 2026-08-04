// HydraSkript - Story Bible helpers
// Shared utilities used by the /api/story-bible/* routes.

import type { StoryBibleEntity } from '@prisma/client';
import { db } from '@/lib/db';

export const STORY_BIBLE_KINDS = [
  'CHARACTER',
  'LOCATION',
  'OBJECT',
  'THEME',
  'HISTORY',
] as const;

export type StoryBibleKind = (typeof STORY_BIBLE_KINDS)[number];

export function isStoryBibleKind(value: string): value is StoryBibleKind {
  return (STORY_BIBLE_KINDS as readonly string[]).includes(value);
}

export function parseTraits(value: string | null | undefined): {
  tags: string[];
  notes: string;
} {
  if (!value) return { tags: [], notes: '' };
  try {
    const parsed = JSON.parse(value);
    return {
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t: unknown) => typeof t === 'string') : [],
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    };
  } catch {
    return { tags: [], notes: '' };
  }
}

export function parseSecrets(value: string | null | undefined): {
  confidential: string;
  isPrivate: boolean;
} {
  if (!value) return { confidential: '', isPrivate: false };
  try {
    const parsed = JSON.parse(value);
    return {
      confidential: typeof parsed.confidential === 'string' ? parsed.confidential : '',
      isPrivate: Boolean(parsed.isPrivate),
    };
  } catch {
    return { confidential: '', isPrivate: false };
  }
}

export interface StoryBibleEntityDTO {
  id: string;
  bookId: string;
  kind: StoryBibleKind;
  name: string;
  role: string;
  summary: string;
  motivation: string;
  description: string;
  physicalTraits: { tags: string[]; notes: string };
  secrets: { confidential: string; isPrivate: boolean };
  portraitUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toDTO(entity: StoryBibleEntity): StoryBibleEntityDTO {
  return {
    id: entity.id,
    bookId: entity.bookId,
    kind: entity.kind as StoryBibleKind,
    name: entity.name,
    role: entity.role,
    summary: entity.summary,
    motivation: entity.motivation,
    description: entity.description,
    physicalTraits: parseTraits(entity.physicalTraits),
    secrets: parseSecrets(entity.secrets),
    portraitUrl: entity.portraitUrl,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export async function assertBookOwnership(bookId: string, ownerId: string) {
  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { id: true, ownerId: true, title: true },
  });
  if (!book) throw new Error('Book not found');
  if (book.ownerId !== ownerId) throw new Error('Forbidden');
  return book;
}
