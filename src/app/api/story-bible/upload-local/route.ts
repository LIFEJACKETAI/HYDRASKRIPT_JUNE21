// HydraSkript - Local Manuscript Upload (Development Only)
// Fallback for local development when no Supabase/R2 is configured.
// Accepts multipart/form-data with the file and saves it locally.
// Returns success; the client then calls /api/story-bible/import-manuscript
// with the storagePath to process the file.

import { NextRequest, NextResponse } from 'next/server';
import { saveFile } from '@/lib/utils/storage';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB for local

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow more time for local processing

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);

    const formData = await request.formData();
    const file = formData.get('file');
    const storagePath = formData.get('storagePath') as string;

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'A manuscript file is required.' }, { status: 400 });
    }

    if (!storagePath || typeof storagePath !== 'string') {
      return NextResponse.json({ success: false, error: 'storagePath is required.' }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 25 MB.` },
        { status: 413 }
      );
    }

    // Save file to local storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await saveFile('', storagePath, buffer);

    console.log(`[API/story-bible/upload-local] Saved file to ${storagePath} (${file.size} bytes)`);

    return NextResponse.json({
      success: true,
      data: {
        storagePath,
        fileName: file.name,
        fileSize: file.size,
      },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API/story-bible/upload-local] Failed:', message, error instanceof Error ? error.stack : '');
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}