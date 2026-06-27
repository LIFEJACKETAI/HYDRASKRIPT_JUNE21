// HydraSkript - Edge Middleware
// 1. Refreshes Supabase session cookies on every request (required by @supabase/ssr)
// 2. Protects all /api/* routes — returns 401 JSON if no valid session
// 3. Protects all dashboard pages — redirects to /login if no valid session

import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// ── Public routes — no auth required ──────────────────────────────────────────
const PUBLIC_API = [
  /^\/api\/auth\//,        // Supabase auth callbacks
  /^\/api\/health$/,       // health check
  /^\/api\/webhooks\//,    // Stripe / external webhooks
];

const PUBLIC_PAGES = [
  /^\/$/,                  // landing page
  /^\/login/,
  /^\/register/,
  /^\/auth\//,             // /auth/callback, /auth/auth-code-error
  /^\/_next\//,            // Next.js internals
  /^\/favicon/,
  /^\/stitch\//,           // public stitch gallery static files
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Always refresh the Supabase session (cookie rotation) ─────────────────
  // This must happen for every request so tokens don't expire mid-session.
  const { supabaseResponse, user } = await updateSession(request);

  // ── API route protection ───────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    // Let public API routes through
    if (PUBLIC_API.some((re) => re.test(pathname))) {
      return supabaseResponse;
    }

    // No valid session → 401 JSON (not a redirect, because these are XHR calls)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized', code: 'SESSION_REQUIRED' },
        { status: 401 }
      );
    }

    // Valid session — stamp the verified email so route handlers can trust it
    // without hitting Supabase again (avoids double round-trip per request).
    const response = NextResponse.next({ request });
    // Copy refreshed cookies from supabaseResponse
    supabaseResponse.cookies.getAll().forEach(({ name, value }) => {
      response.cookies.set(name, value);
    });
    response.headers.set('x-user-email', user.email ?? '');
    response.headers.set('x-user-id', user.id ?? '');
    return response;
  }

  // ── Page route protection ──────────────────────────────────────────────────
  if (PUBLIC_PAGES.some((re) => re.test(pathname))) {
    return supabaseResponse;
  }

  // Protected page — redirect to login with return URL
  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  // Run on everything except Next.js internals and static files
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)',
  ],
};
