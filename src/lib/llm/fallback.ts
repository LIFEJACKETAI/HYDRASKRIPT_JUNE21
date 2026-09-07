// HydraSkript - LLM fallback with triple redundancy
// Chain: OpenRouter → Gemini → NVIDIA → (loop back to OpenRouter)
// Each provider has internal 3 retries. Outer loop does up to 3 full cycles.
// Used for both structured JSON generation and free-form text (chapter prose).

import { askLLMJSON, askLLM } from '@/lib/llm/openrouter';
import { askLLMJSON as askLLMGeminiJSON, askLLM as askLLMGemini } from '@/lib/llm/google-gemini';
import { askLLMJSON as askLLMNimJSON, askLLM as askLLMNim } from '@/lib/llm/nvidia-nim';

const OPENROUTER_MODEL_JSON = process.env.OPENROUTER_MODEL || 'openrouter/free';
const OPENROUTER_MODEL_TEXT = process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free';
const GEMINI_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash';
const NIM_MODEL_JSON = process.env.NVIDIA_NIM_MODEL || 'minimax-3.0';
const NIM_MODEL_TEXT = process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.1-8b-instruct';

const MAX_CYCLES = 2;

type ProviderName = 'OpenRouter' | 'Gemini' | 'NVIDIA NIM';

interface ProviderAttempt {
  provider: ProviderName;
  model: string;
  error: string;
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
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    let data: T;
    if (provider === 'OpenRouter') {
      data = await askLLMJSON<T>(systemPrompt, userPrompt, temperature, model);
    } else if (provider === 'Gemini') {
      data = await askLLMGeminiJSON<T>(systemPrompt, userPrompt, temperature, model);
    } else {
      data = await askLLMNimJSON<T>(systemPrompt, userPrompt, temperature, model);
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
): Promise<{ ok: true; data: string } | { ok: false; error: string }> {
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
): Promise<{ ok: true; data: T } | { ok: false; attempts: ProviderAttempt[] }> {
  const attempts: ProviderAttempt[] = [];

  const providers: [ProviderName, string][] = [
    ['OpenRouter', OPENROUTER_MODEL_JSON],
    ['Gemini', GEMINI_MODEL],
    ['NVIDIA NIM', NIM_MODEL_JSON],
  ];

  for (const [provider, model] of providers) {
    const result = await tryProviderJSON<T>(provider, systemPrompt, userPrompt, temperature, model);
    if (result.ok) return { ok: true, data: result.data };
    attempts.push({ provider, model, error: result.error });
    console.warn(`[LLM] ${provider} (${model}) failed: ${result.error}`);
  }

  return { ok: false, attempts };
}

async function runCycleText(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
): Promise<{ ok: true; data: string } | { ok: false; attempts: ProviderAttempt[] }> {
  const attempts: ProviderAttempt[] = [];

  const providers: [ProviderName, string][] = [
    ['OpenRouter', OPENROUTER_MODEL_TEXT],
    ['Gemini', GEMINI_MODEL],
    ['NVIDIA NIM', NIM_MODEL_TEXT],
  ];

  for (const [provider, model] of providers) {
    const result = await tryProviderText(provider, systemPrompt, userPrompt, temperature, model, maxTokens);
    if (result.ok) return { ok: true, data: result.data };
    attempts.push({ provider, model, error: result.error });
    console.warn(`[LLM] ${provider} (${model}) failed: ${result.error}`);
  }

  return { ok: false, attempts };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Structured JSON generation with triple-redundancy loop.
 * Cycles: OpenRouter → Gemini → NVIDIA → OpenRouter → ... (up to 3 full cycles).
 */
export async function askLLMJSONWithFallback<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.2,
  _model?: string,
): Promise<T> {
  const allAttempts: ProviderAttempt[] = [];

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    console.log(`[LLM] JSON cycle ${cycle}/${MAX_CYCLES} — trying OpenRouter → Gemini → NVIDIA`);
    const result = await runCycleJSON<T>(systemPrompt, userPrompt, temperature);
    if (result.ok) {
      console.log(`[LLM] JSON succeeded on cycle ${cycle}`);
      return result.data;
    }
    allAttempts.push(...result.attempts);
    if (cycle < MAX_CYCLES) {
      console.warn(`[LLM] Cycle ${cycle} exhausted all providers. Retrying...`);
    }
  }

  // Check for safety filter errors
  const safetyError = allAttempts.find(a => a.error.match(/safety/i));
  if (safetyError) {
    throw new Error(
      `Content flagged by safety filter. Try adjusting book themes or descriptions.`
    );
  }

  throw new Error(
    `Text generation failed after ${MAX_CYCLES} cycles (${allAttempts.length} attempts).\n` +
    allAttempts.map(a => `  ${a.provider} (${a.model}): ${a.error}`).join('\n')
  );
}

/**
 * Free-form text generation with triple-redundancy loop.
 * Cycles: OpenRouter → Gemini → NVIDIA → OpenRouter → ... (up to 3 full cycles).
 */
export async function askLLMWithFallback(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7,
  maxTokens: number = 8192,
): Promise<string> {
  const allAttempts: ProviderAttempt[] = [];

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    console.log(`[LLM] Text cycle ${cycle}/${MAX_CYCLES} — trying OpenRouter → Gemini → NVIDIA`);
    const result = await runCycleText(systemPrompt, userPrompt, temperature, maxTokens);
    if (result.ok) {
      console.log(`[LLM] Text succeeded on cycle ${cycle}`);
      return result.data;
    }
    allAttempts.push(...result.attempts);
    if (cycle < MAX_CYCLES) {
      console.warn(`[LLM] Cycle ${cycle} exhausted all providers. Retrying...`);
    }
  }

  throw new Error(
    `Text generation failed after ${MAX_CYCLES} cycles (${allAttempts.length} attempts).\n` +
    allAttempts.map(a => `  ${a.provider} (${a.model}): ${a.error}`).join('\n')
  );
}
