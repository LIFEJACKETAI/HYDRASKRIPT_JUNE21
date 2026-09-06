-- READ-ONLY: run this first in Supabase -> SQL Editor.
-- A Supabase project already has ONE PostgreSQL database (usually "postgres").
-- HydraSkript needs application TABLES in its public schema, not more databases.
-- Compare the project's reference with the project's URL in Vercel before setup.
-- current_database() alone does NOT identify the project: many are "postgres".

SELECT
  current_database() AS database_name,
  current_schema() AS selected_schema,
  current_user AS sql_role,
  to_regclass('auth.users') IS NOT NULL AS supabase_auth_present,
  to_regclass('storage.buckets') IS NOT NULL AS supabase_storage_present;

-- Presence only: no user records, passwords, tokens, or connection strings.
WITH expected(table_name) AS (VALUES
  ('profiles'), ('style_profiles'), ('books'), ('chapters'),
  ('story_bible_entities'), ('media_assets'), ('jobs'), ('credit_ledger'),
  ('payments'), ('founder_sales'), ('editorial_reviews'), ('editorial_findings'),
  ('book_listings')
)
SELECT
  table_name,
  to_regclass(format('public.%I', table_name)) IS NOT NULL AS already_exists,
  (SELECT count(*) FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = expected.table_name) AS column_count
FROM expected
ORDER BY table_name;

-- Useful if the dashboard's Table Editor was filtered to a different schema.
SELECT schemaname AS schema_name, tablename AS table_name
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  AND schemaname NOT LIKE 'pg_toast%'
ORDER BY schemaname, tablename;

-- If app tables already exist, do NOT reset/drop them. Confirm the project and
-- back up/review the existing schema. 01-hydraskript-setup.sql will safely refuse
-- incompatible existing tables rather than guessing how to rewrite their data.
