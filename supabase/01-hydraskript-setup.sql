-- HYDRASKRIPT: COMPLETE SUPABASE APPLICATION SETUP
-- Run this ENTIRE file in the correct Supabase project's SQL Editor as postgres.
-- Source of truth: prisma/schema.prisma (13 tables, 5 enum types).
-- Run 00-preflight.sql first and compare the project with Vercel's environment.
--
-- Creates app tables INSIDE Supabase's existing postgres database. It does NOT
-- create a second database, auth users, passwords, admin accounts, or credits.
-- No existing rows are deleted/overwritten; an incompatible existing schema
-- causes an exception and the transaction is rolled back. A completed setup
-- can be rerun. The known six missing nullable Job telemetry columns are added.
--
-- SECURITY: app tables are private to the server (RLS, no browser-role grants).
-- The NEW hydraskript-assets bucket is PUBLIC because the app uses public URLs.
-- Do not place sensitive/private material in that bucket. An existing PRIVATE
-- bucket is never made public by this script; that condition aborts the setup.
-- Supabase manages auth/storage schemas. We do not recreate their tables.
-- If ANY error is reported, do not treat the setup as complete; ROLLBACK if the
-- SQL Editor retains the failed transaction. Do not reset/drop your database.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

-- Require the managed services and roles of a real Supabase project.
DO $supabase_check$
BEGIN
  IF to_regclass('auth.users') IS NULL OR to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'Supabase auth/storage tables are missing. Run this in the intended Supabase project, not an unrelated PostgreSQL database.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'Supabase API roles are missing. Check that you opened the correct Supabase project.';
  END IF;
END;
$supabase_check$;

CREATE SCHEMA IF NOT EXISTS public;

-- 1. Enum types. Preserve existing values; never drop/replace a used type.
-- Existing enums missing required labels need a separate reviewed migration.

DO $enum$
BEGIN
  IF to_regtype('public."JobType"') IS NULL THEN
    CREATE TYPE public."JobType" AS ENUM ('write_chapter', 'generate_image', 'generate_audiobook', 'export_pdf', 'generate_outline', 'finalize_book', 'editorial_review');
  ELSIF (SELECT typtype FROM pg_type WHERE oid = to_regtype('public."JobType"')) <> 'e'
     OR EXISTS (
       SELECT unnest(ARRAY['write_chapter', 'generate_image', 'generate_audiobook', 'export_pdf', 'generate_outline', 'finalize_book', 'editorial_review']::text[])
       EXCEPT SELECT enumlabel::text FROM pg_enum WHERE enumtypid = to_regtype('public."JobType"')
     ) THEN
    RAISE EXCEPTION 'Existing public.JobType is not the required enum or is missing labels. Review its migration; this setup does not replace existing types.';
  END IF;
END;
$enum$;

DO $enum$
BEGIN
  IF to_regtype('public."JobStatus"') IS NULL THEN
    CREATE TYPE public."JobStatus" AS ENUM ('queued', 'active', 'completed', 'failed');
  ELSIF (SELECT typtype FROM pg_type WHERE oid = to_regtype('public."JobStatus"')) <> 'e'
     OR EXISTS (
       SELECT unnest(ARRAY['queued', 'active', 'completed', 'failed']::text[])
       EXCEPT SELECT enumlabel::text FROM pg_enum WHERE enumtypid = to_regtype('public."JobStatus"')
     ) THEN
    RAISE EXCEPTION 'Existing public.JobStatus is not the required enum or is missing labels. Review its migration; this setup does not replace existing types.';
  END IF;
END;
$enum$;

DO $enum$
BEGIN
  IF to_regtype('public."BookStatus"') IS NULL THEN
    CREATE TYPE public."BookStatus" AS ENUM ('draft', 'generating', 'completed', 'failed', 'outlining', 'awaiting_outline_approval', 'writing', 'awaiting_chapter_approval', 'finalizing');
  ELSIF (SELECT typtype FROM pg_type WHERE oid = to_regtype('public."BookStatus"')) <> 'e'
     OR EXISTS (
       SELECT unnest(ARRAY['draft', 'generating', 'completed', 'failed', 'outlining', 'awaiting_outline_approval', 'writing', 'awaiting_chapter_approval', 'finalizing']::text[])
       EXCEPT SELECT enumlabel::text FROM pg_enum WHERE enumtypid = to_regtype('public."BookStatus"')
     ) THEN
    RAISE EXCEPTION 'Existing public.BookStatus is not the required enum or is missing labels. Review its migration; this setup does not replace existing types.';
  END IF;
END;
$enum$;

DO $enum$
BEGIN
  IF to_regtype('public."ChapterStatus"') IS NULL THEN
    CREATE TYPE public."ChapterStatus" AS ENUM ('pending', 'writing', 'reviewing', 'awaiting_approval', 'completed', 'failed');
  ELSIF (SELECT typtype FROM pg_type WHERE oid = to_regtype('public."ChapterStatus"')) <> 'e'
     OR EXISTS (
       SELECT unnest(ARRAY['pending', 'writing', 'reviewing', 'awaiting_approval', 'completed', 'failed']::text[])
       EXCEPT SELECT enumlabel::text FROM pg_enum WHERE enumtypid = to_regtype('public."ChapterStatus"')
     ) THEN
    RAISE EXCEPTION 'Existing public.ChapterStatus is not the required enum or is missing labels. Review its migration; this setup does not replace existing types.';
  END IF;
END;
$enum$;

DO $enum$
BEGIN
  IF to_regtype('public."EditorReviewStatus"') IS NULL THEN
    CREATE TYPE public."EditorReviewStatus" AS ENUM ('queued', 'active', 'completed', 'failed');
  ELSIF (SELECT typtype FROM pg_type WHERE oid = to_regtype('public."EditorReviewStatus"')) <> 'e'
     OR EXISTS (
       SELECT unnest(ARRAY['queued', 'active', 'completed', 'failed']::text[])
       EXCEPT SELECT enumlabel::text FROM pg_enum WHERE enumtypid = to_regtype('public."EditorReviewStatus"')
     ) THEN
    RAISE EXCEPTION 'Existing public.EditorReviewStatus is not the required enum or is missing labels. Review its migration; this setup does not replace existing types.';
  END IF;
END;
$enum$;

-- 2. All application tables. No seeding or modification of existing rows.

CREATE TABLE IF NOT EXISTS public."profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Anonymous Author',
    "credits" INTEGER NOT NULL DEFAULT 0,
    "monthlyCredits" INTEGER NOT NULL DEFAULT 0,
    "purchasedCredits" INTEGER NOT NULL DEFAULT 0,
    "lifetimeCredits" INTEGER NOT NULL DEFAULT 0,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "isLifetime" BOOLEAN NOT NULL DEFAULT FALSE,
    "founderNumber" INTEGER,
    "founderBadge" BOOLEAN NOT NULL DEFAULT FALSE,
    "monthlyCreditAllowance" INTEGER NOT NULL DEFAULT 0,
    "monthlyCreditsLastGrantedAt" TIMESTAMP(3),
    "audiobookEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
    "isAdmin" BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'inactive',
    "currentPeriodEnd" TIMESTAMP(3),
    "freeCreditsGranted" BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."style_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "exemplarTexts" TEXT NOT NULL DEFAULT '[]',
    "embedding" TEXT NOT NULL DEFAULT '[]',
    "systemPrompt" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "style_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."books" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "genre" TEXT NOT NULL DEFAULT 'fiction',
    "targetAudience" TEXT NOT NULL DEFAULT 'adult',
    "maxPages" INTEGER NOT NULL DEFAULT 600,
    "styleProfileId" UUID,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "totalCreditsEstimated" INTEGER NOT NULL DEFAULT 0,
    "totalCreditsCharged" INTEGER NOT NULL DEFAULT 0,
    "visualIdentityUrl" TEXT,
    "coloringTheme" TEXT,
    "adventureType" TEXT,
    "chapterCount" INTEGER,
    "characterNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outline" TEXT NOT NULL DEFAULT '{}',
    "coverImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."chapters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bookId" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "synopsis" TEXT NOT NULL DEFAULT '',
    "wordTarget" INTEGER NOT NULL DEFAULT 1500,
    "content" TEXT NOT NULL DEFAULT '',
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvalStatus" TEXT NOT NULL DEFAULT 'pending',
    "generationJobId" TEXT,
    "charactersIntroduced" TEXT NOT NULL DEFAULT '[]',
    "summaryForNext" TEXT NOT NULL DEFAULT '',
    "illustrationUrl" TEXT,
    "illustrationPrompt" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."story_bible_entities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "motivation" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "physicalTraits" TEXT NOT NULL DEFAULT '{}',
    "secrets" TEXT NOT NULL DEFAULT '{}',
    "portraitUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "story_bible_entities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."media_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "bookId" UUID,
    "assetType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "paymentSource" TEXT DEFAULT 'subscription_allowance',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bookId" UUID,
    "ownerId" UUID NOT NULL,
    "jobType" public."JobType" NOT NULL,
    "status" public."JobStatus" NOT NULL DEFAULT 'queued',
    "progressMessage" TEXT NOT NULL DEFAULT 'Queued...',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "creditsReserved" INTEGER NOT NULL DEFAULT 0,
    "creditsConsumed" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostCents" INTEGER,
    "actualCostCents" INTEGER,
    "provider" TEXT,
    "modelName" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "errorMessage" TEXT,
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "result" TEXT NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."credit_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profileId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "jobId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profileId" UUID NOT NULL,
    "pricingKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stripeSessionId" TEXT,
    "stripeInvoiceId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripeCustomerId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "creditsGranted" INTEGER NOT NULL DEFAULT 0,
    "tierApplied" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."founder_sales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profileId" UUID NOT NULL,
    "founderNumber" INTEGER NOT NULL,
    "pricePaidCents" INTEGER NOT NULL,
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "founder_sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."editorial_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "bookId" UUID,
    "jobId" UUID,
    "scope" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "textLength" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "sourceText" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "editorial_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."editorial_findings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reviewId" UUID NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quote" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "bookTitle" TEXT NOT NULL DEFAULT '',
    "suggestion" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "editorial_findings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."book_listings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "format" TEXT NOT NULL DEFAULT 'ebook',
    "fileName" TEXT,
    "fileUrl" TEXT,
    "coverUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "book_listings_pkey" PRIMARY KEY ("id")
);

-- Also repair the confirmed older Job schema, without touching existing data.
ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS "estimatedCostCents" INTEGER,
    ADD COLUMN IF NOT EXISTS "actualCostCents" INTEGER,
    ADD COLUMN IF NOT EXISTS "provider" TEXT,
    ADD COLUMN IF NOT EXISTS "modelName" TEXT,
    ADD COLUMN IF NOT EXISTS "tokensIn" INTEGER,
    ADD COLUMN IF NOT EXISTS "tokensOut" INTEGER;

-- 3. Do not silently accept conflicting/partial pre-existing tables. Report all
-- missing/incompatible columns together, before changing grants or committing.
DO $columns$
DECLARE problems text;
BEGIN
  WITH expected(table_name, column_name, sql_type, required) AS (VALUES
    ('profiles', 'id', 'UUID', true),
    ('profiles', 'email', 'TEXT', true),
    ('profiles', 'name', 'TEXT', true),
    ('profiles', 'credits', 'INTEGER', true),
    ('profiles', 'monthlyCredits', 'INTEGER', true),
    ('profiles', 'purchasedCredits', 'INTEGER', true),
    ('profiles', 'lifetimeCredits', 'INTEGER', true),
    ('profiles', 'tier', 'TEXT', true),
    ('profiles', 'isLifetime', 'BOOLEAN', true),
    ('profiles', 'founderNumber', 'INTEGER', false),
    ('profiles', 'founderBadge', 'BOOLEAN', true),
    ('profiles', 'monthlyCreditAllowance', 'INTEGER', true),
    ('profiles', 'monthlyCreditsLastGrantedAt', 'timestamp without time zone', false),
    ('profiles', 'audiobookEnabled', 'BOOLEAN', true),
    ('profiles', 'isAdmin', 'BOOLEAN', true),
    ('profiles', 'createdAt', 'timestamp without time zone', true),
    ('profiles', 'updatedAt', 'timestamp without time zone', true),
    ('profiles', 'stripeCustomerId', 'TEXT', false),
    ('profiles', 'stripeSubscriptionId', 'TEXT', false),
    ('profiles', 'subscriptionStatus', 'TEXT', true),
    ('profiles', 'currentPeriodEnd', 'timestamp without time zone', false),
    ('profiles', 'freeCreditsGranted', 'BOOLEAN', true),
    ('style_profiles', 'id', 'UUID', true),
    ('style_profiles', 'ownerId', 'UUID', true),
    ('style_profiles', 'name', 'TEXT', true),
    ('style_profiles', 'description', 'TEXT', true),
    ('style_profiles', 'exemplarTexts', 'TEXT', true),
    ('style_profiles', 'embedding', 'TEXT', true),
    ('style_profiles', 'systemPrompt', 'TEXT', true),
    ('style_profiles', 'createdAt', 'timestamp without time zone', true),
    ('style_profiles', 'updatedAt', 'timestamp without time zone', true),
    ('books', 'id', 'UUID', true),
    ('books', 'ownerId', 'UUID', true),
    ('books', 'title', 'TEXT', true),
    ('books', 'description', 'TEXT', false),
    ('books', 'genre', 'TEXT', true),
    ('books', 'targetAudience', 'TEXT', true),
    ('books', 'maxPages', 'INTEGER', true),
    ('books', 'styleProfileId', 'UUID', false),
    ('books', 'status', 'TEXT', true),
    ('books', 'totalCreditsEstimated', 'INTEGER', true),
    ('books', 'totalCreditsCharged', 'INTEGER', true),
    ('books', 'visualIdentityUrl', 'TEXT', false),
    ('books', 'coloringTheme', 'TEXT', false),
    ('books', 'adventureType', 'TEXT', false),
    ('books', 'chapterCount', 'INTEGER', false),
    ('books', 'characterNames', 'TEXT[]', false),
    ('books', 'outline', 'TEXT', true),
    ('books', 'coverImageUrl', 'TEXT', false),
    ('books', 'createdAt', 'timestamp without time zone', true),
    ('books', 'updatedAt', 'timestamp without time zone', true),
    ('chapters', 'id', 'UUID', true),
    ('chapters', 'bookId', 'UUID', true),
    ('chapters', 'index', 'INTEGER', true),
    ('chapters', 'title', 'TEXT', true),
    ('chapters', 'synopsis', 'TEXT', true),
    ('chapters', 'wordTarget', 'INTEGER', true),
    ('chapters', 'content', 'TEXT', true),
    ('chapters', 'wordCount', 'INTEGER', true),
    ('chapters', 'status', 'TEXT', true),
    ('chapters', 'approvalStatus', 'TEXT', true),
    ('chapters', 'generationJobId', 'TEXT', false),
    ('chapters', 'charactersIntroduced', 'TEXT', true),
    ('chapters', 'summaryForNext', 'TEXT', true),
    ('chapters', 'illustrationUrl', 'TEXT', false),
    ('chapters', 'illustrationPrompt', 'TEXT', true),
    ('chapters', 'createdAt', 'timestamp without time zone', true),
    ('chapters', 'updatedAt', 'timestamp without time zone', true),
    ('story_bible_entities', 'id', 'UUID', true),
    ('story_bible_entities', 'ownerId', 'UUID', true),
    ('story_bible_entities', 'bookId', 'UUID', true),
    ('story_bible_entities', 'kind', 'TEXT', true),
    ('story_bible_entities', 'name', 'TEXT', true),
    ('story_bible_entities', 'role', 'TEXT', true),
    ('story_bible_entities', 'summary', 'TEXT', true),
    ('story_bible_entities', 'motivation', 'TEXT', true),
    ('story_bible_entities', 'description', 'TEXT', true),
    ('story_bible_entities', 'physicalTraits', 'TEXT', true),
    ('story_bible_entities', 'secrets', 'TEXT', true),
    ('story_bible_entities', 'portraitUrl', 'TEXT', false),
    ('story_bible_entities', 'createdAt', 'timestamp without time zone', true),
    ('story_bible_entities', 'updatedAt', 'timestamp without time zone', true),
    ('media_assets', 'id', 'UUID', true),
    ('media_assets', 'ownerId', 'UUID', true),
    ('media_assets', 'bookId', 'UUID', false),
    ('media_assets', 'assetType', 'TEXT', true),
    ('media_assets', 'storagePath', 'TEXT', true),
    ('media_assets', 'publicUrl', 'TEXT', true),
    ('media_assets', 'metadata', 'TEXT', true),
    ('media_assets', 'paymentSource', 'TEXT', false),
    ('media_assets', 'createdAt', 'timestamp without time zone', true),
    ('jobs', 'id', 'UUID', true),
    ('jobs', 'bookId', 'UUID', false),
    ('jobs', 'ownerId', 'UUID', true),
    ('jobs', 'jobType', 'public."JobType"', true),
    ('jobs', 'status', 'public."JobStatus"', true),
    ('jobs', 'progressMessage', 'TEXT', true),
    ('jobs', 'progressPercent', 'INTEGER', true),
    ('jobs', 'creditsReserved', 'INTEGER', true),
    ('jobs', 'creditsConsumed', 'INTEGER', true),
    ('jobs', 'estimatedCostCents', 'INTEGER', false),
    ('jobs', 'actualCostCents', 'INTEGER', false),
    ('jobs', 'provider', 'TEXT', false),
    ('jobs', 'modelName', 'TEXT', false),
    ('jobs', 'tokensIn', 'INTEGER', false),
    ('jobs', 'tokensOut', 'INTEGER', false),
    ('jobs', 'errorMessage', 'TEXT', false),
    ('jobs', 'stepIndex', 'INTEGER', true),
    ('jobs', 'retryCount', 'INTEGER', true),
    ('jobs', 'maxRetries', 'INTEGER', true),
    ('jobs', 'leaseExpiresAt', 'timestamp without time zone', false),
    ('jobs', 'lastHeartbeatAt', 'timestamp without time zone', false),
    ('jobs', 'result', 'TEXT', true),
    ('jobs', 'startedAt', 'timestamp without time zone', false),
    ('jobs', 'completedAt', 'timestamp without time zone', false),
    ('jobs', 'createdAt', 'timestamp without time zone', true),
    ('credit_ledger', 'id', 'UUID', true),
    ('credit_ledger', 'profileId', 'UUID', true),
    ('credit_ledger', 'amount', 'INTEGER', true),
    ('credit_ledger', 'reason', 'TEXT', true),
    ('credit_ledger', 'jobId', 'UUID', false),
    ('credit_ledger', 'createdAt', 'timestamp without time zone', true),
    ('payments', 'id', 'UUID', true),
    ('payments', 'profileId', 'UUID', true),
    ('payments', 'pricingKey', 'TEXT', true),
    ('payments', 'provider', 'TEXT', true),
    ('payments', 'mode', 'TEXT', true),
    ('payments', 'status', 'TEXT', true),
    ('payments', 'stripeSessionId', 'TEXT', false),
    ('payments', 'stripeInvoiceId', 'TEXT', false),
    ('payments', 'stripeSubscriptionId', 'TEXT', false),
    ('payments', 'stripeCustomerId', 'TEXT', false),
    ('payments', 'amountCents', 'INTEGER', true),
    ('payments', 'currency', 'TEXT', true),
    ('payments', 'creditsGranted', 'INTEGER', true),
    ('payments', 'tierApplied', 'TEXT', false),
    ('payments', 'fulfilledAt', 'timestamp without time zone', false),
    ('payments', 'createdAt', 'timestamp without time zone', true),
    ('payments', 'updatedAt', 'timestamp without time zone', true),
    ('founder_sales', 'id', 'UUID', true),
    ('founder_sales', 'profileId', 'UUID', true),
    ('founder_sales', 'founderNumber', 'INTEGER', true),
    ('founder_sales', 'pricePaidCents', 'INTEGER', true),
    ('founder_sales', 'stripeCheckoutSessionId', 'TEXT', true),
    ('founder_sales', 'stripePaymentIntentId', 'TEXT', false),
    ('founder_sales', 'createdAt', 'timestamp without time zone', true),
    ('editorial_reviews', 'id', 'UUID', true),
    ('editorial_reviews', 'ownerId', 'UUID', true),
    ('editorial_reviews', 'bookId', 'UUID', false),
    ('editorial_reviews', 'jobId', 'UUID', false),
    ('editorial_reviews', 'scope', 'TEXT', true),
    ('editorial_reviews', 'sourceLabel', 'TEXT', true),
    ('editorial_reviews', 'status', 'TEXT', true),
    ('editorial_reviews', 'textLength', 'INTEGER', true),
    ('editorial_reviews', 'errorMessage', 'TEXT', false),
    ('editorial_reviews', 'sourceText', 'TEXT', false),
    ('editorial_reviews', 'completedAt', 'timestamp without time zone', false),
    ('editorial_reviews', 'createdAt', 'timestamp without time zone', true),
    ('editorial_reviews', 'updatedAt', 'timestamp without time zone', true),
    ('editorial_findings', 'id', 'UUID', true),
    ('editorial_findings', 'reviewId', 'UUID', true),
    ('editorial_findings', 'severity', 'TEXT', true),
    ('editorial_findings', 'category', 'TEXT', true),
    ('editorial_findings', 'title', 'TEXT', true),
    ('editorial_findings', 'description', 'TEXT', true),
    ('editorial_findings', 'quote', 'TEXT', true),
    ('editorial_findings', 'location', 'TEXT', true),
    ('editorial_findings', 'bookTitle', 'TEXT', true),
    ('editorial_findings', 'suggestion', 'TEXT', true),
    ('editorial_findings', 'status', 'TEXT', true),
    ('editorial_findings', 'createdAt', 'timestamp without time zone', true),
    ('book_listings', 'id', 'UUID', true),
    ('book_listings', 'ownerId', 'UUID', true),
    ('book_listings', 'title', 'TEXT', true),
    ('book_listings', 'author', 'TEXT', true),
    ('book_listings', 'description', 'TEXT', true),
    ('book_listings', 'price', 'DOUBLE PRECISION', true),
    ('book_listings', 'format', 'TEXT', true),
    ('book_listings', 'fileName', 'TEXT', false),
    ('book_listings', 'fileUrl', 'TEXT', false),
    ('book_listings', 'coverUrl', 'TEXT', false),
    ('book_listings', 'status', 'TEXT', true),
    ('book_listings', 'createdAt', 'timestamp without time zone', true),
    ('book_listings', 'updatedAt', 'timestamp without time zone', true)
  )
  SELECT string_agg(format('%I.%I (expected %s%s)', e.table_name, e.column_name,
      e.sql_type, CASE WHEN e.required THEN ' NOT NULL' ELSE ' nullable' END), ', ' ORDER BY e.table_name, e.column_name)
    INTO problems
  FROM expected e
  LEFT JOIN pg_attribute a
    ON a.attrelid = to_regclass(format('public.%I', e.table_name))
   AND a.attname = e.column_name AND a.attnum > 0 AND NOT a.attisdropped
  WHERE a.attname IS NULL OR a.atttypid <> to_regtype(e.sql_type)
     OR a.attnotnull <> e.required;
  IF problems IS NOT NULL THEN
    RAISE EXCEPTION 'Existing schema needs a reviewed migration, not a reset. Incompatible/missing columns: %', problems;
  END IF;
END;
$columns$;

-- Check existing primary keys as CREATE TABLE IF NOT EXISTS does not repair them.
DO $primary_keys$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['profiles', 'style_profiles', 'books', 'chapters', 'story_bible_entities', 'media_assets', 'jobs', 'credit_ledger', 'payments', 'founder_sales', 'editorial_reviews', 'editorial_findings', 'book_listings']::text[]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'id'
      WHERE c.conrelid = to_regclass(format('public.%I', table_name))
        AND c.contype = 'p' AND c.conkey = ARRAY[a.attnum]::smallint[]
    ) THEN
      RAISE EXCEPTION 'Existing public.% lacks the expected primary key on id. No records have been rewritten.', table_name;
    END IF;
  END LOOP;
END;
$primary_keys$;

-- 4. Uniqueness and lookup indexes. Duplicates in existing data fail safely.

CREATE UNIQUE INDEX IF NOT EXISTS "profiles_email_key" ON public."profiles" ("email");
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_founderNumber_key" ON public."profiles" ("founderNumber");
CREATE INDEX IF NOT EXISTS "books_ownerId_idx" ON public."books" ("ownerId");
CREATE UNIQUE INDEX IF NOT EXISTS "chapters_bookId_index_key" ON public."chapters" ("bookId", "index");
CREATE INDEX IF NOT EXISTS "story_bible_entities_bookId_kind_idx" ON public."story_bible_entities" ("bookId", "kind");
CREATE INDEX IF NOT EXISTS "story_bible_entities_ownerId_idx" ON public."story_bible_entities" ("ownerId");
CREATE INDEX IF NOT EXISTS "media_assets_bookId_idx" ON public."media_assets" ("bookId");
CREATE INDEX IF NOT EXISTS "media_assets_ownerId_idx" ON public."media_assets" ("ownerId");
CREATE INDEX IF NOT EXISTS "media_assets_assetType_idx" ON public."media_assets" ("assetType");
CREATE INDEX IF NOT EXISTS "jobs_status_leaseExpiresAt_idx" ON public."jobs" ("status", "leaseExpiresAt");
CREATE INDEX IF NOT EXISTS "jobs_ownerId_idx" ON public."jobs" ("ownerId");
CREATE INDEX IF NOT EXISTS "jobs_bookId_idx" ON public."jobs" ("bookId");
CREATE INDEX IF NOT EXISTS "credit_ledger_profileId_idx" ON public."credit_ledger" ("profileId");
CREATE INDEX IF NOT EXISTS "credit_ledger_jobId_idx" ON public."credit_ledger" ("jobId");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_stripeSessionId_key" ON public."payments" ("stripeSessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_stripeInvoiceId_key" ON public."payments" ("stripeInvoiceId");
CREATE INDEX IF NOT EXISTS "payments_profileId_createdAt_idx" ON public."payments" ("profileId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "founder_sales_profileId_key" ON public."founder_sales" ("profileId");
CREATE UNIQUE INDEX IF NOT EXISTS "founder_sales_founderNumber_key" ON public."founder_sales" ("founderNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "founder_sales_stripeCheckoutSessionId_key" ON public."founder_sales" ("stripeCheckoutSessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "founder_sales_stripePaymentIntentId_key" ON public."founder_sales" ("stripePaymentIntentId");
CREATE INDEX IF NOT EXISTS "editorial_reviews_ownerId_createdAt_idx" ON public."editorial_reviews" ("ownerId", "createdAt");
CREATE INDEX IF NOT EXISTS "editorial_findings_reviewId_idx" ON public."editorial_findings" ("reviewId");
CREATE INDEX IF NOT EXISTS "book_listings_ownerId_idx" ON public."book_listings" ("ownerId");
CREATE INDEX IF NOT EXISTS "book_listings_status_idx" ON public."book_listings" ("status");

-- Detect an existing index with the right name but the wrong definition.
DO $indexes$
DECLARE problems text;
BEGIN
  WITH expected(table_name, index_name, column_names, is_unique) AS (VALUES
    ('profiles', 'profiles_email_key', ARRAY['email']::text[], true),
    ('profiles', 'profiles_founderNumber_key', ARRAY['founderNumber']::text[], true),
    ('books', 'books_ownerId_idx', ARRAY['ownerId']::text[], false),
    ('chapters', 'chapters_bookId_index_key', ARRAY['bookId', 'index']::text[], true),
    ('story_bible_entities', 'story_bible_entities_bookId_kind_idx', ARRAY['bookId', 'kind']::text[], false),
    ('story_bible_entities', 'story_bible_entities_ownerId_idx', ARRAY['ownerId']::text[], false),
    ('media_assets', 'media_assets_bookId_idx', ARRAY['bookId']::text[], false),
    ('media_assets', 'media_assets_ownerId_idx', ARRAY['ownerId']::text[], false),
    ('media_assets', 'media_assets_assetType_idx', ARRAY['assetType']::text[], false),
    ('jobs', 'jobs_status_leaseExpiresAt_idx', ARRAY['status', 'leaseExpiresAt']::text[], false),
    ('jobs', 'jobs_ownerId_idx', ARRAY['ownerId']::text[], false),
    ('jobs', 'jobs_bookId_idx', ARRAY['bookId']::text[], false),
    ('credit_ledger', 'credit_ledger_profileId_idx', ARRAY['profileId']::text[], false),
    ('credit_ledger', 'credit_ledger_jobId_idx', ARRAY['jobId']::text[], false),
    ('payments', 'payments_stripeSessionId_key', ARRAY['stripeSessionId']::text[], true),
    ('payments', 'payments_stripeInvoiceId_key', ARRAY['stripeInvoiceId']::text[], true),
    ('payments', 'payments_profileId_createdAt_idx', ARRAY['profileId', 'createdAt']::text[], false),
    ('founder_sales', 'founder_sales_profileId_key', ARRAY['profileId']::text[], true),
    ('founder_sales', 'founder_sales_founderNumber_key', ARRAY['founderNumber']::text[], true),
    ('founder_sales', 'founder_sales_stripeCheckoutSessionId_key', ARRAY['stripeCheckoutSessionId']::text[], true),
    ('founder_sales', 'founder_sales_stripePaymentIntentId_key', ARRAY['stripePaymentIntentId']::text[], true),
    ('editorial_reviews', 'editorial_reviews_ownerId_createdAt_idx', ARRAY['ownerId', 'createdAt']::text[], false),
    ('editorial_findings', 'editorial_findings_reviewId_idx', ARRAY['reviewId']::text[], false),
    ('book_listings', 'book_listings_ownerId_idx', ARRAY['ownerId']::text[], false),
    ('book_listings', 'book_listings_status_idx', ARRAY['status']::text[], false)
  )
  SELECT string_agg(e.index_name, ', ' ORDER BY e.index_name) INTO problems
  FROM expected e
  LEFT JOIN pg_index i ON i.indexrelid = to_regclass(format('public.%I', e.index_name))
  WHERE i.indexrelid IS NULL OR i.indrelid <> to_regclass(format('public.%I', e.table_name))
     OR i.indisunique <> e.is_unique OR NOT i.indisvalid OR i.indpred IS NOT NULL
     OR ARRAY(SELECT a.attname::text
              FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum, position)
              JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
              ORDER BY k.position) <> e.column_names;
  IF problems IS NOT NULL THEN
    RAISE EXCEPTION 'Existing index definitions conflict with the app schema: %. Review them before rerunning.', problems;
  END IF;
END;
$indexes$;

-- 5. Foreign keys, with the same cascade/set-null actions as Prisma.
-- Equivalent keys with older/custom names are reused, not duplicated.
DO $foreign_keys$
DECLARE r record; source_oid oid; target_oid oid; source_keys smallint[]; target_keys smallint[];
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('style_profiles', 'style_profiles_ownerId_fkey', ARRAY['ownerId']::text[], 'profiles', ARRAY['id']::text[], 'CASCADE', 'c'),
    ('books', 'books_ownerId_fkey', ARRAY['ownerId']::text[], 'profiles', ARRAY['id']::text[], 'CASCADE', 'c'),
    ('books', 'books_styleProfileId_fkey', ARRAY['styleProfileId']::text[], 'style_profiles', ARRAY['id']::text[], 'SET NULL', 'n'),
    ('chapters', 'chapters_bookId_fkey', ARRAY['bookId']::text[], 'books', ARRAY['id']::text[], 'CASCADE', 'c'),
    ('story_bible_entities', 'story_bible_entities_ownerId_fkey', ARRAY['ownerId']::text[], 'profiles', ARRAY['id']::text[], 'CASCADE', 'c'),
    ('story_bible_entities', 'story_bible_entities_bookId_fkey', ARRAY['bookId']::text[], 'books', ARRAY['id']::text[], 'CASCADE', 'c'),
    ('media_assets', 'media_assets_ownerId_fkey', ARRAY['ownerId']::text[], 'profiles', ARRAY['id']::text[], 'CASCADE', 'c'),
    ('media_assets', 'media_assets_bookId_fkey', ARRAY['bookId']::text[], 'books', ARRAY['id']::text[], 'CASCADE', 'c'),
    ('jobs', 'jobs_ownerId_fkey', ARRAY['ownerId']::text[], 'profiles', ARRAY['id']::text[], 'CASCADE', 'c'),
    ('jobs', 'jobs_bookId_fkey', ARRAY['bookId']::text[], 'books', ARRAY['id']::text[], 'CASCADE', 'c'),
    ('credit_ledger', 'credit_ledger_profileId_fkey', ARRAY['profileId']::text[], 'profiles', ARRAY['id']::text[], 'CASCADE', 'c'),
    ('credit_ledger', 'credit_ledger_jobId_fkey', ARRAY['jobId']::text[], 'jobs', ARRAY['id']::text[], 'SET NULL', 'n'),
    ('payments', 'payments_profileId_fkey', ARRAY['profileId']::text[], 'profiles', ARRAY['id']::text[], 'CASCADE', 'c'),
    ('founder_sales', 'founder_sales_profileId_fkey', ARRAY['profileId']::text[], 'profiles', ARRAY['id']::text[], 'CASCADE', 'c'),
    ('editorial_reviews', 'editorial_reviews_bookId_fkey', ARRAY['bookId']::text[], 'books', ARRAY['id']::text[], 'CASCADE', 'c'),
    ('editorial_reviews', 'editorial_reviews_ownerId_fkey', ARRAY['ownerId']::text[], 'profiles', ARRAY['id']::text[], 'CASCADE', 'c'),
    ('editorial_reviews', 'editorial_reviews_jobId_fkey', ARRAY['jobId']::text[], 'jobs', ARRAY['id']::text[], 'SET NULL', 'n'),
    ('editorial_findings', 'editorial_findings_reviewId_fkey', ARRAY['reviewId']::text[], 'editorial_reviews', ARRAY['id']::text[], 'CASCADE', 'c'),
    ('book_listings', 'book_listings_ownerId_fkey', ARRAY['ownerId']::text[], 'profiles', ARRAY['id']::text[], 'CASCADE', 'c')
  ) AS specs(table_name, constraint_name, column_names, target_table, target_columns, delete_action, delete_code)
  LOOP
    source_oid := to_regclass(format('public.%I', r.table_name));
    target_oid := to_regclass(format('public.%I', r.target_table));
    SELECT array_agg(a.attnum ORDER BY k.position)::smallint[] INTO source_keys
      FROM unnest(r.column_names) WITH ORDINALITY AS k(name, position)
      JOIN pg_attribute a ON a.attrelid = source_oid AND a.attname = k.name;
    SELECT array_agg(a.attnum ORDER BY k.position)::smallint[] INTO target_keys
      FROM unnest(r.target_columns) WITH ORDINALITY AS k(name, position)
      JOIN pg_attribute a ON a.attrelid = target_oid AND a.attname = k.name;

    IF EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = source_oid AND c.contype = 'f'
               AND c.conkey = source_keys AND c.confrelid = target_oid AND c.confkey = target_keys
               AND c.confdeltype::text = r.delete_code AND c.confupdtype = 'c' AND c.convalidated) THEN
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid = source_oid
               AND (c.conname = r.constraint_name OR (c.contype = 'f' AND c.conkey = source_keys))) THEN
      RAISE EXCEPTION 'Conflicting/unvalidated foreign key for public.%. Review existing constraints before rerunning.', r.table_name;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES public.%I (%s) ON DELETE %s ON UPDATE CASCADE',
      r.table_name, r.constraint_name,
      (SELECT string_agg(format('%I', name), ', ') FROM unnest(r.column_names) AS x(name)),
      r.target_table,
      (SELECT string_agg(format('%I', name), ', ') FROM unnest(r.target_columns) AS x(name)),
      r.delete_action);
  END LOOP;
END;
$foreign_keys$;

-- 6. Database access: private server-side Prisma tables, not browser Data API.
-- Profile UUIDs are NOT auth.uid(): profiles are created by the app by email.
-- Therefore do not add simplistic auth.uid() = ownerId policies here.
-- Use a trusted server DATABASE_URL (table owner / appropriate BYPASSRLS role).
-- Never put DATABASE_URL or a service-role key into a NEXT_PUBLIC_* variable.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON TYPE public."JobType", public."JobStatus", public."BookStatus",
  public."ChapterStatus", public."EditorReviewStatus" TO service_role;
DO $security$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['profiles', 'style_profiles', 'books', 'chapters', 'story_bible_entities', 'media_assets', 'jobs', 'credit_ledger', 'payments', 'founder_sales', 'editorial_reviews', 'editorial_findings', 'book_listings']::text[]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END;
$security$;

-- 7. Persistent assets. The current app calls getPublicUrl(), so NEW assets in
-- this bucket are publicly readable by URL. No anonymous/authenticated write
-- policies are granted. Uploads use the server-only service role.
-- Change this ONE value if SUPABASE_STORAGE_BUCKET is set to a different name.
DO $storage$
DECLARE bucket_name text := 'hydraskript-assets';
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = bucket_name AND public IS NOT TRUE) THEN
    RAISE EXCEPTION 'Storage bucket % already exists and is private. This script will NOT expose its contents. Choose a separate empty public asset bucket or implement signed URLs.', bucket_name;
  END IF;
  INSERT INTO storage.buckets (id, name, public)
  VALUES (bucket_name, bucket_name, true)
  ON CONFLICT (id) DO NOTHING;
END;
$storage$;

COMMIT;

-- The final result should list all 13 tables with row_security_enabled = true.
-- A success here creates schema only: it cannot restore deleted books/users.
SELECT c.relname AS application_table, c.relrowsecurity AS row_security_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN ('profiles', 'style_profiles', 'books', 'chapters', 'story_bible_entities', 'media_assets', 'jobs', 'credit_ledger', 'payments', 'founder_sales', 'editorial_reviews', 'editorial_findings', 'book_listings')
ORDER BY c.relname;
