// HydraSkript - Storage Utility
// Priority: Cloudflare R2 → Supabase Storage → local filesystem (dev only)

import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
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
  return process.env.R2_PUBLIC_URL || '';
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
    const publicUrl = `${getR2PublicUrl()}/${key}`;
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
  fs.writeFileSync(filePath, buffer);
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
    // R2 URLs contain the bucket key
    if (isR2Enabled() && publicUrl.includes('.r2.cloudflarestorage.com')) {
      const r2Base = getR2PublicUrl();
      const key = publicUrl.replace(r2Base + '/', '');
      const client = getR2Client();
      await client.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_KEY,
        Key: key,
      }));
      console.log(`[Storage] Deleted from R2: ${key}`);
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
    if (isR2Enabled() && publicUrl.includes('.r2.cloudflarestorage.com')) {
      const r2Base = getR2PublicUrl();
      const key = publicUrl.replace(r2Base + '/', '');
      const client = getR2Client();
      try {
        await client.send(new HeadObjectCommand({
          Bucket: process.env.R2_BUCKET_KEY,
          Key: key,
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
