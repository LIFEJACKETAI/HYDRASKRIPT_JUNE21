/**
 * Strip oversized manuscript payloads from job.result before sending them to
 * the browser. Import jobs checkpoint the full text in `result.text`; echoing
 * that on every /api/jobs poll (500k+ chars) saturates the function and is
 * what turns a healthy 200 into a hanging GET (`---` in Vercel logs).
 */
export function publicJobResult(raw: string | null | undefined): unknown {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed
    const record = parsed as Record<string, unknown>
    if (!('text' in record)) return parsed
    const { text, ...rest } = record
    return {
      ...rest,
      ...(typeof text === 'string' ? { textLength: text.length } : {}),
    }
  } catch {
    return raw
  }
}
