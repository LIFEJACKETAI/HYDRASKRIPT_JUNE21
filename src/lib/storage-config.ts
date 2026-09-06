// Configuration only: importing this module must not initialize clients, touch
// the filesystem, or contact Supabase (including from /api/health).
export function getStorageConfig() {
  // Match the URL fallback used by getSupabaseAdmin(). Deployments following
  // .env.example only set NEXT_PUBLIC_SUPABASE_URL, which is valid on the server.
  const configured = Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const localAllowed = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;

  return {
    driver: configured ? 'supabase' : localAllowed ? 'local' : 'unconfigured',
    bucket: process.env.SUPABASE_STORAGE_BUCKET || 'hydraskript-assets',
  } as const;
}

export function requireStorageConfig() {
  const config = getStorageConfig();
  if (config.driver === 'unconfigured') {
    throw new Error(
      'Persistent storage is not configured. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) ' +
      'and SUPABASE_SERVICE_ROLE_KEY, and provision the Supabase Storage bucket named by ' +
      'SUPABASE_STORAGE_BUCKET (default: hydraskript-assets). Local file storage is only available in development.'
    );
  }
  return config;
}
