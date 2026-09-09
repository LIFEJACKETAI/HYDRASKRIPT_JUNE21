// HydraSkript - LLM fallback
// Primary provider: NVIDIA NIM. Secondary: OpenRouter. Tertiary: Google Gemini.
// Used for both structured JSON generation and free-form text (chapter prose).
//
// Instead of trusting a single model id (which 410s when NVIDIA retires a model
// or 429s when an OpenRouter free model is rate-limited), each call rotates
// through a CHAIN of currently-valid models per provider, then across providers.
// An explicitly requested model is tried first, then the configured chain.

import { askLLMJSON, askLLM } from '@/lib/llm/openrouter';
import { askLLMJSON as askLLMGeminiJSON, askLLM as askLLMGemini } from '@/lib/llm/google-gemini';
import { askLLMJSON as askLLMNimJSON, askLLM as askLLMNim } from '@/lib/llm/nvidia-nim';

// Model lists verified against the NVIDIA NIM and OpenRouter catalogs (Sep 2026).
// Older ids such as `meta/llama-3.1-8b-instruct` (410 Gone) and
// `minimax-3.0` / `openrouter/free` (never existed) must NOT be used.

// NVIDIA NIM model chains (prefer the newest, strongest instruction followers).
const NIM_JSON_CHAIN = [
  process.env.NVIDIA_NIM_MODEL_JSON,
  'nvidia/llama-3.1-nemotron-70b-instruct',
  'nvidia/nemotron-3-super-120b-a12b',
  'google/gemma-4-31b-it',
  'mistralai/mistral-large-2-instruct',
];

const NIM_PROSE_CHAIN = [
  process.env.NVIDIA_NIM_MODEL,
  'nvidia/llama-3.1-nemotron-70b-instruct',
  'nvidia/nemotron-3-super-120b-a12b',
  'mistralai/mistral-large-2-instruct',
  'google/gemma-4-31b-it',
];

// OpenRouter free-tier model chains (these rotate as free models get rate-limited).
const OPENROUTER_JSON_CHAIN = [
  process.env.OPENROUTER_MODEL_JSON,
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-31b-it:free',
  'minimax/minimax-m3:free',
];

const OPENROUTER_PROSE_CHAIN = [
  process.env.OPENROUTER_MODEL,
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-31b-it:free',
  'minimax/minimax-m3:free',
];

// Gemini is an independent, third provider. Keep the configured model first, but
// retain the known-good default so a stale pinned model does not disable Gemini.
const GEMINI_CHAIN = [
  process.env.GEMINI_TEXT_MODEL,
  'gemini-2.5-flash',
];

function buildChain(...models: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of models) {
    const id = (m ?? '').trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Run one model id list against `fn` until one succeeds. Throws an aggregate error listing each attempt. */
async function tryModelChain<T>(
  label: string,
  models: string[],
  fn: (model: string) => Promise<T>
): Promise<T> {
  const errors: string[] = [];
  for (const model of models) {
    try {
      return await fn(model);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${model}: ${msg}`);
      console.warn(`[LLM] ${label} model ${model} failed:`, msg);
      // Continue to the next model in the chain.
    }
  }
  throw new Error(`${label}: all ${models.length} model(s) failed -> ${errors.join(' | ')}`);
}

function safetyMessage(errors: string[]): string | null {
  for (const e of errors) {
    const m = e.match(/Safety Categories:([^\n]+)/i);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

export async function askLLMJSONWithFallback<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.2,
  preferredModel?: string
): Promise<T> {
  const nimModels = buildChain(preferredModel, ...NIM_JSON_CHAIN);
  const orModels = buildChain(...OPENROUTER_JSON_CHAIN);
  const geminiModels = buildChain(...GEMINI_CHAIN);

  try {
    return await tryModelChain('NVIDIA NIM', nimModels, (m) =>
      askLLMNimJSON<T>(systemPrompt, userPrompt, temperature, m)
    );
  } catch (nimError) {
    const nimMessage = nimError instanceof Error ? nimError.message : String(nimError);
    console.warn('[LLM] NVIDIA NIM chain exhausted, falling back to OpenRouter:', nimMessage);

    try {
      return await tryModelChain('OpenRouter', orModels, (m) =>
        askLLMJSON<T>(systemPrompt, userPrompt, temperature, m)
      );
    } catch (openrouterError) {
      const orMessage = openrouterError instanceof Error ? openrouterError.message : String(openrouterError);
      console.warn('[LLM] OpenRouter chain exhausted, falling back to Gemini:', orMessage);

      try {
        return await tryModelChain('Google Gemini', geminiModels, (m) =>
          askLLMGeminiJSON<T>(systemPrompt, userPrompt, temperature, m)
        );
      } catch (geminiError) {
        const geminiMessage = geminiError instanceof Error ? geminiError.message : String(geminiError);

        // Surface a friendly safety-filter error if any attempt was content-blocked.
        const safety = safetyMessage([nimMessage, orMessage, geminiMessage]);
        if (safety) {
          throw new Error(
            `Content flagged by safety filter: ${safety}. Try adjusting book themes or descriptions.`
          );
        }

        throw new Error(
          `Text generation failed across all providers. NVIDIA NIM: ${nimMessage}. ` +
          `OpenRouter: ${orMessage}. Google Gemini: ${geminiMessage}.`
        );
      }
    }
  }
}

/**
 * Free-form text generation (chapter prose). Rotates through prose-optimized
 * models across NVIDIA NIM, OpenRouter, then Google Gemini. `maxTokens` must be
 * large enough for a full chapter.
 */
export async function askLLMWithFallback(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7,
  maxTokens: number = 8192,
  preferredModel?: string
): Promise<string> {
  const nimModels = buildChain(preferredModel, ...NIM_PROSE_CHAIN);
  const orModels = buildChain(...OPENROUTER_PROSE_CHAIN);
  const geminiModels = buildChain(...GEMINI_CHAIN);

  try {
    return await tryModelChain('NVIDIA NIM', nimModels, (m) =>
      askLLMNim(systemPrompt, userPrompt, temperature, m, maxTokens)
    );
  } catch (nimError) {
    const nimMessage = nimError instanceof Error ? nimError.message : String(nimError);
    console.warn('[LLM] NVIDIA NIM prose chain exhausted, falling back to OpenRouter:', nimMessage);

    try {
      return await tryModelChain('OpenRouter', orModels, (m) =>
        askLLM(systemPrompt, userPrompt, temperature, m, maxTokens)
      );
    } catch (openrouterError) {
      const orMessage = openrouterError instanceof Error ? openrouterError.message : String(openrouterError);
      console.warn('[LLM] OpenRouter prose chain exhausted, falling back to Gemini:', orMessage);

      try {
        return await tryModelChain('Google Gemini', geminiModels, (m) =>
          askLLMGemini(systemPrompt, userPrompt, temperature, m, maxTokens)
        );
      } catch (geminiError) {
        const geminiMessage = geminiError instanceof Error ? geminiError.message : String(geminiError);
        const safety = safetyMessage([nimMessage, orMessage, geminiMessage]);
        if (safety) {
          throw new Error(
            `Content flagged by safety filter: ${safety}. Try adjusting book themes or descriptions.`
          );
        }

        throw new Error(
          `Text generation failed across all providers. NVIDIA NIM: ${nimMessage}. ` +
          `OpenRouter: ${orMessage}. Google Gemini: ${geminiMessage}.`
        );
      }
    }
  }
}
