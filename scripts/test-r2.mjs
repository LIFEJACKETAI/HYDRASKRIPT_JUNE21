// HydraSkript — Cloudflare R2 connectivity test
// Verifies your R2 credentials and bucket configuration end-to-end:
//   list buckets → upload test object → head it → read it back → delete it.
//
// Usage:
//   node scripts/test-r2.mjs
//
// Reads the same env vars the app uses:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_KEY,
//   R2_PUBLIC_URL (optional — for the public-URL hint only).
//
// Loads them from .env / .env.local if present (via dotenv).

import 'dotenv/config';
import { S3Client, ListBucketsCommand, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

function mask(value, show = 4) {
  if (!value) return '(unset)';
  if (value.length <= show) return '••••';
  return `${value.slice(0, show)}…${value.slice(-4)}`;
}

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET_KEY;
const publicUrl = process.env.R2_PUBLIC_URL;

const missing = [];
if (!accountId) missing.push('R2_ACCOUNT_ID');
if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
if (!bucket) missing.push('R2_BUCKET_KEY');

console.log('Cloudflare R2 configuration:');
console.log(`  R2_ACCOUNT_ID        = ${mask(accountId)}`);
console.log(`  R2_ACCESS_KEY_ID     = ${mask(accessKeyId, 6)}`);
console.log(`  R2_SECRET_ACCESS_KEY = ${mask(secretAccessKey, 3)}`);
console.log(`  R2_BUCKET_KEY        = ${bucket || '(unset)'}`);
console.log(`  R2_PUBLIC_URL        = ${publicUrl || '(unset — private-only, app will stream via signed requests)'}`);
console.log('');

if (missing.length) {
  console.error(`❌ Missing required variables: ${missing.join(', ')}`);
  console.error('   Add them to your .env.local (local dev) or your host platform env vars.');
  process.exit(1);
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

async function main() {
  // 1. List buckets (validates credentials + account id + endpoint)
  try {
    const { Buckets } = await client.send(new ListBucketsCommand({}));
    const names = (Buckets ?? []).map((b) => b.Name);
    console.log('✅ Credentials valid. Buckets visible to this token:');
    if (names.length === 0) console.log('   (none — token may be scoped to a single bucket, which is fine)');
    names.forEach((n) => console.log(`   - ${n}`));
  } catch (e) {
    console.error('❌ Failed to list buckets (check R2_ACCOUNT_ID and API token):', e.message);
    process.exit(1);
  }

  const key = `_hydraskript_test_${Date.now()}.txt`;
  const body = Buffer.from('HydraSkript R2 connectivity test ✔');

  // 2. Upload
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'text/plain' }));
    console.log(`✅ Uploaded test object: ${key}`);
  } catch (e) {
    console.error(`❌ Upload failed (check R2_BUCKET_KEY + token has Object Read & Write for "${bucket}"):`, e.message);
    process.exit(1);
  }

  // 3. Head (existence)
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    console.log('✅ HEAD request succeeded (object exists).');
  } catch (e) {
    console.error('❌ HEAD failed:', e.message);
  }

  // 4. Read back
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const stream = res.Body;
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const read = Buffer.concat(chunks).toString('utf8');
    console.log(`✅ Read test object back: "${read}"`);
  } catch (e) {
    console.error('❌ Read-back failed:', e.message);
  }

  // 5. Delete
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    console.log('✅ Deleted test object.');
  } catch (e) {
    console.error('⚠️  Cleanup delete failed (harmless):', e.message);
  }

  console.log('');
  console.log('──────────────────────────────────────────────────────────');
  console.log('All done. If every step above passed, R2 is wired correctly.');
  if (!publicUrl) {
    console.log('');
    console.log('⚠️  R2_PUBLIC_URL is not set. Exports will still work (the app');
    console.log('    streams them via signed requests), but cover/illustration');
    console.log('    images need a PUBLIC URL. Set R2_PUBLIC_URL to your bucket\'s');
    console.log('    custom domain (e.g. https://cdn.example.com) or r2.dev URL.');
  }
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
