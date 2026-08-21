// HydraSkript - NVIDIA NIM LLM Client
// Uses NVIDIA NIM REST API directly
// MUST be used in backend code only

// ─── Configuration ─────────────────────────────────────────────────────────────

const NVIDIA_NIM_API_URL = process.env.NVIDIA_NIM_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';

function getApiKey(): string {
  const apiKey = process.env.NVIDIA_NIM_API_KEY;
  if (!apiKey) {
    throw new Error('NVIDIA_NIM_API_KEY is not set in environment variables');
  }
  return apiKey;
}

function getModel(): string {
  // Use a valid NVIDIA NIM model - minimax-3.0 doesn't exist on NIM
  // Common models: meta/llama-3.1-70b-instruct, meta/llama-3.1-8b-instruct, 
  // mistralai/mixtral-8x7b-instruct-v0.1, nvidia/nemotron-3-ultra
  return process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.1-70b-instruct';
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
      console.error(`[LLM] NVIDIA NIM Attempt ${attempt}/${maxAttempts} failed:`, lastError.message);

      // Don't retry on 404 (model not found), 401 (auth error), or timeout
      // (let fallback.ts switch providers instead of burning the full timeout again)
      if (lastError.message.includes('404') || lastError.message.includes('401') || lastError.message.includes('timed out')) {
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
 * Generate a chat completion using NVIDIA NIM REST API.
 */
export async function generateCompletion(options: CompletionOptions): Promise<string> {
  const { messages, temperature = 0.7, maxTokens, model, retries = 3, timeoutMs = 300000 } = options;
  const apiKey = getApiKey();
  const nvidiaModel = model || getModel();

  return withRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(NVIDIA_NIM_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: nvidiaModel,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `NVIDIA NIM API error: ${response.status} ${response.statusText}` +
          (errorData.error?.message ? ` - ${errorData.error.message}` : '')
        );
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content || content.trim().length === 0) {
        throw new Error('Empty response from LLM');
      }

      return content;
    } catch (apiError) {
      if (apiError instanceof Error && apiError.name === 'AbortError') {
        throw new Error(`NVIDIA NIM request timed out after ${timeoutMs}ms`);
      }
      console.error('[LLM] API call failed:', apiError instanceof Error ? apiError.message : String(apiError));
      throw new Error(`LLM API call failed: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
    } finally {
      clearTimeout(timeout);
    }
  }, { maxAttempts: retries });
}

// ─── Structured JSON Completion ───────────────────────────────────────────────

export async function generateJSON<T>(options: CompletionOptions): Promise<T> {
  const jsonInstruction = 'IMPORTANT: Respond with valid JSON only. Do NOT reason, think out loud, or explain your process. Do not use markdown, code fences, or any commentary before or after the JSON. Output the JSON object immediately, matching the expected schema.';
  
  const messages: ChatMessage[] = [
    ...options.messages,
    { role: 'system', content: jsonInstruction },
  ];

  const response = await generateCompletion({
    ...options,
    messages,
    temperature: options.temperature ?? 0.1, // Lower temperature for more reliable JSON
    maxTokens: options.maxTokens ?? 8192, // Enough for full chapters without truncating the JSON
    model: options.model,
  });

  // Robust JSON extraction
  let jsonStr = response.trim();

  // Try direct parse
  try {
    return JSON.parse(jsonStr) as T;
  } catch {}

  // Try to extract from markdown code fences
  const codeFenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeFenceMatch) {
    const fenced = codeFenceMatch[1].trim();
    try { return JSON.parse(fenced) as T; } catch {}
  }

  // The model may emit a "thinking process" preamble or trailing prose around the
  // JSON. Scan for the first balanced JSON object/array that actually parses —
  // this safely skips any commentary and handles nested objects (outline) too.
  const extractBalanced = (s: string): unknown | null => {
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== '{' && s[i] !== '[') continue;
      let depth = 0;
      let inStr = false;
      let esc = false;
      let end = -1;
      for (let j = i; j < s.length; j++) {
        const c = s[j];
        if (inStr) {
          if (esc) esc = false;
          else if (c === '\\') esc = true;
          else if (c === '"') inStr = false;
        } else {
          if (c === '"') inStr = true;
          else if (c === '{' || c === '[') depth++;
          else if (c === '}' || c === ']') { depth--; if (depth === 0) { end = j; break; } }
        }
      }
      if (end !== -1) {
        try { return JSON.parse(s.slice(i, end + 1)); } catch {}
      }
    }
    return null;
  };

  const balanced = extractBalanced(jsonStr);
  if (balanced !== null) return balanced as T;

  console.error('[LLM] Failed to parse JSON from NVIDIA NIM response:', jsonStr.slice(0, 500));
  throw new Error(`Failed to parse LLM JSON response: ${jsonStr.slice(0, 200)}...`);
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
  temperature: number = 0.2,
  model?: string
): Promise<T> {
  return generateJSON<T>({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    model,
  });
}