// HydraSkript - LLM Client
// Uses OpenRouter API for all text generation
// MUST be used in backend code only

import OpenRouter from 'openrouter';

// Singleton pattern for OpenRouter client
let openrouterClient: OpenRouter | null = null;

function getOpenRouterClient(): OpenRouter {
  if (!openrouterClient) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not set in environment variables');
    }
    openrouterClient = new OpenRouter({ apiKey });
  }
  return openrouterClient;
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
      return await fn();
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
  role: 'assistant' | 'user' | 'system';
  content: string;
}

export interface CompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
  retries?: number;
}

/**
 * Generate a chat completion using OpenRouter.
 */
export async function generateCompletion(options: CompletionOptions): Promise<string> {
  const { messages, temperature = 0.7, maxTokens, model, retries = 3 } = options;

  return withRetry(async () => {
    const client = getOpenRouterClient();
    const openrouterModel = model || process.env.OPENROUTER_MODEL || 'gemma 4 31b it:free';

    try {
      const completion = await client.chat.completions.create({
        model: openrouterModel,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature,
        max_tokens: maxTokens,
      });

      const response = completion.choices?.[0]?.message?.content;

      if (!response || response.trim().length === 0) {
        throw new Error('Empty response from LLM');
      }

      return response;
    } catch (apiError) {
      console.error('[LLM] API call failed:', apiError instanceof Error ? apiError.message : String(apiError));
      throw new Error(`LLM API call failed: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
    }
  }, { maxAttempts: retries });
}

// ─── Structured JSON Completion ───────────────────────────────────────────────

/**
 * Generate a completion and parse as JSON.
 */
export async function generateJSON<T>(
  options: CompletionOptions
): Promise<T> {
  // Add instruction to output JSON
  const messages: ChatMessage[] = [
    ...options.messages,
    { role: 'system', content: 'IMPORTANT: Respond with valid JSON only. No markdown, no code fences, no extra text. Just the JSON object.' },
  ];

  const response = await generateCompletion({
    ...options,
    messages,
    temperature: options.temperature ?? 0.2,
  });

  // Try to extract JSON from response
  let jsonStr = response.trim();

  // Strip markdown code fences if present
  const jsonMatch = jsonStr.match(/```(?\:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
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

// ─── Convenience Functions ──────────────────────────────────────────────────

export async function askLLM(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7
): Promise<string> {
  return generateCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
  });
}

export async function askLLMJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.2
): Promise<T> {
  return generateJSON<T>({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
  });
}