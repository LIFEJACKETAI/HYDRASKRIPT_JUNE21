import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client.
 *
 * WHY THE GUARD EXISTS (this cost a whole blocked deployment):
 * `createBrowserClient()` **throws** when the URL/anon key are `undefined`, and
 * the root layout renders `<RecoveryHandler />`, which built a client during
 * render. So on any build whose *env scope* lacks the `NEXT_PUBLIC_SUPABASE_*`
 * vars — the usual case for a preview/branch deployment when they are checked
 * for Production only — `next build` died during static generation:
 *
 *   Failed to compile: app/_not-found/page.tsx
 *   Error occurred prerendering page "/_not-found".
 *   Error: @supabase/ssr: Your project's URL and API key are required...
 *
 * A preview-only env gap therefore looked like a broken build. We now return an
 * inert stub when the vars are missing: auth calls resolve to
 * `{ data: null, error }`, so pages still render and prerender, and the missing
 * config surfaces as a console warning instead of a dead deployment.
 */
const MISSING_CONFIG_ERROR =
  "Supabase is not configured in this environment: set NEXT_PUBLIC_SUPABASE_URL and " +
  "NEXT_PUBLIC_SUPABASE_ANON_KEY for this deployment (on Vercel they must also be enabled " +
  "for Preview/Development, not only Production).";

let warned = false;

export function isSupabaseBrowserConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function createConfiguredClient(url: string, key: string) {
  return createBrowserClient(url, key, {
    cookies: {
      getAll() {
        if (typeof document === "undefined") return [];
        return document.cookie.split("; ").map((cookie) => {
          const [name, ...rest] = cookie.split("=");
          return { name, value: rest.join("=") };
        });
      },
      setAll(cookiesToSet) {
        if (typeof document === "undefined") return;
        cookiesToSet.forEach(({ name, value, options }) => {
          const cookieOptions = [
            `${name}=${value}`,
            `path=${options?.path || "/"}`,
            `max-age=${options?.maxAge || 60 * 60 * 24 * 365}`,
            options?.secure ? "secure" : "",
            options?.sameSite ? `samesite=${options.sameSite}` : "",
          ]
            .filter(Boolean)
            .join("; ");
          document.cookie = cookieOptions;
        });
      },
    },
  });
}

type BrowserSupabaseClient = ReturnType<typeof createConfiguredClient>;

/** Any property access is callable and resolves to a `{ data: null, error }` result. */
function createInertClient(): unknown {
  const call = () => ({ data: null, error: new Error(MISSING_CONFIG_ERROR) });
  return new Proxy(call as unknown as Record<string, unknown>, {
    get(_target, prop) {
      // Deliberately NOT thenable: `supabase.auth.getSession().then(...)` must go
      // through the call trap, and `await client` must not await the proxy itself.
      if (prop === "then" || prop === "catch" || prop === "finally")
        return undefined;
      if (prop === "error") return new Error(MISSING_CONFIG_ERROR);
      if (prop === "data") return null;
      return createInertClient();
    },
    apply() {
      return call();
    },
  });
}

export const createClient = (): BrowserSupabaseClient => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (typeof window !== "undefined" && !warned) {
      warned = true;
      console.warn(`[supabase] ${MISSING_CONFIG_ERROR}`);
    }
    return createInertClient() as BrowserSupabaseClient;
  }

  return createConfiguredClient(url, key);
};
