// HydraSkript - regression tests for the "generation stuck on Queued..." fixes
//
// Two families:
//   1. llm/budget: the per-claim work window that stops a provider 503 storm
//      from burning the whole serverless function (which used to freeze the
//      instance mid-job and orphan its lease).
//   2. workers/queue: claim filtering (transient-failure backoff) and the
//      hardened terminal status write that keeps a finished job from staying
//      "Queued..." in the UI when Postgres hiccups.

jest.mock('@/lib/llm/nvidia-nim', () => ({
  askLLMJSON: jest.fn(),
  askLLM: jest.fn(),
}));
jest.mock('@/lib/llm/openrouter', () => ({
  askLLMJSON: jest.fn(),
  askLLM: jest.fn(),
}));
jest.mock('@/lib/llm/google-gemini', () => ({
  askLLMJSON: jest.fn(),
  askLLM: jest.fn(),
}));
jest.mock('@/lib/llm/mistral', () => ({
  askLLMJSON: jest.fn(),
  askLLM: jest.fn(),
}));

jest.mock('@/lib/db', () => {
  const db = {
    job: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    $executeRawUnsafe: jest.fn(),
  };
  return { db, transactionOptions: {} };
});

jest.mock('@/lib/workers/registry', () => ({
  WorkerRegistry: { write_chapter: jest.fn() },
}));

import {
  clampTimeoutMs,
  hasBudgetForAttempt,
  isLlmBudgetExceeded,
  isProviderTransientError,
  LlmBudgetExceededError,
  MIN_ATTEMPT_MS,
  remainingLlmBudgetMs,
  runWithLlmBudget,
  sleepWithinBudget,
} from '@/lib/llm/budget';
import { askLLMJSONWithFallback } from '@/lib/llm/fallback';
import { askLLMJSON as askNimJSON } from '@/lib/llm/nvidia-nim';
import { askLLMJSON as askLLMJSONOpenRouter } from '@/lib/llm/openrouter';
import { askLLMJSON as askLLMJSONGemini } from '@/lib/llm/google-gemini';
import { askLLMJSON as askLLMJSONMistral } from '@/lib/llm/mistral';
import { db } from '@/lib/db';
import { getJobQueue } from '@/lib/workers/queue';

const dbMock = db as unknown as {
  job: {
    findFirst: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
  };
};
const nimMock = askNimJSON as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('llm/budget - per-claim work window', () => {
  it('is unlimited outside a claim so CLIs and tests are unaffected', async () => {
    expect(remainingLlmBudgetMs()).toBe(Number.POSITIVE_INFINITY);
    expect(hasBudgetForAttempt()).toBe(true);
    expect(clampTimeoutMs(120_000)).toBe(120_000);
  });

  it('reports time remaining inside a budget and never goes negative', async () => {
    const before = Date.now();
    await runWithLlmBudget(5_000, async () => {
      const remaining = remainingLlmBudgetMs();
      expect(remaining).toBeLessThanOrEqual(5_000);
      expect(remaining).toBeGreaterThan(4_000);
      // A 120s request cannot fit in a 5s window: it must be clamped, and
      // clamping must not go below the 10s floor (an over-short timeout would
      // abort requests that were about to succeed).
      expect(clampTimeoutMs(120_000)).toBe(10_000);
    });
    expect(Date.now() - before).toBeLessThan(4_500);
  });

  it('refuses to start an attempt that cannot finish and flags it as re-queueable', async () => {
    await runWithLlmBudget(MIN_ATTEMPT_MS - 5_000, async () => {
      expect(hasBudgetForAttempt()).toBe(false);
    });
    expect(await runWithLlmBudget(60_000, async () => hasBudgetForAttempt())).toBe(true);
  });

  it('skips a backoff sleep that would overrun the window instead of sleeping through it', async () => {
    const started = Date.now();
    const slept = await runWithLlmBudget(
      5_000,
      async () => sleepWithinBudget(60_000)
    );
    expect(slept).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);

    expect(await sleepWithinBudget(10)).toBe(true);
  });

  it('classifies the exact production failure as transient (re-queue, not fail)', () => {
    expect(
      isProviderTransientError(
        'LLM API call failed: NVIDIA NIM API error: 503 Service Unavailable - Service temporarily overloaded'
      )
    ).toBe(true);
    expect(isProviderTransientError('LLM API call failed: 429 Too Many Requests')).toBe(true);
    expect(isProviderTransientError('LLM API call failed: 404 Not Found - model retired')).toBe(false);
    expect(isLlmBudgetExceeded(new LlmBudgetExceededError('x'))).toBe(true);
    expect(isLlmBudgetExceeded(new Error('LLM_BUDGET_EXCEEDED: claim window closed'))).toBe(true);
  });
});

describe('llm/fallback - stops rotating when the claim is out of time', () => {
  it('does not hammer every provider after the window closes', async () => {
    nimMock.mockRejectedValue(new Error('503 Service Unavailable - Service temporarily overloaded'));

    await expect(
      runWithLlmBudget(2_000, () => askLLMJSONWithFallback<{ a: number }>('sys', 'user'))
    ).rejects.toThrow(/LLM_BUDGET_EXCEEDED/);

    // 4 providers x ~3 models each would be 12 calls; a closed window must make
    // zero of them.
    expect(nimMock).not.toHaveBeenCalled();
  });

  it('tells the user providers are busy instead of dumping a blob of raw errors', async () => {
    const overloaded = () =>
      Promise.reject(new Error('LLM API call failed: API error: 503 Service Unavailable - Service temporarily overloaded'));
    nimMock.mockImplementation(overloaded);
    (askLLMJSONOpenRouter as jest.Mock).mockImplementation(overloaded);
    (askLLMJSONGemini as jest.Mock).mockImplementation(overloaded);
    (askLLMJSONMistral as jest.Mock).mockImplementation(overloaded);

    await expect(askLLMJSONWithFallback<{ a: number }>('sys', 'user')).rejects.toThrow(
      /All AI providers are temporarily overloaded/
    );
    expect(nimMock.mock.calls.length).toBeGreaterThan(0);
  });
});

describe('workers/queue - claim backoff and terminal status writes', () => {
  const queue = getJobQueue();

  it('will not claim a job that is still inside its retry backoff window', async () => {
    dbMock.job.findFirst.mockResolvedValue(null);

    await queue.processOneQueuedJob();

    const where = dbMock.job.findFirst.mock.calls[0][0].where;
    expect(where.status).toBe('queued');
    expect(where.OR).toEqual([
      { leaseExpiresAt: null },
      expect.objectContaining({ leaseExpiresAt: { lte: expect.any(Date) } }),
    ]);
  });

  it('retries a terminal status write through transient P2028 failures', async () => {
    const p2028 = new Error(
      'Transaction API error: Unable to start a transaction in the given time. (P2028)'
    );
    dbMock.job.update
      .mockRejectedValueOnce(p2028)
      .mockRejectedValueOnce(p2028)
      .mockResolvedValue({ id: 'job-1' });

    await expect(
      queue.updateJobStatus('job-1', { status: 'completed', progressPercent: 100 })
    ).resolves.toBeUndefined();

    expect(dbMock.job.update.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('does not let a cosmetic progress write fail a job', async () => {
    dbMock.job.update.mockRejectedValue(new Error('connection reset by peer'));
    await expect(
      queue.updateJobStatus('job-1', { progressMessage: 'Writing chapter 2...' })
    ).resolves.toBeUndefined();
  });
});
