// tests/manuscript-import.test.ts
//
// Covers the parts of the async manuscript import that must behave exactly:
//   1. the `manuscript_import` job payload contract shared by the queueing
//      route, the polling route and the worker;
//   2. manuscript text handling + the upload cap (Vercel's 4.5 MB body limit);
//   3. the LLM chain deadline — the guard that stops entity extraction from
//      being killed by the platform, which is what produced the original 504.

import {
  parseManuscriptImportOutcome,
  parseManuscriptImportPayload,
  serializeManuscriptImportPayload,
  type ManuscriptImportOutcome,
} from '@/lib/manuscript-import';
import {
  MAX_MANUSCRIPT_CHARS,
  MAX_MANUSCRIPT_UPLOAD_BYTES,
  SUPPORTED_MANUSCRIPT_EXTENSIONS,
  manuscriptUploadLimitMessage,
  truncateManuscript,
} from '@/lib/manuscript';
import { askLLMJSONWithFallback } from '@/lib/llm/fallback';

const PAYLOAD = {
  fileName: 'my-novel.pdf',
  bookId: '11111111-1111-1111-1111-111111111111',
  newBookCreated: true,
  text: 'Chapter One\nIt was a dark and stormy night.',
};

const OUTCOME: ManuscriptImportOutcome = {
  imported: true,
  fileName: PAYLOAD.fileName,
  bookId: PAYLOAD.bookId,
  newBookCreated: true,
  counts: { CHARACTER: 2, LOCATION: 1 },
  total: 3,
  importedAt: '2026-09-08T12:00:00.000Z',
};

describe('manuscript_import job payload', () => {
  it('round-trips through jobs.result', () => {
    const serialized = serializeManuscriptImportPayload(PAYLOAD);
    expect(parseManuscriptImportPayload(serialized)).toEqual(PAYLOAD);
  });

  it('reads a finished outcome back', () => {
    expect(parseManuscriptImportOutcome(JSON.stringify(OUTCOME))).toEqual(OUTCOME);
  });

  it('does not treat a finished outcome as pending work', () => {
    // A reclaimed job must never be re-run just because its lease expired.
    expect(parseManuscriptImportPayload(JSON.stringify(OUTCOME))).toBeNull();
  });

  it('does not treat a pending payload as a result', () => {
    expect(parseManuscriptImportOutcome(serializeManuscriptImportPayload(PAYLOAD))).toBeNull();
  });

  it('returns null for junk instead of throwing', () => {
    for (const junk of [null, undefined, '', 'not json', '{}', '[]', '"string"', '42']) {
      expect(parseManuscriptImportPayload(junk)).toBeNull();
      expect(parseManuscriptImportOutcome(junk)).toBeNull();
    }
  });

  it('tolerates a partially corrupt outcome', () => {
    const parsed = parseManuscriptImportOutcome(
      JSON.stringify({ imported: true, bookId: 'b-1', counts: 'nope', total: 'x' })
    );
    expect(parsed).toEqual({
      imported: true,
      fileName: 'manuscript',
      bookId: 'b-1',
      newBookCreated: false,
      counts: {},
      total: 0,
      importedAt: expect.any(String),
    });
  });
});

describe('manuscript text handling', () => {
  it('accepts exactly the three supported manuscript types', () => {
    expect([...SUPPORTED_MANUSCRIPT_EXTENSIONS].sort()).toEqual(['docx', 'pdf', 'txt']);
  });

  it('strips NUL bytes and trims', () => {
    expect(truncateManuscript('  hello\u0000world  ')).toBe('hello\u0000world'.replace('\u0000', ''));
    expect(truncateManuscript('\u0000\u0000')).toBe('');
  });

  it('returns an empty string for whitespace-only manuscripts', () => {
    expect(truncateManuscript('   \n\t  ')).toBe('');
  });

  it('caps the stored manuscript at the review limit', () => {
    expect(MAX_MANUSCRIPT_CHARS).toBe(80_000);
    expect(truncateManuscript('a'.repeat(MAX_MANUSCRIPT_CHARS + 5000))).toHaveLength(MAX_MANUSCRIPT_CHARS);
    expect(truncateManuscript('a'.repeat(100))).toHaveLength(100);
  });

  it('keeps the upload cap at Vercel body limit', () => {
    expect(MAX_MANUSCRIPT_UPLOAD_BYTES).toBe(4.5 * 1024 * 1024);
    expect(manuscriptUploadLimitMessage(5 * 1024 * 1024)).toMatch(/5\.0 MB/);
    expect(manuscriptUploadLimitMessage(5 * 1024 * 1024)).toMatch(/4\.5 MB/);
  });
});

describe('LLM fallback deadline', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    process.env.NVIDIA_NIM_API_KEY = 'test-key';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  /** A fetch that never answers on its own — only the abort signal ends it. */
  function mockHangingFetch() {
    const hanging = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const abortError = () => Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
        if (!signal) return;
        if (signal.aborted) reject(abortError());
        else signal.addEventListener('abort', () => reject(abortError()));
      });
    });
    jest.spyOn(globalThis, 'fetch').mockImplementation(hanging as unknown as typeof fetch);
    return hanging;
  }

  it('gives up on its own terms instead of running to the platform timeout', async () => {
    const hanging = mockHangingFetch();

    const startedAt = Date.now();
    await expect(
      askLLMJSONWithFallback<unknown>('system', 'manuscript', 0.2, undefined, {
        deadlineMs: 3_000,
        timeoutMs: 60_000, // deliberately far longer than the deadline
        retries: 1,
        maxCycles: 2,
      })
    ).rejects.toThrow(/timed out/i);
    const elapsed = Date.now() - startedAt;

    // Without the deadline this chain would burn 2 cycles x 3 providers x 60s.
    expect(elapsed).toBeGreaterThanOrEqual(2_500);
    expect(elapsed).toBeLessThan(10_000);
    // Only the first provider gets a real attempt; the rest are skipped once
    // the budget is gone.
    expect(hanging).toHaveBeenCalledTimes(1);
  });

  it('reports a timeout when the budget is too small to start another attempt', async () => {
    const hanging = mockHangingFetch();

    // Below MIN_ATTEMPT_BUDGET_MS: no attempt is worth starting, and that must
    // still be reported as a timeout rather than a generic generation failure.
    await expect(
      askLLMJSONWithFallback<unknown>('system', 'manuscript', 0.2, undefined, {
        deadlineMs: 500,
        timeoutMs: 60_000,
      })
    ).rejects.toThrow(/timed out/i);
    expect(hanging).not.toHaveBeenCalled();
  });

  it('still fails cleanly when no provider can answer', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({ error: { message: 'rate limited' } }),
    } as unknown as Response);

    await expect(
      askLLMJSONWithFallback<unknown>('system', 'manuscript', 0.2, undefined, { retries: 1 })
    ).rejects.toThrow(/failed after|timed out/i);
  });
});
