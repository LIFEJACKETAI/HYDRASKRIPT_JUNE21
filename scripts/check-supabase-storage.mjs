import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket =
    process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'hydraskript-assets';

  console.log('Checking local configuration. No credentials will be printed.');
  console.log('Existing shell variables override .env.local, which overrides .env.');

  if (!url || !key) {
    console.log('FAIL: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exitCode = 1;
    return;
  }

  const issues = [];
  let endpoint;

  try {
    endpoint = new URL(url);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username || endpoint.password ||
      endpoint.pathname !== '/' || endpoint.search || endpoint.hash
    ) {
      issues.push('Supabase URL must be the HTTPS project root URL.');
    }
  } catch {
    issues.push('Supabase URL is invalid.');
  }

  if (url !== url.trim()) {
    issues.push('Supabase URL contains surrounding whitespace.');
  }

  if (/\s|["']/.test(key) || key.startsWith('Bearer ')) {
    issues.push('Server key contains whitespace, quotes, or a Bearer prefix.');
  } else if (key.startsWith('sb_secret_')) {
    console.log('Key type: new secret API key.');
  } else {
    const parts = key.split('.');
    if (
      parts.length !== 3 ||
      !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))
    ) {
      issues.push('Legacy key does not have three valid JWT sections.');
    } else {
      console.log('Key type: legacy JWT.');
      try {
        const header = JSON.parse(
          Buffer.from(parts[0], 'base64url').toString()
        );
        const payload = JSON.parse(
          Buffer.from(parts[1], 'base64url').toString()
        );

        if (!header || typeof header.alg !== 'string' || header.alg === 'none') {
          issues.push('JWT header is invalid.');
        }
        if (payload?.role !== 'service_role') {
          issues.push('JWT role is not service_role.');
        }
        if (
          typeof payload?.exp === 'number' &&
          payload.exp * 1000 <= Date.now()
        ) {
          issues.push('JWT has expired.');
        }
        if (
          endpoint?.hostname.endsWith('.supabase.co') &&
          typeof payload?.ref === 'string' &&
          endpoint.hostname.split('.')[0] !== payload.ref
        ) {
          issues.push('Key and URL belong to different Supabase projects.');
        }
      } catch {
        issues.push('JWT header or payload cannot be decoded.');
      }
    }
  }

  if (issues.length) {
    for (const issue of issues) console.log(`FAIL: ${issue}`);
    process.exitCode = 1;
    return;
  }

  console.log('Format checks passed. Checking bucket access—not uploading.');

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      }),
    },
  });

  const { error } = await client.storage.getBucket(bucket);

  if (!error) {
    console.log('PASS: Supabase accepted a read of the configured bucket.');
    console.log('This does not verify upload permissions or Vercel configuration.');
    return;
  }

  const message = String(error.message || '');
  if (/Invalid Compact JWS/i.test(message)) {
    console.log('FAIL: Supabase returned Invalid Compact JWS.');
  } else if (/not found/i.test(message)) {
    console.log('FAIL: Supabase reported the bucket was not found.');
  } else if (/jwt|token|unauthor|signature/i.test(message)) {
    console.log('FAIL: Supabase reported an authentication/token error.');
  } else {
    console.log('FAIL: Another storage error occurred; raw details withheld.');
  }
  process.exitCode = 1;
}

main().catch(() => {
  console.log('FAIL: Network or client error. Raw details withheld for safety.');
  process.exitCode = 1;
});
