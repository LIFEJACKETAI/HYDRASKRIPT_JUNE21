import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter })

async function fixDatabase() {
  try {
    console.log('Fixing database schema...')
    
    // Create JobStatus enum type in PostgreSQL
    await db.$executeRaw`
      DO $$ BEGIN
        CREATE TYPE "JobStatus" AS ENUM ('queued', 'active', 'completed', 'failed');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `
    console.log('✅ Created JobStatus enum')

    // Create EditorReviewStatus enum type in PostgreSQL
    await db.$executeRaw`
      DO $$ BEGIN
        CREATE TYPE "EditorReviewStatus" AS ENUM ('queued', 'active', 'completed', 'failed');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `
    console.log('✅ Created EditorReviewStatus enum')

    // Create BookStatus enum type in PostgreSQL — MUST include every status the
    // app writes (schema.prisma), otherwise the USING cast below fails.
    await db.$executeRaw`
      DO $$ BEGIN
        CREATE TYPE "BookStatus" AS ENUM ('draft', 'generating', 'completed', 'failed', 'outlining', 'awaiting_outline_approval', 'writing', 'awaiting_chapter_approval', 'finalizing');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `
    console.log('✅ Created BookStatus enum')

    
    // Create ChapterStatus enum type in PostgreSQL - include all values from database
    await db.$executeRaw`
      DO $$ BEGIN
        CREATE TYPE "ChapterStatus" AS ENUM ('pending', 'writing', 'reviewing', 'completed', 'failed', 'awaiting_approval', 'awaiting_outline_approval', 'awaiting_chapter_approval');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `
    console.log('✅ Created ChapterStatus enum')
    
    // Create JobType enum type in PostgreSQL — MUST include import_manuscript
    // (schema.prisma). A DB patched with an older version of this script is
    // missing it, which made /api/story-bible/import-manuscript fail with
    // "invalid input value for enum JobType".
    await db.$executeRaw`
      DO $$ BEGIN
        CREATE TYPE "JobType" AS ENUM ('write_chapter', 'generate_image', 'generate_audiobook', 'export_pdf', 'generate_outline', 'finalize_book', 'editorial_review', 'import_manuscript');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `
    console.log('✅ Created JobType enum')

    // Idempotent patch for databases where the enum types ALREADY exist but are
    // missing newer values (CREATE TYPE above is skipped by duplicate_object).
    // PG12+ allows ADD VALUE in a transaction as long as the value is not used
    // in that same transaction — Supabase runs PG15, so this is safe.
    await db.$executeRaw`ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'import_manuscript'`
    await db.$executeRaw`ALTER TYPE "BookStatus" ADD VALUE IF NOT EXISTS 'outlining'`
    await db.$executeRaw`ALTER TYPE "BookStatus" ADD VALUE IF NOT EXISTS 'awaiting_outline_approval'`
    await db.$executeRaw`ALTER TYPE "BookStatus" ADD VALUE IF NOT EXISTS 'writing'`
    await db.$executeRaw`ALTER TYPE "BookStatus" ADD VALUE IF NOT EXISTS 'awaiting_chapter_approval'`
    await db.$executeRaw`ALTER TYPE "BookStatus" ADD VALUE IF NOT EXISTS 'finalizing'`
    await db.$executeRaw`ALTER TYPE "ChapterStatus" ADD VALUE IF NOT EXISTS 'awaiting_approval'`
    await db.$executeRaw`ALTER TYPE "ChapterStatus" ADD VALUE IF NOT EXISTS 'awaiting_outline_approval'`
    await db.$executeRaw`ALTER TYPE "ChapterStatus" ADD VALUE IF NOT EXISTS 'awaiting_chapter_approval'`
    console.log('✅ Patched enum values (ADD VALUE IF NOT EXISTS)')

    
    // Fix jobs table - drop default, convert, re-add
    await db.$executeRaw`ALTER TABLE jobs ALTER COLUMN "status" DROP DEFAULT`
    await db.$executeRaw`
      ALTER TABLE jobs 
      ALTER COLUMN "jobType" TYPE "JobType" USING "jobType"::"JobType",
      ALTER COLUMN "status" TYPE "JobStatus" USING "status"::"JobStatus";
    `
    await db.$executeRaw`ALTER TABLE jobs ALTER COLUMN "status" SET DEFAULT 'queued'::"JobStatus"`
    console.log('✅ Converted jobs columns to enum types')
    
    // Fix books table
    await db.$executeRaw`ALTER TABLE books ALTER COLUMN "status" DROP DEFAULT`
    await db.$executeRaw`ALTER TABLE books ALTER COLUMN "status" TYPE "BookStatus" USING "status"::"BookStatus"`
    await db.$executeRaw`ALTER TABLE books ALTER COLUMN "status" SET DEFAULT 'draft'::"BookStatus"`
    console.log('✅ Converted books status to enum')
    
    // Fix chapters table — the ChapterStatus enum now includes every status the
    // app writes (awaiting_approval etc.), so the old destructive UPDATEs that
    // reset awaiting chapters to 'pending' are no longer needed.
    await db.$executeRaw`ALTER TABLE chapters ALTER COLUMN "status" DROP DEFAULT`
    await db.$executeRaw`ALTER TABLE chapters ALTER COLUMN "status" TYPE "ChapterStatus" USING "status"::"ChapterStatus"`
    await db.$executeRaw`ALTER TABLE chapters ALTER COLUMN "status" SET DEFAULT 'pending'::"ChapterStatus"`
    console.log('✅ Converted chapters status to enum')

    
    // Fix editorial_reviews table
    await db.$executeRaw`ALTER TABLE editorial_reviews ALTER COLUMN "status" DROP DEFAULT`
    await db.$executeRaw`ALTER TABLE editorial_reviews ALTER COLUMN "status" TYPE "EditorReviewStatus" USING "status"::"EditorReviewStatus"`
    await db.$executeRaw`ALTER TABLE editorial_reviews ALTER COLUMN "status" SET DEFAULT 'queued'::"EditorReviewStatus"`
    console.log('✅ Converted editorial_reviews status to enum')
    
    console.log('\n✅ Database schema fixed successfully!')
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await db.$disconnect()
  }
}

fixDatabase()