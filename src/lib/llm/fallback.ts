// HydraSkript - LLM fallback with triple redundancy
// Chain: OpenRouter → Gemini → NVIDIA → (loop back to OpenRouter)
// Each provider has internal retries. The outer loop runs full cycles.
// Used for both structured JSON generation and free-form text (chapter prose).
//
// ─── Deadlines ────────────────────────────────────────────────────────────────
// Every provider client defaults to a 300s per-attempt timeout and 3 internal
// retries. Multiplied across 3 providers and 2 cycles that is ~90 minutes of
// worst-case work — far past any serverless function limit, so the platform
// (Vercel) kills the request first and the browser only ever sees a bare 504.
//
// Callers that must answer inside a function's `maxDuration` should pass
// `deadlineMs`. The chain then clamps every attempt to the time still remaining
// and gives up on its own terms, with a real error message, instead of being
// terminated by the platform.

import { askLLMJSON, askLLM } from '@/lib/llm/openrouter';
import { askLLMJSON as askLLMGeminiJSON, askLLM as askLLMGemini } from '@/lib/llm/google-gemini';
import { askLLMJSON as askLLMNimJSON, askLLM as askLLMNim } from '@/lib/llm/nvidia-nim';
import type { LLMCallOptions } from '@/lib/llm/types';

export type { LLMCallOptions };

const OPENROUTER_MODEL_JSON = process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free';
const OPENROUTER_MODEL_TEXT = process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free';
const GEMINI_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
const NIM_MODEL_JSON = process.env.NVIDIA_NIM_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b';
const NIM_MODEL_TEXT = process.env.NVIDIA_NIM_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b';

const MAX_CYCLES = 2;

/** Matches the per-attempt default in the provider clients. */
const DEFAULT_ATTEMPT_TIMEOUT_MS = 300_000;

/** Below this much remaining budget another attempt cannot meaningfully run. */
const MIN_ATTEMPT_BUDGET_MS = 2_000;

type ProviderName = 'OpenRouter' | 'Gemini' | 'NVIDIA NIM';

interface ProviderAttempt {
  provider: ProviderName;
  model: string;
  error: string;
}

export interface LLMFallbackOptions extends LLMCallOptions {
  /** How many full provider cycles to attempt. Defaults to MAX_CYCLES. */
  maxCycles?: number;
  /**
   * Overall wall-clock budget for the entire chain, in ms. Each attempt is
   * clamped to whatever is left of it and the chain stops early once it is
   * exhausted. Leave unset (or 0) only for work that is not bounded by a
   * request or a function timeout; a budget smaller than a couple of seconds
   * means no attempt is started at all and the call fails as a timeout.
   */
  deadlineMs?: number;
}

/** Per-call budget state shared by every provider attempt in one chain run. */
interface ChainContext {
  call: LLMCallOptions;
  deadlineAt: number | null;
}

function buildContext(options?: LLMFallbackOptions): ChainContext {
  return {
    call: {
      ...(options?.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
      ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options?.retries !== undefined ? { retries: options.retries } : {}),
    },
    deadlineAt: options?.deadlineMs ? Date.now() + options.deadlineMs : null,
  };
}

/**
 * Resolve the options for one provider attempt, clamping its timeout to the
 * remaining chain budget. Returns `null` when the budget is already gone.
 */
function attemptOptions(ctx: ChainContext): LLMCallOptions | null {
  if (ctx.deadlineAt === null) return ctx.call;

  const remaining = ctx.deadlineAt - Date.now();
  if (remaining <= MIN_ATTEMPT_BUDGET_MS) return null;

  return {
    ...ctx.call,
    timeoutMs: Math.min(ctx.call.timeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS, remaining),
  };
}

/**
 * Try a single provider, returning success or the error message.
 */
async function tryProviderJSON<T>(
  provider: ProviderName,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  model: string,
  ctx: ChainContext,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const options = attemptOptions(ctx);
  if (!options) {
    return { ok: false, error: 'skipped — overall LLM deadline reached' };
  }

  try {
    let data: T;
    if (provider === 'OpenRouter') {
      data = await askLLMJSON<T>(systemPrompt, userPrompt, temperature, model, options);
    } else if (provider === 'Gemini') {
      data = await askLLMGeminiJSON<T>(systemPrompt, userPrompt, temperature, model, options);
    } else {
      data = await askLLMNimJSON<T>(systemPrompt, userPrompt, temperature, model, options);
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function tryProviderText(
  provider: ProviderName,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  model: string,
  maxTokens: number,
  ctx: ChainContext,
): Promise<{ ok: true; data: string } | { ok: false; error: string }> {
  // The free-form clients take no per-call options, so this is used purely as a
  // deadline gate: it stops the chain from starting another attempt once the
  // caller's overall budget is gone.
  const options = attemptOptions(ctx);
  if (!options) {
    return { ok: false, error: 'skipped — overall LLM deadline reached' };
  }

  try {
    let data: string;
    if (provider === 'OpenRouter') {
      data = await askLLM(systemPrompt, userPrompt, temperature, model, maxTokens);
    } else if (provider === 'Gemini') {
      data = await askLLMGemini(systemPrompt, userPrompt, temperature, model, maxTokens);
    } else {
      data = await askLLMNim(systemPrompt, userPrompt, temperature, model, maxTokens);
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Run one full cycle through all three providers.
 * Returns on first success, or accumulates errors.
 */
async function runCycleJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  ctx: ChainContext,
): Promise<{ ok: true; data: T } | { ok: false; attempts: ProviderAttempt[] }> {
  const attempts: ProviderAttempt[] = [];

  const providers: [ProviderName, string][] = [
    ['OpenRouter', OPENROUTER_MODEL_JSON],
    ['Gemini', GEMINI_MODEL],
    ['NVIDIA NIM', NIM_MODEL_JSON],
  ];

  for (const [provider, model] of providers) {
    const result = await tryProviderJSON<T>(provider, systemPrompt, userPrompt, temperature, model, ctx);
    if (result.ok) return { ok: true, data: result.data };
    attempts.push({ provider, model, error: result.error });
    console.warn(`[LLM] ${provider} (${model}) failed: ${result.error}`);
    // No point starting the next provider if the chain budget is already gone.
    if (ctx.deadlineAt !== null && Date.now() >= ctx.deadlineAt) break;
  }

  return { ok: false, attempts };
}

async function runCycleText(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
  ctx: ChainContext,
): Promise<{ ok: true; data: string } | { ok: false; attempts: ProviderAttempt[] }> {
  const attempts: ProviderAttempt[] = [];

  const providers: [ProviderName, string][] = [
    ['OpenRouter', OPENROUTER_MODEL_TEXT],
    ['Gemini', GEMINI_MODEL],
    ['NVIDIA NIM', NIM_MODEL_TEXT],
  ];

  for (const [provider, model] of providers) {
    const result = await tryProviderText(provider, systemPrompt, userPrompt, temperature, model, maxTokens, ctx);
    if (result.ok) return { ok: true, data: result.data };
    attempts.push({ provider, model, error: result.error });
    console.warn(`[LLM] ${provider} (${model}) failed: ${result.error}`);
    if (ctx.deadlineAt !== null && Date.now() >= ctx.deadlineAt) break;
  }

  return { ok: false, attempts };
}

/** Build the error thrown when every cycle/attempt was exhausted. */
function chainFailure(
  kind: 'JSON' | 'Text',
  cycles: number,
  attempts: ProviderAttempt[],
  elapsedMs: number,
  deadlineMs?: number,
): Error {
  // Check for safety filter errors
  const safetyError = attempts.find(a => a.error.match(/safety/i));
  if (safetyError) {
    return new Error(
      `Content flagged by safety filter. Try adjusting book themes or descriptions.`
    );
  }

  // A deadline was blown either by running out of time mid-attempt, or by
  // having so little budget left that no further attempt was worth starting.
  // Both must read as a timeout so callers can tell the user to try a smaller
  // manuscript rather than reporting a generic generation failure.
  const budgetExhausted =
    Boolean(deadlineMs) &&
    (elapsedMs >= (deadlineMs ?? 0) ||
      (attempts.length > 0 && attempts.every(a => /deadline reached/i.test(a.error))));

  if (budgetExhausted) {
    return new Error(
      `${kind} generation timed out after ${Math.round(elapsedMs / 1000)}s ` +
      `(deadline ${Math.round((deadlineMs ?? 0) / 1000)}s, ${attempts.length} attempts).\n` +
      attempts.map(a => `  ${a.provider} (${a.model}): ${a.error}`).join('\n')
    );
  }

  return new Error(
    `${kind} generation failed after ${cycles} cycles (${attempts.length} attempts).\n` +
    attempts.map(a => `  ${a.provider} (${a.model}): ${a.error}`).join('\n')
  );
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Structured JSON generation with triple-redundancy loop.
 * Cycles: OpenRouter → Gemini → NVIDIA → OpenRouter → ... (up to `maxCycles`).
 */
export async function askLLMJSONWithFallback<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.2,
  _model?: string,
  options?: LLMFallbackOptions,
): Promise<T> {
  const allAttempts: ProviderAttempt[] = [];
  const startedAt = Date.now();
  const maxCycles = Math.max(1, options?.maxCycles ?? MAX_CYCLES);
  const ctx = buildContext(options);
  let cyclesRun = 0;

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    if (ctx.deadlineAt !== null && Date.now() >= ctx.deadlineAt) {
      console.warn(`[LLM] Deadline reached before cycle ${cycle} — stopping.`);
      break;
    }

    cyclesRun = cycle;
    console.log(`[LLM] JSON cycle ${cycle}/${maxCycles} — trying OpenRouter → Gemini → NVIDIA`);
    const result = await runCycleJSON<T>(systemPrompt, userPrompt, temperature, ctx);
    if (result.ok) {
      console.log(`[LLM] JSON succeeded on cycle ${cycle} in ${Date.now() - startedAt}ms`);
      return result.data;
    }
    allAttempts.push(...result.attempts);
    if (cycle < maxCycles) {
      console.warn(`[LLM] Cycle ${cycle} exhausted all providers. Retrying...`);
    }
  }

  throw chainFailure('JSON', cyclesRun, allAttempts, Date.now() - startedAt, options?.deadlineMs);
}

/**
 * Free-form text generation with triple-redundancy loop.
 * Cycles: OpenRouter → Gemini → NVIDIA → OpenRouter → ... (up to `maxCycles`).
 */
export async function askLLMWithFallback(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7,
  maxTokens: number = 8192,
  options?: LLMFallbackOptions,
): Promise<string> {
  const allAttempts: ProviderAttempt[] = [];
  const startedAt = Date.now();
  const maxCycles = Math.max(1, options?.maxCycles ?? MAX_CYCLES);
  const ctx = buildContext(options);
  let cyclesRun = 0;

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    if (ctx.deadlineAt !== null && Date.now() >= ctx.deadlineAt) {
      console.warn(`[LLM] Deadline reached before cycle ${cycle} — stopping.`);
      break;
    }

    cyclesRun = cycle;
    console.log(`[LLM] Text cycle ${cycle}/${maxCycles} — trying OpenRouter → Gemini → NVIDIA`);
    const result = await runCycleText(systemPrompt, userPrompt, temperature, maxTokens, ctx);
    if (result.ok) {
      console.log(`[LLM] Text succeeded on cycle ${cycle} in ${Date.now() - startedAt}ms`);
      return result.data;
    }
    allAttempts.push(...result.attempts);
    if (cycle < maxCycles) {
      console.warn(`[LLM] Cycle ${cycle} exhausted all providers. Retrying...`);
    }
  }

  throw chainFailure('Text', cyclesRun, allAttempts, Date.now() - startedAt, options?.deadlineMs);
}
