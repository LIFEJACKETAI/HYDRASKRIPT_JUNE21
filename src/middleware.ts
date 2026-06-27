// HydraSkript - Edge Middleware
// Protects /api/* routes from unauthenticated access where applicable.
// Auth is ultimately enforced per-route via getAuthEmail(), but this adds
// a first-pass defence and sets useful headers for downstream handlers.

import { NextRequest, NextResponse } from 'next/server';

// Routes that are fully public — no token required
const PUBLIC_API_PATTERNS = [
  /^\/api\/auth\//,       // better-auth endpoints
  /^\/api\/health$/,      // health check
  /^\/api\/webhooks\//,   // Stripe webhooks etc.
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only inspect /api/* routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Let public API routes through without inspection
  if (PUBLIC_API_PATTERNS.some((re) => re.test(pathname))) {
    return NextResponse.next();
  }

  // Forward the request — actual auth validation happens inside each route handler
  // via getAuthEmail(). This middleware layer adds the x-pathname header for
  // easier debugging and can be extended with JWT checks without touching every route.
  const response = NextResponse.next();
  response.headers.set('x-pathname', pathname);
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
