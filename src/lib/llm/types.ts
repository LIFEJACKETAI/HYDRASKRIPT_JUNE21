// HydraSkript - Shared LLM client types
// Used by every provider client (OpenRouter / Gemini / NVIDIA NIM) and by the
// fallback chain in `src/lib/llm/fallback.ts`.

export interface LLMCallOptions {
  /** Max output tokens. Lower = faster; the caller decides what fits its budget. */
  maxTokens?: number;
  /** Wall-clock budget for a single provider attempt, in ms. */
  timeoutMs?: number;
  /** How many times one provider retries before the chain moves to the next. */
  retries?: number;
}
