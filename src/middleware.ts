import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PROTECTED_PATHS = [
  '/api',
  '/admin',
  '/dashboard',
  '/training',
];

// API paths that must remain reachable without a Supabase session. Where
// authentication is required, the endpoint performs its own check (Stripe
// signature / queue secret), so these paths must never use the browser gate.
//
// The queue pump is called by Vercel Cron and by server-to-server self-kicks.
// Neither caller has a browser cookie; leaving it out of this list returns the
// middleware's "Authentication required" before the pump route can inspect its
// own secret, so every queued job eventually stalls.
const PUBLIC_API_PATHS = [
  '/api/health',
  '/api/stripe/webhook',
  '/api/queue/pump',
];

// Auth entry points that should never be blocked/redirected by the auth gate.
const PUBLIC_AUTH_PATHS = [
  '/login',
  '/auth/callback',
  '/auth/auth-code-error',
  '/auth/forgot-password',
  '/auth/update-password',
  '/auth/recovery',
];

function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isPublicApiPath(pathname: string) {
  return PUBLIC_API_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isPublicAuthPath(pathname: string) {
  return PUBLIC_AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Do not make server-to-server endpoints depend on Supabase Auth being
  // configured or reachable. The route itself performs its own authentication.
  // This is intentionally before updateSession(): a cron/self-kick has no
  // cookie, and a Supabase outage must not disable the queue driver.
  if (isPublicApiPath(pathname)) {
    return NextResponse.next({ request });
  }

  try {
    const { supabaseResponse, user } = await updateSession(request);

    const isAPI = pathname.startsWith('/api');

    // Handle protected paths - if user is authenticated, allow access
    if (!isProtectedPath(pathname) || isPublicAuthPath(pathname)) {
      return supabaseResponse;
    }

    // Always return JSON responses for unauthorized API access
    // This ensures apiFetch receives valid JSON instead of HTML redirects
    if (!user) {
      if (isAPI) {
        // Return JSON for API routes to prevent HTML parsing errors
        return NextResponse.json({
          success: false,
          error: 'Authentication required'
        }, { status: 401 });
      }

      // For non-API routes, redirect to login page
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }

    return supabaseResponse;
  } catch (error) {
    console.error('[Middleware] Error:', error);
    const isAPI = pathname.startsWith('/api');
    if (isAPI) {
      return NextResponse.json({ success: false, error: 'Authentication error' }, { status: 500 });
    }
    if (isPublicAuthPath(pathname) || !isProtectedPath(pathname)) {
      return NextResponse.next({ request });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
