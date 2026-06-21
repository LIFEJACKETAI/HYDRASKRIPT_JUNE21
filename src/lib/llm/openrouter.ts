// HydraSkript - LLM Client
// Uses z-ai-web-dev-sdk for all text generation (replaces OpenRouter in sandbox)
// MUST be used in backend code only

import ZAI from 'z-ai-web-dev-sdk';

// Singleton pattern for ZAI instance
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

// ─── Retry with Exponential Backoff ───────────────────────────────────────────

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
      const result = await fn();
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[LLM] Attempt ${attempt}/${maxAttempts} failed:`, lastError.message);

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
  role: 'assistant' | 'user';
  content: string;
}

export interface CompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  retries?: number;
}

/**
 * Generate a chat completion using the LLM.
 * Uses z-ai-web-dev-sdk with retry logic.
 */
export async function generateCompletion(options: CompletionOptions): Promise<string> {
  const { messages, temperature = 0.7, retries = 3 } = options;

  return withRetry(async () => {
    let zai;
    try {
      zai = await getZAI();
    } catch (initError) {
      console.error('[LLM] Failed to initialize ZAI client:', initError);
      throw new Error(`LLM client initialization failed: ${initError instanceof Error ? initError.message : String(initError)}`);
    }

    let completion;
    try {
      completion = await zai.chat.completions.create({
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        thinking: { type: 'disabled' },
      });
    } catch (apiError) {
      console.error('[LLM] API call failed:', apiError instanceof Error ? apiError.message : String(apiError));
      throw new Error(`LLM API call failed: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
    }

    const response = completion.choices?.[0]?.message?.content;

    if (!response || response.trim().length === 0) {
      throw new Error('Empty response from LLM');
    }

    return response;
  }, { maxAttempts: retries });
}

// ─── Structured JSON Completion ───────────────────────────────────────────────

/**
 * Generate a completion and parse as JSON.
 * Uses lower temperature for more deterministic output.
 */
export async function generateJSON<T>(
  options: CompletionOptions
): Promise<T> {
  // Add instruction to output JSON
  const messages: ChatMessage[] = [
    ...options.messages,
    { role: 'user' as const, content: 'IMPORTANT: Respond with valid JSON only. No markdown, no code fences, no extra text. Just the JSON object.' },
  ];

  const response = await generateCompletion({
    ...options,
    messages,
    temperature: options.temperature ?? 0.2,
  });

  // Try to extract JSON from response (handle markdown code fences)
  let jsonStr = response.trim();

  // Strip markdown code fences if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // Try to find the first { and last } to extract JSON
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      try {
        return JSON.parse(jsonStr.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        throw new Error(`Failed to parse LLM JSON response: ${jsonStr.slice(0, 200)}...`);
      }
    }
    throw new Error(`Failed to parse LLM JSON response: ${jsonStr.slice(0, 200)}...`);
  }
}

// ─── Convenience: Simple Prompt ───────────────────────────────────────────────

/**
 * Quick one-shot generation with system + user prompt.
 */
export async function askLLM(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7
): Promise<string> {
  return generateCompletion({
    messages: [
      { role: 'assistant', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
  });
}

/**
 * Quick one-shot JSON generation with system + user prompt.
 */
export async function askLLMJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.2
): Promise<T> {
  return generateJSON<T>({
    messages: [
      { role: 'assistant', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
  });
}
