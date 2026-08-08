// HydraSkript - LLM fallback
// Routes every structured-generation call through OpenRouter. If the primary
// model fails (bad JSON, empty response, rate limit, or auth issue), retry the
// same call with the default OpenRouter model instead of a second provider.

import { askLLMJSON } from '@/lib/llm/openrouter';

const DEFAULT_FALLBACK_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';

export async function askLLMJSONWithFallback<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.2,
  model?: string
): Promise<T> {
  const primary = model || DEFAULT_FALLBACK_MODEL;

  try {
    return await askLLMJSON<T>(systemPrompt, userPrompt, temperature, primary);
  } catch (error) {
    const originalMessage = error instanceof Error ? error.message : String(error);

    if (primary === DEFAULT_FALLBACK_MODEL) {
      throw new Error(`Text generation is unavailable: ${originalMessage}`);
    }

    console.warn(
      `[LLM] ${primary} failed, falling back to ${DEFAULT_FALLBACK_MODEL}:`,
      originalMessage
    );

    try {
      return await askLLMJSON<T>(systemPrompt, userPrompt, temperature, DEFAULT_FALLBACK_MODEL);
    } catch (fallbackError) {
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(
        `Text generation failed in both attempts. ${primary}: ${originalMessage}. ${DEFAULT_FALLBACK_MODEL}: ${fallbackMessage}.`
      );
    }
  }
}
