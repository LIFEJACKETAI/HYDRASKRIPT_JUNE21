-- AlterEnum
-- Adds the `manuscript_import` job type used by the async Story Bible
-- manuscript importer (POST /api/story-bible/import-manuscript).
--
-- Written defensively on purpose:
--   * `prisma db push` / `prisma migrate dev` create "JobType" as a native
--     Postgres enum, in which case the value must be added here.
--   * Some environments were provisioned from the older 20260803_init
--     migration, where `jobs."jobType"` is plain TEXT and no enum type exists.
--     In that case there is nothing to do.
-- The block is idempotent, so it is always safe to run.

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
