// HydraSkript - Manuscript text extraction
// Shared helper for extracting raw text from uploaded manuscript files.

export const SUPPORTED_MANUSCRIPT_EXTENSIONS = new Set(['txt', 'pdf', 'docx']);

// Vercel rejects any Serverless Function request body larger than 4.5 MB before
// the handler ever runs, so accepting more than that only produces a platform
// error the app cannot explain to the user. Keep this in sync with the client
// side guard in `src/lib/api.ts` (`MAX_MANUSCRIPT_UPLOAD_BYTES`).
export const MAX_MANUSCRIPT_UPLOAD_BYTES = 4.5 * 1024 * 1024;

// The head of the manuscript is what the entity-extraction prompt receives;
// everything up to this cap is handed to the background editorial review.
export const MAX_MANUSCRIPT_CHARS = 80_000;

export function manuscriptUploadLimitMessage(sizeBytes: number): string {
  return (
    `That file is ${(sizeBytes / 1024 / 1024).toFixed(1)} MB — uploads are limited to 4.5 MB. ` +
    `Re-save the manuscript as a plain .txt (or a text-based PDF rather than a scan) and try again.`
  );
}

export async function extractTextFromManuscript(file: File, extension: string): Promise<string> {
  if (extension === 'txt') {
    return file.text();
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (extension === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (extension === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });

    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  throw new Error(`Unsupported manuscript type: .${extension}`);
}

export function truncateManuscript(text: string, maxChars = MAX_MANUSCRIPT_CHARS): string {
  const sanitized = text.replace(/\u0000/g, '').trim();
  if (!sanitized) return '';
  if (sanitized.length <= maxChars) return sanitized;
  return sanitized.slice(0, maxChars);
}
