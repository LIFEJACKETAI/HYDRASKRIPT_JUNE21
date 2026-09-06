-- Add the six optional Job telemetry fields already declared in schema.prisma.
-- Prisma includes these fields when reading jobs and returning newly created
-- jobs, even before the application starts recording cost/token telemetry.
-- This is additive: no existing rows, credits, defaults, or job states change.
-- IF NOT EXISTS also allows this migration to follow a manual Supabase hotfix.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE "public"."jobs"
    ADD COLUMN IF NOT EXISTS "estimatedCostCents" INTEGER,
    ADD COLUMN IF NOT EXISTS "actualCostCents" INTEGER,
    ADD COLUMN IF NOT EXISTS "provider" TEXT,
    ADD COLUMN IF NOT EXISTS "modelName" TEXT,
    ADD COLUMN IF NOT EXISTS "tokensIn" INTEGER,
    ADD COLUMN IF NOT EXISTS "tokensOut" INTEGER;

COMMIT;
