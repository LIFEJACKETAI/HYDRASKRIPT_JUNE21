// Real PostgreSQL SQL execution in an isolated in-memory PGlite database.
// Never reads DATABASE_URL, contacts Supabase, or touches production data.
// Run: npm run test:db-migrations
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, beforeEach, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(
  new URL('../prisma/migrations/20260905_add_job_cost_telemetry/migration.sql', import.meta.url), 'utf8',
);
const foundation = [
  '20260803_init', '20260804_add_story_bible', '20260806_add_editorial_review',
].map(name => readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8')).join('\n');
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const expectedTelemetry = {
  estimatedCostCents: 'integer',
  actualCostCents: 'integer',
  provider: 'text',
  modelName: 'text',
  tokensIn: 'integer',
  tokensOut: 'integer',
};
const jobId = '33333333-3333-4333-8333-333333333333';
const ownerId = '11111111-1111-4111-8111-111111111111';
const bookId = '22222222-2222-4222-8222-222222222222';
let pg;

before(async () => {
  pg = new PGlite();
  await pg.waitReady;
});

after(async () => {
  await pg?.close();
});

beforeEach(async () => {
  // Only resets the in-memory test schema, not a configured/external database.
  await pg.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pg.exec(foundation);
  await pg.query(`INSERT INTO profiles (id, email, credits, "updatedAt") VALUES ($1, $2, 600, NOW())`,
    [ownerId, 'migration-test@example.com']);
  await pg.query(`INSERT INTO books (id, "ownerId", title, "updatedAt") VALUES ($1, $2, 'Existing draft', NOW())`,
    [bookId, ownerId]);
  await pg.query(`INSERT INTO jobs (id, "ownerId", "bookId", "jobType", "creditsReserved", "creditsConsumed")
    VALUES ($1, $2, $3, 'generate_outline', 20, 5)`, [jobId, ownerId, bookId]);
  await pg.query(`INSERT INTO credit_ledger ("profileId", amount, reason, "jobId") VALUES ($1, -20, 'Existing reservation', $2)`,
    [ownerId, jobId]);
});

test('the old migration history reproduces the missing-column error', async () => {
  await assert.rejects(pg.query('SELECT "estimatedCostCents" FROM jobs'), {
    code: '42703', // undefined_column
  });
});

test('the migration supplies every scalar Job field, not just the first failing column', async () => {
  await pg.exec(migration);
  const { rows } = await pg.query(`SELECT column_name, data_type, is_nullable
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jobs'`);
  const columns = new Map(rows.map(row => [row.column_name, row]));

  // Guard against another Job field being added to Prisma without a migration.
  const jobModel = schema.match(/model Job\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(jobModel, 'Job model must exist');
  for (const [, name] of jobModel.matchAll(/^\s*(\w+)\s+(?:String|Int|DateTime|JobType|JobStatus)\??\s/gm)) {
    assert.ok(columns.has(name), `Job.${name} has no database column after migrations`);
  }
  for (const [name, type] of Object.entries(expectedTelemetry)) {
    assert.equal(columns.get(name)?.data_type, type, `${name} uses the declared SQL type`);
    assert.equal(columns.get(name)?.is_nullable, 'YES', `${name} remains optional`);
  }
});

test('adding telemetry preserves existing books, job state, balances, and ledger entries', async () => {
  const beforeRows = {};
  for (const table of ['profiles', 'books', 'jobs', 'credit_ledger']) {
    beforeRows[table] = (await pg.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
  }
  await pg.exec(migration);
  for (const table of ['profiles', 'books', 'jobs', 'credit_ledger']) {
    const { rows } = await pg.query(`SELECT * FROM ${table} ORDER BY id`);
    if (table === 'jobs') {
      for (const name of Object.keys(expectedTelemetry)) {
        assert.equal(rows[0][name], null);
        delete rows[0][name];
      }
    }
    assert.deepEqual(rows, beforeRows[table], `${table} records must not change`);
  }
});

test('new jobs can return every telemetry column without setting optional values', async () => {
  await pg.exec(migration);
  const { rows } = await pg.query(`INSERT INTO jobs ("ownerId", "bookId", "jobType")
    VALUES ($1, $2, 'generate_outline')
    RETURNING id, status, "estimatedCostCents", "actualCostCents", provider, "modelName", "tokensIn", "tokensOut"`,
    [ownerId, bookId]);
  assert.ok(rows[0].id);
  assert.equal(rows[0].status, 'queued');
  for (const name of Object.keys(expectedTelemetry)) assert.equal(rows[0][name], null);
});

test('partial hotfixes and repeated runs preserve values already recorded', async () => {
  await pg.exec('ALTER TABLE jobs ADD COLUMN "estimatedCostCents" INTEGER;');
  await pg.query('UPDATE jobs SET "estimatedCostCents" = 125 WHERE id = $1', [jobId]);
  await pg.exec(migration);
  assert.equal((await pg.query('SELECT "estimatedCostCents" FROM jobs WHERE id = $1', [jobId])).rows[0].estimatedCostCents, 125);

  await pg.query(`UPDATE jobs SET "actualCostCents" = 90, provider = 'test-provider',
    "modelName" = 'test-model', "tokensIn" = 1000, "tokensOut" = 500 WHERE id = $1`, [jobId]);
  const beforeRerun = (await pg.query('SELECT * FROM jobs ORDER BY id')).rows;
  await pg.exec(migration);
  assert.deepEqual((await pg.query('SELECT * FROM jobs ORDER BY id')).rows, beforeRerun);
});

test('the production migration is additive and uses bounded lock/statement waits', () => {
  const sql = migration.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(sql, /\b(?:DROP|DELETE|TRUNCATE|UPDATE|RENAME)\b/i);
  assert.match(sql, /BEGIN\s*;/i);
  assert.match(sql, /SET LOCAL lock_timeout\s*=\s*'5s'/i);
  assert.match(sql, /SET LOCAL statement_timeout\s*=\s*'30s'/i);
  assert.match(sql, /COMMIT\s*;/i);
});
