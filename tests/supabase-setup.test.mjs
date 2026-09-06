// PostgreSQL execution in PGlite only. Never reads a live DATABASE_URL.
// Supabase-managed schemas/roles below are TEST FIXTURES, not production setup.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, beforeEach, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const setup = readFileSync(new URL('../supabase/01-hydraskript-setup.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('../supabase/00-preflight.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const blocks = [...schema.matchAll(/^(model|enum)\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
const modelNames = new Set(blocks.filter(b => b[1] === 'model').map(b => b[2]));
const enumNames = new Set(blocks.filter(b => b[1] === 'enum').map(b => b[2]));
const tableNames = blocks.filter(b => b[1] === 'model').map(b => b[3].match(/@@map\("([^"]+)"\)/)[1]).sort();
const managedUser = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const owner = '11111111-1111-4111-8111-111111111111';
const book = '22222222-2222-4222-8222-222222222222';
const job = '33333333-3333-4333-8333-333333333333';
const review = '44444444-4444-4444-8444-444444444444';
let pg;

before(async () => {
  pg = new PGlite();
  await pg.waitReady;
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
});
after(async () => { await pg?.close(); });
beforeEach(async () => {
  // Resets only this isolated test database, not the user's database.
  await pg.exec('ROLLBACK');
  await pg.exec('RESET ROLE');
  await pg.exec(`
    DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;
    DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA auth;
    DROP SCHEMA IF EXISTS storage CASCADE; CREATE SCHEMA storage;
    CREATE TABLE auth.users (id UUID PRIMARY KEY);
    CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, public BOOLEAN NOT NULL DEFAULT false);
    CREATE TABLE storage.objects (id UUID PRIMARY KEY, bucket_id TEXT, name TEXT);
  `);
  await pg.query('INSERT INTO auth.users VALUES ($1)', [managedUser]);
});

async function seedApp() {
  await pg.query(`INSERT INTO profiles (id, email, "monthlyCredits", "purchasedCredits", "updatedAt")
    VALUES ($1, 'test@example.com', 100, 450, NOW())`, [owner]);
  await pg.query(`INSERT INTO books (id, "ownerId", title, "updatedAt") VALUES ($1, $2, 'Existing book', NOW())`, [book, owner]);
  await pg.query(`INSERT INTO jobs (id, "ownerId", "bookId", "jobType", "creditsReserved", "estimatedCostCents")
    VALUES ($1, $2, $3, 'generate_outline', 20, 50)`, [job, owner, book]);
  await pg.query(`INSERT INTO credit_ledger ("profileId", "jobId", amount, reason) VALUES ($1, $2, -20, 'Reservation')`, [owner, job]);
}

async function snapshot() {
  const data = {};
  for (const table of tableNames) data[table] = (await pg.query(`SELECT * FROM public."${table}" ORDER BY id`)).rows;
  data.auth = (await pg.query('SELECT * FROM auth.users ORDER BY id')).rows;
  data.buckets = (await pg.query('SELECT * FROM storage.buckets ORDER BY id')).rows;
  data.objects = (await pg.query('SELECT * FROM storage.objects ORDER BY id')).rows;
  return data;
}

test('preflight is read-only and reports all missing tables on a clean project', async () => {
  const result = await pg.exec(preflight);
  assert.equal(result[0].rows[0].supabase_auth_present, true);
  assert.equal(result[0].rows[0].supabase_storage_present, true);
  assert.equal(result[1].rows.length, 13);
  assert.ok(result[1].rows.every(row => row.already_exists === false));
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'")).rows[0].n, 0);
});

test('clean setup has every model column/type/nullability and enum from the source Prisma schema', async () => {
  const result = await pg.exec(setup);
  assert.deepEqual(result.at(-1).rows.map(row => row.application_table), tableNames);
  assert.ok(result.at(-1).rows.every(row => row.row_security_enabled));
  const columns = (await pg.query(`SELECT c.relname AS table_name, a.attname AS column_name,
    t.typname, a.attnotnull FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped`)).rows;
  const byColumn = new Map(columns.map(c => [`${c.table_name}.${c.column_name}`, c]));
  let expectedCount = 0;
  for (const block of blocks.filter(b => b[1] === 'model')) {
    const table = block[3].match(/@@map\("([^"]+)"\)/)[1];
    for (const raw of block[3].split('\n')) {
      const line = raw.split('//')[0].trim();
      if (!line || line.startsWith('@@')) continue;
      const field = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?(?:\s+(.*))?$/);
      assert.ok(field, `Unparsed schema field: ${line}`);
      const [, name, type, list, nullable, attributes = ''] = field;
      if (modelNames.has(type)) continue;
      expectedCount++;
      let expectedType = enumNames.has(type) ? type : {
        String: 'text', Int: 'int4', DateTime: 'timestamp', Float: 'float8', Boolean: 'bool',
      }[type];
      if (attributes.includes('@db.Uuid')) expectedType = 'uuid';
      if (list) expectedType = `_${expectedType}`;
      const actual = byColumn.get(`${table}.${name}`);
      assert.ok(actual, `Missing ${table}.${name}`);
      assert.equal(actual.typname, expectedType, `${table}.${name} type`);
      // Prisma's PostgreSQL scalar-list columns are SQL-nullable with a [] default.
      assert.equal(actual.attnotnull, !nullable && !list, `${table}.${name} nullability`);
    }
  }
  assert.equal(columns.length, expectedCount);
  for (const block of blocks.filter(b => b[1] === 'enum')) {
    const expected = block[3].split('\n').map(line => line.split('//')[0].trim()).filter(Boolean);
    const actual = (await pg.query(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = $1 ORDER BY e.enumsortorder`, [block[2]])).rows;
    assert.deepEqual(actual.map(row => row.enumlabel), expected);
  }
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public'")).rows[0].n, 13 + 25);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace")).rows[0].n, 19);
});

test('fresh defaults are safe and job creation can return all telemetry fields', async () => {
  await pg.exec(setup);
  const profile = (await pg.query(`INSERT INTO profiles (id, email, "updatedAt") VALUES ($1, 'new@example.com', NOW()) RETURNING *`, [owner])).rows[0];
  assert.equal(profile.tier, 'free');
  assert.equal(profile.isAdmin, false);
  assert.equal(profile.monthlyCredits, 0);
  assert.equal(profile.purchasedCredits, 0);
  assert.equal(profile.lifetimeCredits, 0);
  assert.equal(profile.freeCreditsGranted, false);
  const createdBook = (await pg.query(`INSERT INTO books (id, "ownerId", title, "updatedAt") VALUES ($1, $2, 'New book', NOW()) RETURNING *`, [book, owner])).rows[0];
  assert.deepEqual(createdBook.characterNames, []);
  assert.equal(createdBook.outline, '{}');
  const createdJob = (await pg.query(`INSERT INTO jobs ("ownerId", "bookId", "jobType") VALUES ($1, $2, 'generate_outline') RETURNING *`, [owner, book])).rows[0];
  assert.equal(createdJob.status, 'queued');
  for (const name of ['estimatedCostCents', 'actualCostCents', 'provider', 'modelName', 'tokensIn', 'tokensOut']) assert.equal(createdJob[name], null);
  await assert.rejects(pg.query(`INSERT INTO jobs ("ownerId", "jobType") VALUES ($1, 'not_a_job_type')`, [owner]), { code: '22P02' });
});

test('all 13 tables accept representative app records and a rerun preserves records/credits/auth/storage', async () => {
  await pg.exec(setup);
  await seedApp();
  await pg.query(`INSERT INTO style_profiles ("ownerId", name, "updatedAt") VALUES ($1, 'A style', NOW())`, [owner]);
  await pg.query(`INSERT INTO chapters ("bookId", index, "updatedAt") VALUES ($1, 0, NOW())`, [book]);
  await pg.query(`INSERT INTO story_bible_entities ("ownerId", "bookId", kind, name, "updatedAt") VALUES ($1, $2, 'CHARACTER', 'Hero', NOW())`, [owner, book]);
  await pg.query(`INSERT INTO media_assets ("ownerId", "bookId", "assetType", "storagePath", "publicUrl") VALUES ($1, $2, 'cover', 'covers/test.png', 'https://assets.example.com/test.png')`, [owner, book]);
  await pg.query(`INSERT INTO payments ("profileId", "pricingKey", mode, "amountCents", "updatedAt") VALUES ($1, 'test', 'payment', 1000, NOW())`, [owner]);
  await pg.query(`INSERT INTO founder_sales ("profileId", "founderNumber", "pricePaidCents", "stripeCheckoutSessionId") VALUES ($1, 1, 39900, 'cs_test_fixture')`, [owner]);
  await pg.query(`INSERT INTO editorial_reviews (id, "ownerId", "bookId", "jobId", scope, "sourceLabel", "updatedAt") VALUES ($1, $2, $3, $4, 'book', 'A review', NOW())`, [review, owner, book, job]);
  await pg.query(`INSERT INTO editorial_findings ("reviewId", severity, category, title, description) VALUES ($1, 'minor', 'STYLE', 'A finding', 'Description')`, [review]);
  await pg.query(`INSERT INTO book_listings ("ownerId", title, "updatedAt") VALUES ($1, 'A listing', NOW())`, [owner]);
  await pg.query(`INSERT INTO storage.objects VALUES ($1, 'hydraskript-assets', 'covers/existing.png')`, [book]);
  const before = await snapshot();
  assert.ok(tableNames.every(table => before[table].length === 1));
  await pg.exec(setup);
  assert.deepEqual(await snapshot(), before);
});

test('the earlier missing-telemetry schema is repaired without changing existing job rows', async () => {
  await pg.exec(setup);
  await seedApp();
  const names = ['estimatedCostCents', 'actualCostCents', 'provider', 'modelName', 'tokensIn', 'tokensOut'];
  for (const name of names) await pg.exec(`ALTER TABLE jobs DROP COLUMN "${name}"`);
  const before = await snapshot();
  await pg.exec(setup);
  const after = await snapshot();
  for (const name of names) {
    assert.equal(after.jobs[0][name], null);
    delete after.jobs[0][name];
  }
  assert.deepEqual(after, before);
});

test('browser roles cannot read/write app tables, but the trusted server role can', async () => {
  await pg.exec(setup);
  await seedApp();
  for (const role of ['anon', 'authenticated']) {
    await pg.exec(`SET ROLE ${role}`);
    try {
      await assert.rejects(pg.query('SELECT * FROM public.profiles'), { code: '42501' });
      await assert.rejects(pg.query(`UPDATE public.profiles SET "isAdmin"=true, "purchasedCredits"=9999`), { code: '42501' });
    } finally {
      await pg.exec('RESET ROLE');
    }
  }
  await pg.exec('SET ROLE service_role');
  try {
    assert.equal((await pg.query('SELECT email FROM public.profiles')).rows[0].email, 'test@example.com');
  } finally {
    await pg.exec('RESET ROLE');
  }
  const row = (await pg.query('SELECT "isAdmin", "purchasedCredits" FROM profiles')).rows[0];
  assert.deepEqual(row, { isAdmin: false, purchasedCredits: 450 });
});

test('foreign keys, uniqueness, cascade, and set-null actions protect relations', async () => {
  await pg.exec(setup);
  await seedApp();
  await assert.rejects(pg.query(`INSERT INTO books ("ownerId", title, "updatedAt") VALUES ($1, 'Orphan', NOW())`, [managedUser]), { code: '23503' });
  await assert.rejects(pg.query(`INSERT INTO profiles (email, "updatedAt") VALUES ('test@example.com', NOW())`), { code: '23505' });
  await pg.query(`INSERT INTO chapters ("bookId", index, "updatedAt") VALUES ($1, 0, NOW())`, [book]);
  await assert.rejects(pg.query(`INSERT INTO chapters ("bookId", index, "updatedAt") VALUES ($1, 0, NOW())`, [book]), { code: '23505' });
  await pg.query(`INSERT INTO editorial_reviews (id, "ownerId", "bookId", "jobId", scope, "sourceLabel", "updatedAt") VALUES ($1, $2, $3, $4, 'book', 'Review', NOW())`, [review, owner, book, job]);
  await pg.query('DELETE FROM jobs WHERE id=$1', [job]);
  assert.equal((await pg.query('SELECT "jobId" FROM credit_ledger')).rows[0].jobId, null);
  assert.equal((await pg.query('SELECT "jobId" FROM editorial_reviews')).rows[0].jobId, null);
  await pg.query('DELETE FROM books WHERE id=$1', [book]);
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM chapters')).rows[0].n, 0);
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM editorial_reviews')).rows[0].n, 0);
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM credit_ledger')).rows[0].n, 1);
});

test('an existing private asset bucket is not exposed and new app DDL rolls back', async () => {
  await pg.exec(`INSERT INTO storage.buckets VALUES ('hydraskript-assets', 'hydraskript-assets', false)`);
  await assert.rejects(pg.exec(setup), /will NOT expose its contents/);
  await pg.exec('ROLLBACK');
  assert.equal((await pg.query('SELECT public FROM storage.buckets')).rows[0].public, false);
  assert.equal((await pg.query("SELECT to_regclass('public.profiles') AS table_name")).rows[0].table_name, null);
  assert.equal((await pg.query('SELECT id FROM auth.users')).rows[0].id, managedUser);
});

test('incompatible existing tables abort with useful diagnostics without losing data', async () => {
  await pg.exec(`CREATE TABLE profiles(id INTEGER PRIMARY KEY, email TEXT); INSERT INTO profiles VALUES (1, 'keep@example.com');`);
  await assert.rejects(pg.exec(setup), /Existing schema needs a reviewed migration/);
  await pg.exec('ROLLBACK');
  assert.deepEqual((await pg.query('SELECT * FROM profiles')).rows, [{ id: 1, email: 'keep@example.com' }]);
  assert.equal((await pg.query("SELECT to_regclass('public.books') AS table_name")).rows[0].table_name, null);
});

test('existing enums missing required labels are not destructively replaced', async () => {
  await pg.exec(`CREATE TYPE public."JobType" AS ENUM ('generate_outline')`);
  await assert.rejects(pg.exec(setup), /missing labels/);
  await pg.exec('ROLLBACK');
  assert.deepEqual((await pg.query(`SELECT enumlabel FROM pg_enum WHERE enumtypid='public."JobType"'::regtype`)).rows, [{ enumlabel: 'generate_outline' }]);
});

test('equivalent custom-named foreign keys are reused, but conflicting indexes are rejected', async () => {
  await pg.exec(setup);
  await pg.exec('ALTER TABLE books RENAME CONSTRAINT "books_ownerId_fkey" TO "legacy_owner_fkey"');
  await pg.exec(setup);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace")).rows[0].n, 19);
  await pg.exec('DROP INDEX "books_ownerId_idx"; CREATE INDEX "books_ownerId_idx" ON books(title)');
  await assert.rejects(pg.exec(setup), /Existing index definitions conflict/);
  await pg.exec('ROLLBACK');
});

test('managed Supabase schemas are required and are never recreated by the setup', async () => {
  await pg.exec('DROP SCHEMA auth CASCADE');
  await assert.rejects(pg.exec(setup), /Supabase auth\/storage tables are missing/);
  await pg.exec('ROLLBACK');
  assert.equal((await pg.query("SELECT to_regclass('public.profiles') AS table_name")).rows[0].table_name, null);
  assert.equal((await pg.query("SELECT to_regclass('auth.users') AS table_name")).rows[0].table_name, null);
});
