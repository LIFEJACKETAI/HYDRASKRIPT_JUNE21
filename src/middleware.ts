import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PROTECTED_PATHS = [
  '/api',
  '/admin',
  '/dashboard',
  '/training',
];

// API paths that must remain reachable without a session (Stripe webhooks,
// health checks). Stripe calls /api/stripe/webhook from outside the app, so it
// must never be subjected to the auth gate.
const PUBLIC_API_PATHS = [
  '/api/health',
  '/api/stripe/webhook',
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
  const { pathname, search } = request.nextUrl;
  
  try {
    const { supabaseResponse, user } = await updateSession(request);

    const isAPI = pathname.startsWith('/api');

    // Handle protected paths - if user is authenticated, allow access
    if (!isProtectedPath(pathname) || isPublicApiPath(pathname) || isPublicAuthPath(pathname)) {
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
