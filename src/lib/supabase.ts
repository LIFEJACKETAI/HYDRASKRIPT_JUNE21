import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Lazy singletons — created on first USE, never at module scope, so importing
// this file during `next build` ("Collecting page data") can't crash the build
// when env vars aren't present. Env is still required at request time.

function readEnv() {
  return {
    supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    supabaseAnonKey:
      process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

let anonClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

// Client for user-facing requests (respects RLS)
export function getSupabase(): SupabaseClient {
  if (!anonClient) {
    const { supabaseUrl, supabaseAnonKey } = readEnv();
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        'SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) are required'
      );
    }
    anonClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return anonClient;
}

// Client for administrative/server-side tasks (bypasses RLS)
export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    const { supabaseUrl, supabaseServiceRoleKey } = readEnv();
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error(
        'SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required'
      );
    }
    adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminClient;
}
