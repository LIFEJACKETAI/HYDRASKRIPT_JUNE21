-- HydraSkript - one-off SQL for the async manuscript importer.
--
-- Apply with either:
--   npx prisma migrate deploy
-- or directly (Supabase SQL editor / psql):
--   psql "$DATABASE_URL" -f scripts/sql/2026_09_08_add_manuscript_import_job_type.sql
--
-- Idempotent: safe to run more than once, and safe whether jobs."jobType" is a
-- native Postgres enum or a plain TEXT column.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'JobType'
      AND t.typtype = 'e'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'JobType'
        AND e.enumlabel = 'manuscript_import'
    ) THEN
      ALTER TYPE "public"."JobType" ADD VALUE 'manuscript_import';
    END IF;
  END IF;
END
$$;
