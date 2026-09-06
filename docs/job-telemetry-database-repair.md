# Repair missing Job cost/token columns

## Confirmed failure

The application can report either of these for the same schema mismatch:

- `prisma.book.findFirst()`: `jobs.estimatedCostCents` does not exist (book detail includes its latest job).
- `prisma.job.create()`: `jobs.estimatedCostCents` does not exist (Prisma returns the new job's scalar fields).

The Prisma `Job` model declares six optional telemetry columns, but the original
migration history never added them. Fix the whole group, not just the first
column mentioned in the error:

| Column | PostgreSQL type | Nullable |
| --- | --- | --- |
| `estimatedCostCents` | `integer` | yes |
| `actualCostCents` | `integer` | yes |
| `provider` | `text` | yes |
| `modelName` | `text` | yes |
| `tokensIn` | `integer` | yes |
| `tokensOut` | `integer` | yes |

## Targeted fix for the existing Supabase database

1. Open the **Supabase project used by the affected deployment's `DATABASE_URL`**.
   Confirm the project/environment before executing SQL and follow your normal
   production backup/snapshot policy. Do not share database credentials in chat.
2. Open **SQL Editor → New query**.
3. Copy the **entire** canonical migration below into the editor and run it:

   [`prisma/migrations/20260905_add_job_cost_telemetry/migration.sql`](../prisma/migrations/20260905_add_job_cost_telemetry/migration.sql)

   It only adds missing nullable columns. It does not delete rows, reset jobs,
   change credit balances, change existing defaults, or overwrite telemetry.
   `IF NOT EXISTS` permits a retry or a partially applied manual hotfix.
4. `Success. No rows returned` is an expected result. If a lock or statement
   timeout is reported instead, the transaction has **not** successfully applied;
   roll back that failed transaction if the editor retains it, then retry when
   traffic is lower. Do not remove the timeouts to wait indefinitely on a busy table.
5. Verify the six columns with this **read-only** query:

   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'jobs'
     AND column_name IN (
       'estimatedCostCents', 'actualCostCents', 'provider',
       'modelName', 'tokensIn', 'tokensOut'
     )
   ORDER BY column_name;
   ```

   Expect all six rows, with the types above and `is_nullable = 'YES'`.
6. Return to HydraSkript and click **Retry** on the existing book, then retry
   generation. The current application already expects these columns; another
   Vercel redeploy is not necessary to use this database-only fix. Do not create
   duplicate books as a workaround.

This fixes the specific missing Job telemetry columns. It is not a blanket
schema reconciliation: if another table/column/type error appears, inspect it
before making additional changes. The health endpoint's `ok: true` currently
proves database connectivity (`select 1`), not complete schema compatibility.

**Do not run `prisma migrate reset`, `npm run db:reset`, or use
`prisma db push --accept-data-loss` against production to resolve this error.**

## Migration history and future releases

The Vercel build runs `prisma generate && next build`. `prisma generate` produces
JavaScript/types; it does **not** apply SQL to the database. This change does not
add automatic DDL to a request handler or Preview build.

For a database already managed by Prisma Migrate, review the target database and
all pending migrations, then run the explicit release step:

```bash
npm run db:status
npm run db:deploy
```

`db:deploy` applies **all** pending migrations, not just this one. If a database
was populated with `db push` or manual SQL and its Prisma migration history is
absent/out of sync, do not blindly deploy the original migrations against it.
Use the targeted SQL above for this incident, then separately reconcile/baseline
the migration history after auditing the actual database. This repair does not
attempt to reconcile the project's older manual schema changes.

Running the hotfix in Supabase SQL Editor does not create a Prisma migration
history entry. Once the existing history is correctly reconciled, this new
idempotent migration can also be applied by Prisma Migrate to record it without
overwriting data. Historical migration files/checksums remain unchanged.

## Regression tests

```bash
npm run test:db-migrations
```

These tests execute the checked-in SQL using PostgreSQL via PGlite, entirely in
memory. They never read `DATABASE_URL` or contact the production database. They
cover the original missing-column failure, all scalar Job columns, nullable
telemetry types, new-job insert/returning behavior, preservation of existing
records/credits, and repeated or partial application of the migration.
