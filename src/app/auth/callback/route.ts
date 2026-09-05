import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function safePath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/dashboard';
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safePath(searchParams.get('next'));
  const type = searchParams.get('type');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Auth callback error:', error);
      return NextResponse.redirect(
        `${origin}/auth/auth-code-error?error=${encodeURIComponent(error.message)}`
      );
    }

    return NextResponse.redirect(`${origin}${next}`);
  }

  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/auth/recovery`);
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
