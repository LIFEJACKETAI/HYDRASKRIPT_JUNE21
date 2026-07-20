// HydraSkript - Zod Schemas for Runtime Validation
// All structured outputs from LLM are validated through these schemas

import { z } from 'zod';

// ─── Outline Schema ───────────────────────────────────────────────────────────

export const OutlineChapterSchema = z.object({
  title: z.string().min(1, 'Chapter title is required'),
  synopsis: z.string().min(10, 'Synopsis must be at least 10 characters'),
  wordTarget: z.number().int().positive().min(50).max(5000),
});

export const BookOutlineSchema = z.object({
  title: z.string().min(1, 'Book title is required'),
  chapters: z.array(OutlineChapterSchema).min(1, 'Must have at least 1 chapter').max(100, 'Maximum 100 chapters'),
});

export type ValidatedOutline = z.infer<typeof BookOutlineSchema>;

// ─── Chapter Generation Schema ────────────────────────────────────────────────

export const ChapterGenerationSchema = z.object({
  content: z.string().min(50, 'Chapter content must be at least 50 characters'),
  charactersIntroduced: z.array(z.string()),
  summaryForNextChapter: z.string().min(10, 'Summary must be at least 10 characters'),
});

export type ValidatedChapter = z.infer<typeof ChapterGenerationSchema>;

// ─── Style Analysis Schema ────────────────────────────────────────────────────

export const StyleAnalysisSchema = z.object({
  systemPrompt: z.string().min(20, 'Style prompt must be at least 20 characters'),
});

export type ValidatedStyleAnalysis = z.infer<typeof StyleAnalysisSchema>;

// ─── Image Prompt Schema ──────────────────────────────────────────────────────

export const ImagePromptSchema = z.object({
  prompt: z.string().min(10, 'Image prompt must be at least 10 characters'),
  subject: z.string().min(3, 'Subject description required'),
});

export type ValidatedImagePrompt = z.infer<typeof ImagePromptSchema>;

// ─── Book Creation Schema ─────────────────────────────────────────────────────

export const CreateBookSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be under 200 characters'),
  genre: z.enum(['fiction', 'non-fiction', 'fantasy', 'sci-fi', 'mystery', 'romance', 'horror', 'children', 'coloring', 'poetry', 'self-help', 'biography']),
  targetAudience: z.enum(['adult', '0-5', '6-9', '10-14']),
  coloringTheme: z.enum(['mandalas', 'undersea-creatures', 'birds', 'animals-of-the-wild', 'famous-landmarks', 'exotic-sports-cars', 'flowers-gardens', 'fantasy-dragons', 'zen-patterns', 'architectural-details', 'butterflies-insects', 'vintage-botanicals']).optional(),
  styleProfileId: z.string().optional(),
  chapterCount: z.number().int().min(1).max(100).optional(),
  adventureType: z.string().optional(),
  characterNames: z.array(z.string().max(50)).max(5).optional(),
});

export type CreateBookInput = z.infer<typeof CreateBookSchema>;

// ─── Style Profile Creation Schema ────────────────────────────────────────────

export const CreateStyleProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be under 100 characters'),
  description: z.string().max(500, 'Description must be under 500 characters').optional(),
  exemplarTexts: z.array(z.string().min(50, 'Each sample must be at least 50 characters')).min(1, 'At least 1 sample required').max(10, 'Maximum 10 samples'),
});

export type CreateStyleProfileInput = z.infer<typeof CreateStyleProfileSchema>;

// ─── Credit Purchase Schema ───────────────────────────────────────────────────

export const CreditPurchaseSchema = z.object({
  pricingKey: z.enum(['starter', 'author', 'publisher', 'studio', 'pack_100', 'pack_500', 'pack_1000']),
});

export type CreditPurchaseInput = z.infer<typeof CreditPurchaseSchema>;

// ─── Job Status Update Schema ─────────────────────────────────────────────────

export const JobStatusUpdateSchema = z.object({
  status: z.enum(['queued', 'active', 'completed', 'failed']),
  progressMessage: z.string().optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
  errorMessage: z.string().optional(),
  result: z.record(z.string(), z.unknown()).optional(),
});

// ─── Validation Helper ────────────────────────────────────────────────────────

export function validateOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Validation error: ${errors}`);
  }
  return result.data;
}
