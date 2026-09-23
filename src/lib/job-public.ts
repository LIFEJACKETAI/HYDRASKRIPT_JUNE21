/**
 * Strip oversized manuscript payloads from job.result before sending them to
 * the browser. Import jobs checkpoint the full text in `result.text`; echoing
 * that on every /api/jobs poll (500k+ chars) saturates the function. Upload-mode
 * audiobook jobs similarly keep chapter prose in `result.chapters` for the
 * worker, but the browser only needs progress until the final audio result.
 */
export function publicJobResult(raw: string | null | undefined): unknown {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed;

    const record = parsed as Record<string, unknown>;
    const sanitized = { ...record };

    if (typeof sanitized.text === 'string') {
      delete sanitized.text;
      sanitized.textLength = (record.text as string).length;
    }

    if (Array.isArray(sanitized.chapters)) {
      const chapters = sanitized.chapters as unknown[];
      const containsProse = chapters.some(
        (chapter) =>
          chapter &&
          typeof chapter === 'object' &&
          typeof (chapter as Record<string, unknown>).content === 'string'
      );

      if (containsProse) {
        delete sanitized.chapters;
        sanitized.chapterCount = chapters.length;
      }
    }

    return sanitized;
  } catch {
    return raw;
  }
}
