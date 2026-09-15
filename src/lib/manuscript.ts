// HydraSkript - Manuscript text extraction
// Shared helper for extracting raw text from uploaded manuscript files.

// CRITICAL: Import DOMMatrix polyfill BEFORE pdf-parse/pdfjs-dist
import '@/lib/dom-matrix-polyfill'

export const SUPPORTED_MANUSCRIPT_EXTENSIONS = new Set(['txt', 'pdf', 'docx'])

export class ManuscriptValidationError extends Error {
  status = 400 as const
  constructor(message: string) {
    super(message)
    this.name = 'ManuscriptValidationError'
  }
}

export async function extractTextFromManuscript(file: File, extension: string): Promise<string> {
  if (extension === 'txt') {
    return file.text()
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  return extractTextFromBuffer(buffer, extension)
}

/**
 * Extract text from a Buffer (for files downloaded from storage).
 * Used by the import-manuscript worker when processing presigned URL uploads.
 */
export async function extractTextFromBuffer(buffer: Buffer, extension: string): Promise<string> {
  if (extension === 'txt') {
    return buffer.toString('utf-8')
  }

  if (extension === 'docx') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  if (extension === 'pdf') {
    try {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: new Uint8Array(buffer) })

      try {
        const result = await parser.getText()
        return result.text
      } finally {
        await parser.destroy()
      }
    } catch (pdfError) {
      const msg = pdfError instanceof Error ? pdfError.message : String(pdfError)
      console.error('[extractTextFromBuffer] PDF parsing failed:', msg)
      throw new Error(
        `Failed to parse PDF: ${msg}. The PDF may be corrupted, password-protected, or use unsupported features.`
      )
    }
  }

  throw new ManuscriptValidationError(`Unsupported manuscript type: .${extension}`)
}

export function truncateManuscript(text: string, maxChars = 80000): string {
  const sanitized = text.replace(/\u0000/g, '').trim()
  if (!sanitized) return ''
  if (sanitized.length <= maxChars) return sanitized
  return sanitized.slice(0, maxChars)
}

const CHAPTER_HEADING_RE =
  /^\s*(?:chapter|prologue|epilogue|part|act|book)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|[ivxlcdm]+|\d{1,3})\b.*$/i

export interface ManuscriptChapter {
  title: string
  content: string
}

/**
 * Split a manuscript into chapters using common heading patterns so an
 * uploaded book can be exported as PDF/EPUB/DOCX (not just mined for lore).
 */
export function splitManuscriptIntoChapters(text: string): ManuscriptChapter[] {
  const cleaned = text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim()
  if (!cleaned) return []

  const lines = cleaned.split('\n')
  const starts: { line: number; title: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    if (CHAPTER_HEADING_RE.test(lines[i])) {
      starts.push({ line: i, title: lines[i].trim().slice(0, 120) })
    }
  }

  if (starts.length === 0) {
    return [{ title: 'Manuscript', content: cleaned }]
  }

  const chapters: ManuscriptChapter[] = []
  if (starts[0].line > 0) {
    const prologue = lines.slice(0, starts[0].line).join('\n').trim()
    if (prologue.length > 200) {
      chapters.push({ title: 'Prologue', content: prologue })
    }
  }

  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].line
    const to = i + 1 < starts.length ? starts[i + 1].line : lines.length
    const blockLines = lines.slice(from, to)
    const title = starts[i].title || `Chapter ${i + 1}`
    const body = blockLines.slice(1).join('\n').trim() || blockLines.join('\n').trim()
    chapters.push({ title, content: body })
  }

  return chapters
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}
