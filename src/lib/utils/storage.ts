// HydraSkript - Storage Utility
// Uses Supabase Storage when configured, with local filesystem fallback for development

import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';

// ─── Configuration ────────────────────────────────────────────────────────────

// On serverless (Vercel/Lambda) the application directory (/var/task) is
// READ-ONLY and `public/` is served from the CDN, not present at runtime.
// Writing there throws ENOENT/EROFS — the root cause of the
// "mkdir '/var/task/public/assets/covers'" 500s. In production the primary path
// is Supabase Storage; the local-disk fallback must target the writable /tmp
// volume there instead of public/. Local dev keeps writing to public/assets so
// files are visible at http://localhost:PORT/assets/...
const isServerlessRuntime = Boolean(
  process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV ||
    process.env.FUNCTION_TARGET
);

const STORAGE_DIR = isServerlessRuntime
  ? path.join('/tmp', 'hydraskript-assets')
  : path.join(process.cwd(), 'public', 'assets');
const PUBLIC_BASE = '/assets';
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'hydraskript-assets';

function isSupabaseStorageEnabled() {
  return Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    SUPABASE_STORAGE_BUCKET
  );
}

// Ensure storage directory exists.
// NOTE: This must ONLY ever run lazily (inside a function), never at module
// load. A top-level mkdir here previously crashed EVERY serverless function
// whose import graph touched this module: Vercel's runtime filesystem is
// read-only outside /tmp, so mkdirSync threw ENOENT and the route returned a
// non-JSON 500 before its handler ran. Production file writes must go to
// Supabase Storage (see isSupabaseStorageEnabled); local disk is dev-only.
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      throw new Error(
        `Cannot create local storage directory "${dir}". Server filesystems ` +
          `are read-only in production — configure SUPABASE_URL, ` +
          `SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET so uploads ` +
          `use Supabase Storage instead. Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
}

// ─── File Operations ──────────────────────────────────────────────────────────

/**
 * Save a buffer to storage and return the public URL.
 * Prefers Supabase Storage when configured, otherwise falls back to local disk.
 */
export async function saveFile(
  subfolder: string,
  filename: string,
  buffer: Buffer,
  options?: { contentType?: string }
): Promise<string> {
  if (isSupabaseStorageEnabled()) {
    const objectPath = `${subfolder}/${filename}`;
    const { error } = await supabaseAdmin.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(objectPath, buffer, {
        upsert: true,
        contentType: options?.contentType ?? 'application/octet-stream',
      });

    if (error) {
      throw new Error(`Supabase storage upload failed: ${error.message}`);
    }

    const { data } = supabaseAdmin.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .getPublicUrl(objectPath);

    return data.publicUrl;
  }

  const dir = path.join(STORAGE_DIR, subfolder);
  ensureDir(dir);

  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);

  return `${PUBLIC_BASE}/${subfolder}/${filename}`;
}

/**
 * Save a base64-encoded file to storage and return the public URL.
 */
export async function saveBase64File(
  subfolder: string,
  filename: string,
  base64Data: string,
  options?: { contentType?: string }
): Promise<string> {
  const buffer = Buffer.from(base64Data, 'base64');
  return saveFile(subfolder, filename, buffer, options);
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(publicUrl: string): Promise<boolean> {
  try {
    if (isSupabaseStorageEnabled()) {
      const marker = `/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/`;
      const markerIndex = publicUrl.indexOf(marker);

      if (markerIndex === -1) {
        return false;
      }

      const objectPath = publicUrl.slice(markerIndex + marker.length);
      const { error } = await supabaseAdmin.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .remove([objectPath]);

      if (error) {
        console.error('[Storage] Supabase delete failed:', error.message);
        return false;
      }

      return true;
    }

    const relativePath = publicUrl.replace(PUBLIC_BASE, '');
    const filePath = path.join(STORAGE_DIR, relativePath);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[Storage] Delete failed:', error);
    return false;
  }
}

/**
 * Check if a file exists in storage.
 */
export async function fileExists(publicUrl: string): Promise<boolean> {
  if (isSupabaseStorageEnabled()) {
    const marker = `/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/`;
    const markerIndex = publicUrl.indexOf(marker);

    if (markerIndex === -1) {
      return false;
    }

    const objectPath = publicUrl.slice(markerIndex + marker.length);
    const directory = objectPath.includes('/') ? objectPath.slice(0, objectPath.lastIndexOf('/')) : '';
    const fileName = objectPath.includes('/') ? objectPath.slice(objectPath.lastIndexOf('/') + 1) : objectPath;

    const { data, error } = await supabaseAdmin.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .list(directory, { search: fileName });

    if (error) {
      console.error('[Storage] Supabase exists check failed:', error.message);
      return false;
    }

    return (data ?? []).some((file) => file.name === fileName);
  }

  const relativePath = publicUrl.replace(PUBLIC_BASE, '');
  const filePath = path.join(STORAGE_DIR, relativePath);
  return fs.existsSync(filePath);
}

/**
 * Generate a unique filename with timestamp.
 */
export function generateFilename(prefix: string, extension: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}.${extension}`;
}

// ─── Media Asset Database Records ─────────────────────────────────────────────

/**
 * Create a media asset record in the database.
 */
export async function createMediaAsset(params: {
  ownerId: string;
  bookId?: string;
  assetType: string;
  storagePath: string;
  publicUrl: string;
  metadata?: Record<string, unknown>;
}) {
  return db.mediaAsset.create({
    data: {
      ownerId: params.ownerId,
      bookId: params.bookId,
      assetType: params.assetType,
      storagePath: params.storagePath,
      publicUrl: params.publicUrl,
      metadata: JSON.stringify(params.metadata ?? {}),
    },
  });
}
