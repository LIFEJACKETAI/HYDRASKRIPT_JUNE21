// HydraSkript - LLM fallback
// Primary provider: NVIDIA NIM. Secondary: OpenRouter.
// Used for both structured JSON generation and free-form text (chapter prose).

import { askLLMJSON, askLLM } from '@/lib/llm/openrouter';
import { askLLMJSON as askLLMNimJSON, askLLM as askLLMNim } from '@/lib/llm/nvidia-nim';

// Default models. NOTE: 'minimax-3.0' and 'openrouter/free' are NOT real model
// ids and caused every JSON call to fail over (or fail outright). Use capable
// instruction-following models — small 8B models routinely ignore long
// outline/cast instructions, which is why chapters drifted from the outline and
// mixed up characters.
const DEFAULT_NIM_MODEL = process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.1-70b-instruct';
const DEFAULT_FALLBACK_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-70b-instruct:free';

export async function askLLMJSONWithFallback<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.2,
  model?: string
): Promise<T> {
  // Try NVIDIA NIM first
  const primaryModel = model || DEFAULT_NIM_MODEL;
  const fallbackModel = DEFAULT_FALLBACK_MODEL;

  try {
    return await askLLMNimJSON<T>(systemPrompt, userPrompt, temperature, primaryModel);
  } catch (nimError) {
    const nimMessage = nimError instanceof Error ? nimError.message : String(nimError);

    console.warn(
      `[LLM] NVIDIA NIM (${primaryModel}) failed, falling back to OpenRouter:`,
      nimMessage
    );

    try {
      return await askLLMJSON<T>(systemPrompt, userPrompt, temperature, fallbackModel);
    } catch (openrouterError) {
      const openrouterMessage = openrouterError instanceof Error ? openrouterError.message : String(openrouterError);

      // Check if it's a safety-related error from OpenRouter
      const safetyCategories = openrouterMessage.match(/Safety Categories:([^\n]+)/i);
      if (safetyCategories && safetyCategories[1]) {
        console.error(
          `[LLM] OpenRouter safety filter triggered:`,
          safetyCategories[1]
        );
        throw new Error(
          `Content flagged by safety filter: ${safetyCategories[1]}. Try adjusting book themes or descriptions to avoid restricted categories.`
        );
      }

      throw new Error(
        `Text generation failed in both attempts. NVIDIA NIM (${primaryModel}): ${nimMessage}. OpenRouter (${fallbackModel}): ${openrouterMessage}.`
      );
    }
  }
}

/**
 * Free-form text generation with the same NIM → OpenRouter fallback as the JSON
 * path. Used for chapter prose, where requiring strict JSON from a small model
 * is unreliable. `maxTokens` must be set large enough for a full chapter.
 */
export async function askLLMWithFallback(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7,
  maxTokens: number = 8192
): Promise<string> {
  // Use a 70B-class model for prose: the 8B model reliably ignored long
  // outline/cast instructions (drifted from the synopsis, renamed characters).
  const primaryModel = process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.1-70b-instruct';
  const fallbackModel = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-70b-instruct:free';

  try {
    return await askLLMNim(systemPrompt, userPrompt, temperature, primaryModel, maxTokens);
  } catch (nimError) {
    const nimMessage = nimError instanceof Error ? nimError.message : String(nimError);
    console.warn(`[LLM] NVIDIA NIM (${primaryModel}) failed, falling back to OpenRouter:`, nimMessage);
    try {
      return await askLLM(systemPrompt, userPrompt, temperature, fallbackModel, maxTokens);
    } catch (openrouterError) {
      const openrouterMessage = openrouterError instanceof Error ? openrouterError.message : String(openrouterError);
      throw new Error(
        `Text generation failed in both attempts. NVIDIA NIM (${primaryModel}): ${nimMessage}. OpenRouter (${fallbackModel}): ${openrouterMessage}.`
      );
    }
  }
}
