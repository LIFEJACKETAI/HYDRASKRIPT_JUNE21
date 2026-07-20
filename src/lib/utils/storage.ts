// HydraSkript - Storage Utility
// Uses Supabase Storage when configured, with local filesystem fallback for development

import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';

// ─── Configuration ────────────────────────────────────────────────────────────

const STORAGE_DIR = path.join(process.cwd(), 'public', 'assets');
const PUBLIC_BASE = '/assets';
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'hydraskript-assets';

function isSupabaseStorageEnabled() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    SUPABASE_STORAGE_BUCKET
  );
}

// Ensure storage directory exists
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Initialize storage on module load
ensureDir(STORAGE_DIR);
ensureDir(path.join(STORAGE_DIR, 'covers'));
ensureDir(path.join(STORAGE_DIR, 'illustrations'));
ensureDir(path.join(STORAGE_DIR, 'pdfs'));
ensureDir(path.join(STORAGE_DIR, 'audio'));

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
