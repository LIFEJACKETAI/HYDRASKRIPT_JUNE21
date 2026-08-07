import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PROTECTED_PATHS = [
  '/api',
  '/admin',
  '/dashboard',
  '/training',
];

const PUBLIC_API_PATHS = [
  '/api/route',
  '/api/health',
];

function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isPublicApiPath(pathname: string) {
  return PUBLIC_API_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { supabaseResponse, user } = await updateSession(request);

  const isAPI = pathname.startsWith('/api');

  // Handle protected paths - if user is authenticated, allow access
  if (!isProtectedPath(pathname) || isPublicApiPath(pathname)) {
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
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
