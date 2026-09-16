// HydraSkript - Manuscript text extraction
// Shared helper for extracting raw text from uploaded manuscript files.

import { existsSync } from 'node:fs'
import { join } from 'node:path'

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
    return extractPdfTextFromBuffer(buffer)
  }

  throw new ManuscriptValidationError(`Unsupported manuscript type: .${extension}`)
}

/**
 * PDF text extraction, shared by manuscript import and the audiobook upload.
 *
 * WHY THIS IS ITS OWN FUNCTION:
 * pdf.js does not parse in the main thread — it spawns a Web Worker from
 * `pdfjs-dist/legacy/build/pdf.worker.mjs`, resolved at RUNTIME. Next.js
 * bundles the app and Vercel ships only the files webpack could see, so that
 * .mjs was missing from the lambda and every PDF upload died with
 *   Setting up fake worker failed: "Cannot find module
 *   '/var/task/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'"
 * which the route then reported as a 500 "The PDF may be corrupted" — sending
 * users off to re-export a perfectly fine file. We now (a) point pdf.js at the
 * worker explicitly so the traced copy in node_modules is used, and (b) tell a
 * server-side gap apart from a genuinely unreadable PDF, because the two need
 * completely different follow-ups.
 */
let pdfWorkerConfigured = false

const PDF_WORKER_RELPATHS = [
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  'pdfjs-dist/build/pdf.worker.mjs',
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  'pdfjs-dist/build/pdf.worker.min.mjs',
]

function configurePdfWorker(PDFParse: { setWorker: (src?: string) => string }): void {
  if (pdfWorkerConfigured) return
  pdfWorkerConfigured = true

  // Absolute on-disk candidates, most reliable first:
  //   1. `<cwd>/node_modules/...` — on Vercel that is exactly
  //      `/var/task/node_modules/...`, and it needs no bundler cooperation.
  //   2. `require.resolve(...)` — covers non-standard install layouts.
  const candidates: string[] = PDF_WORKER_RELPATHS.map((rel) =>
    join(process.cwd(), 'node_modules', rel)
  )
  for (const rel of PDF_WORKER_RELPATHS) {
    try {
      candidates.push(require.resolve(rel))
    } catch {
      // Not installed at that path - try the next candidate.
    }
  }

  for (const candidate of candidates) {
    try {
      if (candidate && existsSync(candidate)) {
        PDFParse.setWorker(candidate)
        return
      }
    } catch {
      // Worker discovery must never be the reason an upload fails.
    }
  }

  console.warn(
    '[manuscript] pdfjs-dist worker file not found on disk; falling back to the package default. ' +
      'PDF uploads will fail with "Setting up fake worker failed" until node_modules/pdfjs-dist is ' +
      'included in the deployment bundle (see next.config.js outputFileTracingIncludes).'
  )
}

export class PdfReadError extends Error {
  /** true when the *server* could not run pdf.js (missing worker), not the file */
  readonly infrastructure: boolean
  constructor(message: string, infrastructure = false) {
    super(message)
    this.name = 'PdfReadError'
    this.infrastructure = infrastructure
  }
}

/**
 * True when a pdf.js failure means "this deployment cannot run the PDF engine"
 * (missing/unloadable worker file) rather than "this file is unreadable".
 * Exported so the wording can be tested without a real PDF.
 */
export function isPdfWorkerUnavailableMessage(message: string): boolean {
  return /fake worker|Cannot find module|pdf\.worker|is not defined/i.test(message)
}

export async function extractPdfTextFromBuffer(buffer: Buffer): Promise<string> {
  let PDFParse: typeof import('pdf-parse')['PDFParse']
  try {
    ;({ PDFParse } = await import('pdf-parse'))
  } catch (importError) {
    const msg = importError instanceof Error ? importError.message : String(importError)
    throw new PdfReadError(`PDF support is unavailable on this server: ${msg}`, true)
  }

  try {
    configurePdfWorker(PDFParse as unknown as { setWorker: (src?: string) => string })
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    try {
      const result = await parser.getText()
      return result.text
    } finally {
      await parser.destroy()
    }
  } catch (pdfError) {
    const msg = pdfError instanceof Error ? pdfError.message : String(pdfError)
    const infra = isPdfWorkerUnavailableMessage(msg)
    console.error('[manuscript] PDF parsing failed:', msg)
    throw new PdfReadError(
      infra
        ? 'The PDF engine could not start on this server (its worker file is missing from the deployment). This is a deploy problem, not a problem with your file — try again in a few minutes, or upload the same manuscript as .docx or .txt.'
        : 'Could not read that PDF. It may be corrupted, password-protected, or a scanned image with no selectable text. Try exporting it again, or upload the manuscript as .docx or .txt.',
      infra
    )
  }
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
