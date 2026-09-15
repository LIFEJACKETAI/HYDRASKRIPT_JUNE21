-- Add enum values that exist in prisma/schema.prisma but were missing from
-- databases patched by older versions of scripts/fix-enums.ts.
--
-- Most critical: "JobType"."import_manuscript" — without it, Prisma's
-- createJob({ jobType: 'import_manuscript' }) fails with
-- "invalid input value for enum JobType: import_manuscript" and
-- POST /api/story-bible/import-manuscript returns 500.
--
-- Idempotent: ADD VALUE IF NOT EXISTS is safe on PostgreSQL 12+ (Supabase runs 15).

ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'import_manuscript';

ALTER TYPE "BookStatus" ADD VALUE IF NOT EXISTS 'outlining';
ALTER TYPE "BookStatus" ADD VALUE IF NOT EXISTS 'awaiting_outline_approval';
ALTER TYPE "BookStatus" ADD VALUE IF NOT EXISTS 'writing';
ALTER TYPE "BookStatus" ADD VALUE IF NOT EXISTS 'awaiting_chapter_approval';
ALTER TYPE "BookStatus" ADD VALUE IF NOT EXISTS 'finalizing';

ALTER TYPE "ChapterStatus" ADD VALUE IF NOT EXISTS 'awaiting_approval';
ALTER TYPE "ChapterStatus" ADD VALUE IF NOT EXISTS 'awaiting_outline_approval';
ALTER TYPE "ChapterStatus" ADD VALUE IF NOT EXISTS 'awaiting_chapter_approval';
