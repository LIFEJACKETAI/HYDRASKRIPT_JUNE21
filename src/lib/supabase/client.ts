import { createBrowserClient } from '@supabase/ssr'

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
