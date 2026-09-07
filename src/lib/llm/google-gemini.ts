// HydraSkript - Google Gemini LLM Client
// Uses Google AI Studio REST API directly (no SDK required)
// MUST be used in backend code only

// ─── Configuration ─────────────────────────────────────────────────────────────

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function getApiKey(): string {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY is not set in environment variables');
  }
  return apiKey;
}

function getModel(): string {
  return process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash';
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
      console.error(`[LLM] Gemini Attempt ${attempt}/${maxAttempts} failed:`, lastError.message);

      // Don't retry on 404 (model not found), 401 (auth error), or timeout
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
 * Generate a chat completion using Google Gemini REST API.
 * Converts OpenAI-style messages to Gemini's generateContent format.
 */
export async function generateCompletion(options: CompletionOptions): Promise<string> {
  const { messages, temperature = 0.7, maxTokens, model, retries = 3, timeoutMs = 300000 } = options;
  const apiKey = getApiKey();
  const geminiModel = model || getModel();

  return withRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Convert OpenAI-style messages to Gemini format
      // Gemini uses 'user' and 'model' roles, with systemInstruction at top level
      let systemInstruction = '';
      const geminiMessages: { role: string; parts: { text: string }[] }[] = [];

      for (const msg of messages) {
        if (msg.role === 'system') {
          systemInstruction += (systemInstruction ? '\n' : '') + msg.content;
        } else {
          geminiMessages.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
          });
        }
      }

      // Ensure conversation starts with 'user'
      if (geminiMessages.length > 0 && geminiMessages[0].role !== 'user') {
        geminiMessages.unshift({ role: 'user', parts: [{ text: '.' }] });
      }

      const url = `${GEMINI_API_BASE}/models/${geminiModel}:generateContent?key=${apiKey}`;

      const body: Record<string, unknown> = {
        contents: geminiMessages,
        generationConfig: {
          temperature,
          ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
        },
      };

      if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Gemini API error: ${response.status} ${response.statusText}` +
          (errorData.error?.message ? ` - ${errorData.error.message}` : '')
        );
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content || content.trim().length === 0) {
        throw new Error('Empty response from Gemini');
      }

      return content;
    } catch (apiError) {
      if (apiError instanceof Error && apiError.name === 'AbortError') {
        throw new Error(`Gemini request timed out after ${timeoutMs}ms`);
      }
      console.error('[LLM] Gemini API call failed:', apiError instanceof Error ? apiError.message : String(apiError));
      throw new Error(`Gemini API call failed: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
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
    temperature: options.temperature ?? 0.1,
    maxTokens: options.maxTokens ?? 8192,
    model: options.model,
  });

  // Robust JSON extraction
  let jsonStr = response.trim();

  try {
    return JSON.parse(jsonStr) as T;
  } catch {}

  const codeFenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeFenceMatch) {
    const fenced = codeFenceMatch[1].trim();
    try { return JSON.parse(fenced) as T; } catch {}
  }

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

  console.error('[LLM] Failed to parse JSON from Gemini response:', jsonStr.slice(0, 500));
  throw new Error(`Failed to parse Gemini JSON response: ${jsonStr.slice(0, 200)}...`);
}

// ─── Convenience Functions ──────────────────────────────────────────────────

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
