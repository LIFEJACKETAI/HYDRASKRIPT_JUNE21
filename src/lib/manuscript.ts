// HydraSkript - Manuscript text extraction
// Shared helper for extracting raw text from uploaded manuscript files.

// CRITICAL: Import DOMMatrix polyfill BEFORE pdf-parse/pdfjs-dist
import '@/lib/dom-matrix-polyfill';

export const SUPPORTED_MANUSCRIPT_EXTENSIONS = new Set(['txt', 'pdf', 'docx']);

export async function extractTextFromManuscript(file: File, extension: string): Promise<string> {
  if (extension === 'txt') {
    return file.text();
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return extractTextFromBuffer(buffer, extension);
}

/**
 * Extract text from a Buffer (for files downloaded from storage).
 * Used by the import-manuscript worker when processing presigned URL uploads.
 */
export async function extractTextFromBuffer(buffer: Buffer, extension: string): Promise<string> {
  if (extension === 'txt') {
    return buffer.toString('utf-8');
  }

  if (extension === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (extension === 'pdf') {
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer) });

      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy();
      }
    } catch (pdfError) {
      const msg = pdfError instanceof Error ? pdfError.message : String(pdfError);
      console.error('[extractTextFromBuffer] PDF parsing failed:', msg);
      throw new Error(`Failed to parse PDF: ${msg}. The PDF may be corrupted, password-protected, or use unsupported features.`);
    }
  }

  throw new Error(`Unsupported manuscript type: .${extension}`);
}

export function truncateManuscript(text: string, maxChars = 80000): string {
  const sanitized = text.replace(/\u0000/g, '').trim();
  if (!sanitized) return '';
  if (sanitized.length <= maxChars) return sanitized;
  return sanitized.slice(0, maxChars);
}
