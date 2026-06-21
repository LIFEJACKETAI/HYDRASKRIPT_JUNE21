// HydraSkript - Storage Utility
// Manages local file storage for generated assets (images, PDFs, audio)
// Replaces Cloudflare R2 with local file system in the sandbox

import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';

// ─── Configuration ────────────────────────────────────────────────────────────

const STORAGE_DIR = path.join(process.cwd(), 'public', 'assets');
const PUBLIC_BASE = '/assets';

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
 * Save a buffer to local storage and return the public URL.
 */
export function saveFile(
  subfolder: string,
  filename: string,
  buffer: Buffer
): string {
  const dir = path.join(STORAGE_DIR, subfolder);
  ensureDir(dir);

  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);

  return `${PUBLIC_BASE}/${subfolder}/${filename}`;
}

/**
 * Save a base64-encoded file to local storage and return the public URL.
 */
export function saveBase64File(
  subfolder: string,
  filename: string,
  base64Data: string
): string {
  const buffer = Buffer.from(base64Data, 'base64');
  return saveFile(subfolder, filename, buffer);
}

/**
 * Delete a file from local storage.
 */
export function deleteFile(publicUrl: string): boolean {
  try {
    // Convert public URL back to file path
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
 * Check if a file exists in local storage.
 */
export function fileExists(publicUrl: string): boolean {
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
