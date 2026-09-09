// Server-only polyfill for the browser DOM globals that pdfjs-dist (used by
// `pdf-parse` to read PDF text) expects to exist.
//
// pdf-parse normally installs these itself from `@napi-rs/canvas` via a
// dynamically `require()`d shim. In a Next.js serverless bundle that dynamic
// require does not resolve the same way, so pdfjs ends up referencing an
// undefined `DOMMatrix` / `Path2D` and PDF uploads fail with
// "DOMMatrix is not defined". Installing the globals here BEFORE pdf-parse is
// imported guarantees they exist (pdf-parse only sets them when missing, so we
// never clobber its own setup).

let polyfilled = false;

export async function ensurePdfCanvasGlobals(): Promise<void> {
  if (polyfilled) return;
  polyfilled = true;

  // Never run in the browser.
  if (typeof window !== 'undefined') return;

  try {
    const canvas = (await import('@napi-rs/canvas')) as typeof import('@napi-rs/canvas');
    const g = globalThis as unknown as Record<string, unknown>;

    if (typeof g.DOMMatrix === 'undefined' && canvas.DOMMatrix) g.DOMMatrix = canvas.DOMMatrix;
    if (typeof g.Path2D === 'undefined' && canvas.Path2D) g.Path2D = canvas.Path2D;
    if (typeof g.ImageData === 'undefined' && canvas.ImageData) g.ImageData = canvas.ImageData;
    const DOMRectCtor = (canvas as unknown as { DOMRect?: unknown }).DOMRect;
    if (typeof g.DOMRect === 'undefined' && DOMRectCtor) {
      g.DOMRect = DOMRectCtor;
    }
    if (typeof g.HTMLCanvasElement === 'undefined' && typeof canvas.createCanvas === 'function') {
      // pdfjs only needs the constructor as a feature-detect for canvas
      // support; a minimal stand-in is enough for text extraction.
      g.HTMLCanvasElement = class HTMLCanvasElement {};
    }
  } catch (err) {
    // If @napi-rs/canvas is unavailable (e.g. an unsupported platform), text
    // extraction for some PDFs may still work because pdfjs only touches these
    // for font/image handling. Log once rather than crashing the whole upload.
    console.warn(
      '[pdfCanvasPolyfill] @napi-rs/canvas unavailable; PDF text extraction may fail:',
      err instanceof Error ? err.message : err
    );
  }
}
