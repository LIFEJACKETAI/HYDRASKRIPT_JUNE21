// HydraSkript - Storage Utility
// Uses Supabase Storage when configured, with local filesystem fallback for development

import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireStorageConfig } from '@/lib/storage-config';

// ─── Configuration ────────────────────────────────────────────────────────────

const STORAGE_DIR = path.join(process.cwd(), 'public', 'assets');
const PUBLIC_BASE = '/assets';
// Ensure storage directory exists
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Never create directories at module scope. Vercel's deployed application is
// read-only, and importing a worker/service must not break unrelated API routes.
// Local directories are created only by saveFile() in development.

// ─── File Operations ──────────────────────────────────────────────────────────

/**
 * Save a buffer to storage and return the public URL.
 * Uses Supabase Storage in production; local disk is a development-only fallback.
 */
export async function saveFile(
  subfolder: string,
  filename: string,
  buffer: Buffer,
  options?: { contentType?: string }
): Promise<string> {
  const config = requireStorageConfig();
  if (config.driver === 'supabase') {
    const objectPath = `${subfolder}/${filename}`;
    const { error } = await getSupabaseAdmin().storage
      .from(config.bucket)
      .upload(objectPath, buffer, {
        upsert: true,
        contentType: options?.contentType ?? 'application/octet-stream',
      });

    if (error) {
      throw new Error(`Supabase Storage upload to "${config.bucket}" failed: ${error.message}`);
    }

    const { data } = getSupabaseAdmin().storage
      .from(config.bucket)
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
    const config = requireStorageConfig();
    if (config.driver === 'supabase') {
      const marker = `/storage/v1/object/public/${config.bucket}/`;
      const markerIndex = publicUrl.indexOf(marker);

      if (markerIndex === -1) {
        return false;
      }

      const objectPath = publicUrl.slice(markerIndex + marker.length);
      const { error } = await getSupabaseAdmin().storage
        .from(config.bucket)
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
  const config = requireStorageConfig();
  if (config.driver === 'supabase') {
    const marker = `/storage/v1/object/public/${config.bucket}/`;
    const markerIndex = publicUrl.indexOf(marker);

    if (markerIndex === -1) {
      return false;
    }

    const objectPath = publicUrl.slice(markerIndex + marker.length);
    const directory = objectPath.includes('/') ? objectPath.slice(0, objectPath.lastIndexOf('/')) : '';
    const fileName = objectPath.includes('/') ? objectPath.slice(objectPath.lastIndexOf('/') + 1) : objectPath;

    const { data, error } = await getSupabaseAdmin().storage
      .from(config.bucket)
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
