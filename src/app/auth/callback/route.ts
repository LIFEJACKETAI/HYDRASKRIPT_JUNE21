import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const type = searchParams.get('type');

  // Handle email confirmation (signup) - uses code query parameter
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      console.error('Auth callback error:', error);
      return NextResponse.redirect(`${origin}/auth/auth-code-error?error=${encodeURIComponent(error.message)}`);
    }

    // Redirect to the intended destination (or root)
    const redirectTo = next.startsWith('/') ? next : '/';
    return NextResponse.redirect(`${origin}${redirectTo}`);
  }

  // Handle password recovery - uses hash fragment, redirect to client-side recovery handler
  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/auth/recovery`);
  }

  // Return the user to an error page with some query parameters.
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
