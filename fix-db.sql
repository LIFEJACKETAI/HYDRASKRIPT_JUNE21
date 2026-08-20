-- Add missing columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT,
ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT,
ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT DEFAULT 'inactive',
ADD COLUMN IF NOT EXISTS "currentPeriodEnd" TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS "freeCreditsGranted" BOOLEAN DEFAULT false;

-- Create editorial_reviews table if not exists
CREATE TABLE IF NOT EXISTS editorial_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "bookId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "jobId" UUID,
    status TEXT DEFAULT 'queued',
    feedback TEXT DEFAULT '',
    score INTEGER,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add foreign keys for editorial_reviews
ALTER TABLE editorial_reviews
ADD CONSTRAINT fk_editorial_reviews_book
FOREIGN KEY ("bookId") REFERENCES books(id) ON DELETE CASCADE;

ALTER TABLE editorial_reviews
ADD CONSTRAINT fk_editorial_reviews_owner
FOREIGN KEY ("ownerId") REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE editorial_reviews
ADD CONSTRAINT fk_editorial_reviews_job
FOREIGN KEY ("jobId") REFERENCES jobs(id) ON DELETE SET NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_editorial_reviews_book ON editorial_reviews("bookId");
CREATE INDEX IF NOT EXISTS idx_editorial_reviews_owner ON editorial_reviews("ownerId");

-- Add missing value to ChapterStatus enum (used by interactive chapter steering)
ALTER TYPE "ChapterStatus" ADD VALUE IF NOT EXISTS 'awaiting_approval' BEFORE 'completed';