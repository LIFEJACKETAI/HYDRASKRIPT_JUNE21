import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// TEMPORARY DIAGNOSTIC ROUTE — safe to delete once login is fixed.
// Visits /api/health, tries `select 1` against the database, and reports
// exactly what's wrong WITHOUT leaking the password.
// (middleware already allowlists /api/health as public)

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function inspectDbUrl(raw?: string) {
  if (!raw) return { problem: 'DATABASE_URL is missing/empty in this deployment' };
  try {
    const u = new URL(raw);
    return {
      host: u.hostname,
      port: u.port || '(default 5432)',
      database: u.pathname.replace(/^\//, '') || '(none)',
      username: u.username,
      passwordProvided: u.password.length > 0,
      passwordLength: u.password.length,
      sslmode: u.searchParams.get('sslmode') ?? '(not set)',
      suspiciousChars: /[<>"' ]/.test(raw)
        ? 'YES — value contains <, >, quotes or spaces. Remove them.'
        : 'no',
    };
  } catch {
    return { problem: 'DATABASE_URL is not a valid URL — check for stray quotes/spaces' };
  }
}

export async function GET() {
  const started = Date.now();
  const dbUrl = inspectDbUrl(process.env.DATABASE_URL);

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, dbUrl });
  }

  try {
    await db.$queryRaw`select 1`;
    return NextResponse.json({
      ok: true,
      latencyMs: Date.now() - started,
      dbUrl,
      note: 'Database reachable — if login still fails, the problem is elsewhere (paste me this JSON).',
    });
  } catch (e: unknown) {
    const err = e as { name?: string; code?: string; message?: string; meta?: { code?: string } };
    return NextResponse.json({
      ok: false,
      latencyMs: Date.now() - started,
      dbUrl,
      errorName: err?.name ?? 'unknown',
      errorCode: err?.code ?? err?.meta?.code ?? 'none',
      errorMessage: String(err?.message ?? e).slice(0, 400),
    });
  }
}