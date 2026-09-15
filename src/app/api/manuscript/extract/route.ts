// HydraSkript - Extract plain text from an uploaded manuscript (style training, etc.)
// POST multipart/form-data with `file`. Returns { text } — no queue, no LLM.

import { NextRequest, NextResponse } from 'next/server';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';
import {
  extractTextFromBuffer,
  SUPPORTED_MANUSCRIPT_EXTENSIONS,
  truncateManuscript,
  ManuscriptValidationError,
} from '@/lib/manuscript';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_EXEMPLAR_CHARS = 20000;

export async function POST(request: NextRequest) {
  try {
    await requireProfile(request);

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'A manuscript file is required.' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: 'That file is over 4 MB. Convert to .txt or split it first.' },
        { status: 413 }
      );
    }

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!SUPPORTED_MANUSCRIPT_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { success: false, error: 'Unsupported file type. Please upload a .txt, .pdf, or .docx file.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const raw = await extractTextFromBuffer(buffer, extension);
    const text = truncateManuscript(raw, MAX_EXEMPLAR_CHARS);
    if (!text) {
      return NextResponse.json(
        { success: false, error: `Uploaded ${extension.toUpperCase()} file did not contain readable text.` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { text, fileName: file.name, truncated: raw.trim().length > MAX_EXEMPLAR_CHARS },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse();
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = error instanceof ManuscriptValidationError ? error.status : 500;
    console.error('[API/manuscript/extract] Failed:', message);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
