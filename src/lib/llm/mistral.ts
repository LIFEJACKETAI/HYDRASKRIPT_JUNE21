// HydraSkript - Mistral AI LLM Client
// Uses Mistral AI REST API directly
// MUST be used in backend code only

// ─── Configuration ─────────────────────────────────────────────────────────────

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

function getApiKey(): string {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY is not set in environment variables');
  }
  return apiKey;
}

function getModel(): string {
  // Valid Mistral models (live-tested 14 Sep 2026):
  // mistral-medium-latest, mistral-small-2503, mistral-small-latest
  // (`mistral-large-2411` returns HTTP 400 "Invalid model" — retired/renamed).
  return process.env.MISTRAL_MODEL || 'mistral-medium-latest';
}

// ─── Retry with Exponential Backoff ───────────────────────────────────────────

// Terminal HTTP errors: do NOT retry the same model — let fallback.ts rotate to
// the next model/provider instead. 410 = model retired, 404 = not found, 401 =
// auth, 400/403/422 = bad request, 429 = rate limited, timeout.
function isTerminalLLMError(message: string): boolean {
  return /\b(400|401|403|404|410|422|429)\b/.test(message) || message.includes('timed out');
}

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000 } = options;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[LLM] Mistral Attempt ${attempt}/${maxAttempts} failed:`, lastError.message);

      // On terminal errors (model retired/410, not found, rate limited, auth,
      // timeout) stop retrying this model so fallback.ts rotates immediately.
      if (isTerminalLLMError(lastError.message)) {
        throw lastError;
      }

      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

// ─── Core Chat Completion ─────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'assistant' | 'user' | 'system';
  content: string;
}

export interface CompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
  retries?: number;
  timeoutMs?: number;
}

/**
 * Generate a chat completion using Mistral AI REST API.
 */
export async function generateCompletion(options: CompletionOptions): Promise<string> {
  const { messages, temperature = 0.7, maxTokens, model, retries = 3, timeoutMs = 300000 } = options;
  const apiKey = getApiKey();
  const mistralModel = model || getModel();

  return withRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(MISTRAL_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: mistralModel,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = `Mistral API error ${response.status}`;
        try {
          const err = JSON.parse(errorText);
          if (err.error?.message) errorMsg += `: ${err.error.message}`;
        } catch {
          errorMsg += `: ${errorText.slice(0, 200)}`;
        }
        const err = new Error(errorMsg);
        (err as any).status = response.status;
        throw err;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Mistral returned empty content');
      return content;
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Mistral request timed out');
      }
      throw error;
    }
  });
}

/**
 * Generate structured JSON using Mistral AI.
 * Uses Mistral's JSON mode (response_format: { type: "json_object" }).
 */
export async function askLLMJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.2,
  model?: string
): Promise<T> {
  const apiKey = getApiKey();
  const mistralModel = model || getModel();

  return withRetry(async () => {
    const response = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: mistralModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `Mistral JSON API error ${response.status}`;
      try {
        const err = JSON.parse(errorText);
        if (err.error?.message) errorMsg += `: ${err.error.message}`;
      } catch {
        errorMsg += `: ${errorText.slice(0, 200)}`;
      }
      const err = new Error(errorMsg);
      (err as any).status = response.status;
      throw err;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Mistral returned empty JSON content');

    // Mistral JSON mode guarantees valid JSON
    return JSON.parse(content) as T;
  });
}

/**
 * Generate free-form text (chapter prose).
 * Matches the askLLM(provider) interface used by fallback.ts across all
 * providers (NVIDIA NIM, OpenRouter, Google Gemini, Mistral).
 */
export async function askLLM(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7,
  model?: string,
  maxTokens?: number
): Promise<string> {
  return generateCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    model,
    maxTokens,
  });
}