// HydraSkript - Manuscript text extraction
// Shared helper for extracting raw text from uploaded manuscript files.

export const SUPPORTED_MANUSCRIPT_EXTENSIONS = new Set(['txt', 'pdf', 'docx']);

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

export function truncateManuscript(text: string, maxChars = 80000): string {
  const sanitized = text.replace(/\u0000/g, '').trim();
  if (!sanitized) return '';
  if (sanitized.length <= maxChars) return sanitized;
  return sanitized.slice(0, maxChars);
}
