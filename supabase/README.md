# Complete HydraSkript Supabase setup

Supabase creates **one PostgreSQL database per project**, normally named
`postgres`. HydraSkript needs **13 application tables in the `public` schema**,
not 13 separate databases.

If you have no Supabase project at all, create a project in the Supabase dashboard
and wait for provisioning first. SQL cannot create a Supabase project or replace
its managed Auth/Storage services.

## 1. Confirm the project before changing anything

The earlier `jobs.estimatedCostCents does not exist` error proves the app reached
a database with an existing `jobs` table. An empty Table Editor may mean a
different project, a different schema, or an active filter—not deleted data.

- Compare the Supabase **project reference** with the URL configured as
  `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` in Vercel.
- Confirm `DATABASE_URL` connects to that same project using Supabase's **Connect**
  panel. Pooler hostnames alone don't identify a project; their usernames also
  contain the project reference. Never paste passwords/keys into chat.
- In Table Editor, select the **public** schema and clear filters.
- Follow your normal backup/snapshot policy before running production DDL.

Open **Supabase → SQL Editor → New query** and run:

**[`00-preflight.sql`](00-preflight.sql)**

This is read-only. It lists managed-service availability and all 13 expected app
tables, with presence/column counts. It reads no user records or credentials.
`current_database() = postgres` alone is not enough to identify a project.

## 2. Run the complete setup

In a new SQL Editor query, using the **postgres** role, paste the **entire** file:

**[`01-hydraskript-setup.sql`](01-hydraskript-setup.sql)**

Run it once. The final result should list **13 rows**, each with
`row_security_enabled = true`.

### Included

| Table | Purpose |
| --- | --- |
| `profiles` | Author profiles, wallet balances, subscriptions, founder flags |
| `style_profiles` | Writing-style exemplars and prompts |
| `books` | Book metadata, outlines, generation state |
| `chapters` | Manuscript content and approval state |
| `story_bible_entities` | Characters, locations, objects, themes, history |
| `media_assets` | Covers, illustrations, exports, audio metadata |
| `jobs` | Generation queue, leases/retries, all six cost/token fields |
| `credit_ledger` | Credit accounting and reservations |
| `payments` | Payment/fulfilment records |
| `founder_sales` | Founder purchases and unique identifiers |
| `editorial_reviews` | Universe/editorial review requests and source text |
| `editorial_findings` | Review findings and resolution status |
| `book_listings` | Bookstore listings |

Also included: all **5 enum types**, **25 unique/lookup indexes**, **13 primary
keys**, **19 foreign keys**, and the default `hydraskript-assets` storage bucket.
Types, nullability, defaults, and relations follow the current
[`prisma/schema.prisma`](../prisma/schema.prisma); JSON-shaped fields remain
**TEXT**, not JSONB. Prisma manages `@updatedAt` fields when writing app records.

### Existing data and repeat runs

- A completed setup can be rerun without duplicating tables/buckets or resetting
  records, credits, jobs, or users.
- The known six missing **nullable Job telemetry columns** are added if needed.
- Other incompatible existing columns, enum labels, keys, or indexes cause the
  transaction to **fail**, rather than guessing how to rewrite existing data.
  This is not a general automatic upgrade for arbitrary legacy schemas.
- If any statement fails, the setup is **not complete**. Run `ROLLBACK;` if the
  SQL Editor retains an aborted transaction. Read the reported mismatch and
  arrange a targeted migration. Lock/statement timeouts should be retried when
  traffic is lower, not bypassed with unbounded waits.
- Do not drop tables, delete the project, run `db:reset`/`migrate reset`, or use
  `db push --accept-data-loss` to get around a setup error.

## 3. Security and storage

**Application tables are private to the server.** RLS is enabled; public,
`anon`, and `authenticated` table grants are revoked. No permissive browser
policies are added. The current application accesses these tables through
server-side Prisma after verifying the Supabase session and resource ownership.
Use a trusted server `DATABASE_URL` (the table owner / an appropriately configured
BYPASSRLS role); a browser-style DB role is not the server connection.

`profiles.id` is an independently generated app UUID, **not** `auth.uid()`. This
setup deliberately does not add incorrect `auth.uid() = ownerId` policies or
Auth signup triggers.

**The asset bucket is PUBLIC**, because the current code uses Supabase
`getPublicUrl()`. Files in it are publicly readable by URL. Do not upload private
or sensitive manuscripts; confidential assets require a separate signed-URL
implementation and private storage. No anonymous/authenticated upload policies
are created; uploads go through the server using its service-role key.

If `hydraskript-assets` already exists as a **private** bucket, setup stops and
will **not** expose its contents. Either choose a separate empty public asset
bucket or implement private/signed asset delivery. To use a different bucket,
change `bucket_name` in the SQL's final storage block and set the same
`SUPABASE_STORAGE_BUCKET` in Vercel.

Supabase owns `auth.*` and `storage.*`. The script only checks managed-service
presence and inserts the new bucket record. It does not recreate their tables,
make login accounts/passwords, grant admin privileges, or award credits.

## 4. Connect the app and sign in

If these values already point at this project, leave them unchanged. If you
created a **new project**, update them together in the intended Vercel environment:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<project-public-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
SUPABASE_STORAGE_BUCKET=hydraskript-assets
DATABASE_URL=<server-PostgreSQL-connection-string-from-the-same-project>
```

Set Production values for the live domain and Preview values for branch tests.
Never expose `DATABASE_URL` or the service-role key through a `NEXT_PUBLIC_*`
variable. Redeploy if environment values change, especially `NEXT_PUBLIC_*` keys
which are embedded at build time. A SQL-only change in the already-configured
project does not require another app redeploy.

Supabase Authentication is managed separately: enable the sign-in providers the
app uses, configure site/redirect URLs for your domain, then sign up/sign in
normally. The app creates a profile and initial free-credit ledger entry on its
first authenticated API access. Schema setup itself does not seed accounts.

Check Storage for the bucket, rerun the read-only preflight, then open an
existing book or create a small test book if this is genuinely a new project.
`/api/health` should show database connectivity and `storage.driver = supabase`,
but a green connectivity check alone is not a full functional/schema test.

**An empty schema does not restore deleted books, users, purchased credits, or
files.** If you expected existing content, find the original project or use a
verified backup rather than creating replacement data/accounts blindly.

## Prisma migration history

This is a **standalone SQL installer**, not a migration-history reset. It does
not create/falsify `_prisma_migrations` entries or rewrite historical migration
files. The repository's older migration history predates some current fields;
blindly running those original migrations against this initialized database can
fail with existing-table errors. Reconcile/baseline the history deliberately
before enabling automated `prisma migrate deploy` on this database.

No SQL here is executed automatically by Vercel, a request handler, or a build.

## Tests (local only)

```bash
npm run test:db-migrations
```

The complete SQL is executed against PostgreSQL via isolated, in-memory PGlite.
Supabase-managed roles/tables are simulated **only in the test fixtures**. Tests
compare all model columns and enums to the Prisma source and verify fresh
creation, inserts across all 13 tables, defaults, indexes/relationships,
repeat-run preservation, browser-role denial, server-role access, and safe
rollback for incompatible schemas/private buckets. No live credentials are read.
