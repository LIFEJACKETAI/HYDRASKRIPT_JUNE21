// HydraSkript - Supabase middleware client
// Must use createServerClient (not createClient from server.ts) because
// middleware runs on the Edge and needs request/response cookie access.

import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do not add logic between createServerClient and getUser().
  // A simple mistake could make it hard to debug issues with users being
  // randomly logged out. getUser() refreshes the session if expired.
  //
  // getUser() can THROW (not just return an error) on transient network
  // failures between the server and Supabase Auth, malformed cookies, or
  // edge-runtime quirks. A throw here bubbles to src/middleware.ts, which
  // answers API routes with a 500 — e.g. users who idle on a review screen
  // past session expiry then click approve get a cryptic 500 instead of a
  // 401 they can recover from by logging in again. Degrade to user: null
  // so the request follows the normal unauthenticated path (401 JSON).
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (e) {
    console.warn('[Supabase Middleware] getUser() threw, treating as unauthenticated:', e instanceof Error ? e.message : e);
    user = null;
  }

  return { supabaseResponse, user };
}
