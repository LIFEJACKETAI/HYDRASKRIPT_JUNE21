import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for server-side storage operations.
 *
 * Auth is handled by NextAuth, but we still need Supabase Storage for
 * manuscript/story-bible file access. Both clients below are built LAZILY:
 * `@supabase/supabase-js` refuses to construct without a URL and key, and
 * these modules used to do that at import time, which killed `next build`
 * for any deployment whose env scope didn't carry the `SUPABASE_*` vars
 * (Vercel collects page data for every route, including on previews).
 * Resolving on first property access keeps importing this module cheap and
 * safe, while still failing loudly — with the variable names — if a caller
 * actually tries to talk to Supabase without configuration.
 */
interface LazyClientOptions {
  urlKey: string;
  apiKey: string;
}

function createLazySupabaseClient({
  urlKey,
  apiKey,
}: LazyClientOptions): SupabaseClient {
  let client: SupabaseClient | null = null;

  const resolve = (): SupabaseClient => {
    if (client) return client;
    const url = process.env[urlKey];
    const key = process.env[apiKey];
    if (!url || !key) {
      throw new Error(
        `Missing Supabase configuration: set ${urlKey} and ${apiKey} (this deployment's environment has neither).`,
      );
    }
    client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    return client;
  };

  return new Proxy({} as SupabaseClient, {
    get: (_target, property) => resolve()[property as keyof SupabaseClient],
  });
}

export const supabase = createLazySupabaseClient({
  urlKey: "NEXT_PUBLIC_SUPABASE_URL",
  apiKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
});

export const supabaseAdmin = createLazySupabaseClient({
  urlKey: "NEXT_PUBLIC_SUPABASE_URL",
  apiKey: "SUPABASE_SERVICE_ROLE_KEY",
});
