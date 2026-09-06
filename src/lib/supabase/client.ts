import { createBrowserClient, type SupabaseClient } from '@supabase/ssr'

export const createClient = (): SupabaseClient => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    // Server-side prerender without env (e.g. `next build` "Generating static
    // pages" runs component bodies, including RecoveryHandler in the root
    // layout). Prerender never USES the client — all calls happen in effects
    // and event handlers — so hand back a placeholder that only throws if
    // something actually touches it. Real misconfiguration still fails loudly
    // in the browser, where `window` exists.
    if (typeof window === 'undefined') {
      return new Proxy({} as SupabaseClient, {
        get(_target, prop) {
          if (prop === 'then') return undefined
          throw new Error(
            'Supabase env (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY) is not configured'
          )
        },
      })
    }
    throw new Error(
      'Supabase env (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY) is not configured'
    )
  }

  return createBrowserClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          if (typeof document === 'undefined') return []
          return document.cookie.split('; ').map((cookie) => {
            const [name, ...rest] = cookie.split('=')
            return { name, value: rest.join('=') }
          })
        },
        setAll(cookiesToSet) {
          if (typeof document === 'undefined') return
          cookiesToSet.forEach(({ name, value, options }) => {
            const cookieOptions = [
              `${name}=${value}`,
              `path=${options?.path || '/'}`,
              `max-age=${options?.maxAge || 60 * 60 * 24 * 365}`,
              options?.secure ? 'secure' : '',
              options?.sameSite ? `samesite=${options.sameSite}` : '',
            ]
              .filter(Boolean)
              .join('; ')
            document.cookie = cookieOptions
          })
        },
      },
    }
  )
}
