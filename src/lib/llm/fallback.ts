// HydraSkript - LLM fallback
// Primary provider: NVIDIA NIM with Minimax 3.0 model.
// If NVIDIA NIM fails (bad JSON, empty response, rate limit, or auth issue),
// falls back to OpenRouter as secondary provider.

import { askLLMJSON } from '@/lib/llm/openrouter';
import { askLLMJSON as askLLMNimJSON } from '@/lib/llm/nvidia-nim';

const DEFAULT_NIM_MODEL = process.env.NVIDIA_NIM_MODEL || 'minimax-3.0';
const DEFAULT_FALLBACK_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';

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
      throw new Error(
        `Text generation failed in both attempts. NVIDIA NIM (${primaryModel}): ${nimMessage}. OpenRouter (${fallbackModel}): ${openrouterMessage}.`
      );
    }
  }
}
