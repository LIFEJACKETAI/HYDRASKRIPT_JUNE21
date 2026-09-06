/**
 * fetch wrapper with a hard timeout, for Supabase Auth calls made from
 * middleware and API routes.
 *
 * Why: `supabase.auth.getUser()` performs network I/O (and may attempt a
 * session refresh). With the default fetch it can hang indefinitely when the
 * Auth endpoint is unreachable. On serverless that hang runs past the
 * function timeout, and the platform answers with a non-JSON 500 page —
 * surfacing in the UI as a cryptic generic failure instead of a recoverable
 * 401. Capping the wait converts hangs into fast, catchable aborts.
 *
 * Implemented with AbortController + setTimeout (instead of
 * AbortSignal.timeout) for maximum runtime compatibility, including the
 * Edge runtime used by Next.js middleware.
 */
export function fetchWithTimeout(ms = 6000): typeof fetch {
  return (async (url: any, init: any = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`Supabase request timed out after ${ms}ms`)),
      ms
    );
    const callerSignal = init?.signal as AbortSignal | undefined;
    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort(callerSignal.reason);
      } else {
        callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason), {
          once: true,
        });
      }
    }
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }) as typeof fetch;
}
