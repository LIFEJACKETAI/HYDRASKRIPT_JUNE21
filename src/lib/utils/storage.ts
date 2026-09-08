// HydraSkript - Storage Utility
// Priority: Cloudflare R2 → Supabase Storage → local filesystem (dev only)

import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@/lib/db';

// ─── Configuration ────────────────────────────────────────────────────────────

const STORAGE_DIR = path.join(process.cwd(), 'public', 'assets');
const PUBLIC_BASE = '/assets';
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'hydraskript-assets';

// ─── Cloudflare R2 ──────────────────────────────────────────────────────────

function isR2Enabled() {
  return Boolean(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_KEY);
}

let _r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!_r2Client) {
    _r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _r2Client;
}

function getR2PublicUrl(): string {
  // Public base URL used for browser-facing asset URLs (custom domain or
  // r2.dev). Never include a trailing slash.
  return (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
}

/** The private S3-compatible object URL for a given key. */
function r2ObjectUrl(key: string): string {
  return `https://${process.env.R2_BUCKET_KEY}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
}

/**
 * Build the URL that gets stored/returned for an uploaded R2 object.
 * Prefer the public base URL (custom domain / r2.dev) so images and downloads
 * work in the browser. If none is configured, fall back to the private S3
 * endpoint URL — the download route detects this and streams via a signed
 * GetObject call instead.
 */
function r2PublicUrlForKey(key: string): string {
  const base = getR2PublicUrl();
  if (base) return `${base}/${key}`;
  return r2ObjectUrl(key);
}

/**
 * Extract the R2 object key from a stored URL, or null if the URL isn't R2.
 * Handles both the public base URL (custom domain / r2.dev) and the private
 * S3 endpoint URL (`.r2.cloudflarestorage.com`).
 */
export function extractR2Key(url: string): string | null {
  if (!url) return null;
  try {
    if (url.includes('.r2.cloudflarestorage.com')) {
      return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
    }
    const base = getR2PublicUrl();
    if (base && url.startsWith(base + '/')) {
      return decodeURIComponent(url.slice(base.length + 1));
    }
  } catch {
    // fall through — treat as non-R2
  }
  return null;
}

export function isR2StoredUrl(url: string): boolean {
  return isR2Enabled() && extractR2Key(url) !== null;
}

/**
 * Download an R2 object's bytes via a signed S3 GetObject call. This works
 * regardless of whether the bucket has public access enabled, and is used by
 * the export download route as a fallback when no public URL is configured.
 */
export async function downloadR2Object(key: string): Promise<Buffer | null> {
  if (!isR2Enabled()) return null;
  try {
    const client = getR2Client();
    const res = await client.send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_KEY,
      Key: key,
    }));
    const body = res.Body as unknown as AsyncIterable<Uint8Array> | undefined;
    if (!body) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch (e) {
    console.error('[Storage] R2 download failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

// ─── Supabase Storage ───────────────────────────────────────────────────────

function isSupabaseStorageEnabled() {
  return Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    SUPABASE_STORAGE_BUCKET
  );
}

// Lazy import to avoid circular dependency at module load
async function getSupabaseAdmin() {
  const { supabaseAdmin } = await import('@/lib/supabase');
  return supabaseAdmin;
}

// ─── Local filesystem (dev only) ────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      throw new Error(
        `Cannot create local storage directory "${dir}". Server filesystems ` +
          `are read-only in production — configure R2 or Supabase Storage. ` +
          `Original error: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
}

// ─── File Operations ──────────────────────────────────────────────────────────

/**
 * Save a buffer to storage and return the public URL.
 * Priority: Cloudflare R2 → Supabase Storage → local disk.
 */
export async function saveFile(
  subfolder: string,
  filename: string,
  buffer: Buffer,
  options?: { contentType?: string }
): Promise<string> {
  const contentType = options?.contentType ?? 'application/octet-stream';

  // 1. Cloudflare R2
  if (isR2Enabled()) {
    const key = `${subfolder}/${filename}`;
    const client = getR2Client();
    await client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_KEY,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
    const publicUrl = r2PublicUrlForKey(key);
    console.log(`[Storage] Uploaded to R2: ${key}`);
    return publicUrl;
  }

  // 2. Supabase Storage
  if (isSupabaseStorageEnabled()) {
    const supabase = await getSupabaseAdmin();
    const objectPath = `${subfolder}/${filename}`;
    const { error } = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(objectPath, buffer, {
        upsert: true,
        contentType,
      });

    if (error) {
      throw new Error(`Supabase storage upload failed: ${error.message}`);
    }

    const { data } = supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .getPublicUrl(objectPath);

    console.log(`[Storage] Uploaded to Supabase: ${objectPath}`);
    return data.publicUrl;
  }

  // 3. Local filesystem (dev only)
  const dir = path.join(STORAGE_DIR, subfolder);
  ensureDir(dir);
  const filePath = path.join(dir, filename);
  try {
    fs.writeFileSync(filePath, buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Cannot write file to local storage ("${filePath}"). Server filesystems ` +
        `are read-only in production — configure R2 or Supabase Storage. ` +
        `Original error: ${msg}`
    );
  }
  console.log(`[Storage] Saved locally: ${filePath}`);
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
    // R2 — public base URL (custom domain / r2.dev) or private S3 endpoint URL
    const r2Key = extractR2Key(publicUrl);
    if (r2Key) {
      const client = getR2Client();
      await client.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_KEY,
        Key: r2Key,
      }));
      console.log(`[Storage] Deleted from R2: ${r2Key}`);
      return true;
    }

    // Supabase URLs
    if (isSupabaseStorageEnabled()) {
      const supabase = await getSupabaseAdmin();
      const marker = `/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/`;
      const markerIndex = publicUrl.indexOf(marker);
      if (markerIndex === -1) return false;

      const objectPath = publicUrl.slice(markerIndex + marker.length);
      const { error } = await supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .remove([objectPath]);

      if (error) {
        console.error('[Storage] Supabase delete failed:', error.message);
        return false;
      }
      return true;
    }

    // Local filesystem
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
  try {
    // R2 — use HEAD request
    const r2Key = extractR2Key(publicUrl);
    if (r2Key) {
      const client = getR2Client();
      try {
        await client.send(new HeadObjectCommand({
          Bucket: process.env.R2_BUCKET_KEY,
          Key: r2Key,
        }));
        return true;
      } catch {
        return false;
      }
    }

    // Supabase
    if (isSupabaseStorageEnabled()) {
      const supabase = await getSupabaseAdmin();
      const marker = `/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/`;
      const markerIndex = publicUrl.indexOf(marker);
      if (markerIndex === -1) return false;

      const objectPath = publicUrl.slice(markerIndex + marker.length);
      const directory = objectPath.includes('/') ? objectPath.slice(0, objectPath.lastIndexOf('/')) : '';
      const fileName = objectPath.includes('/') ? objectPath.slice(objectPath.lastIndexOf('/') + 1) : objectPath;

      const { data, error } = await supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .list(directory, { search: fileName });

      if (error) return false;
      return (data ?? []).some((file) => file.name === fileName);
    }

    // Local filesystem
    const relativePath = publicUrl.replace(PUBLIC_BASE, '');
    const filePath = path.join(STORAGE_DIR, relativePath);
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
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
