import { askLLMJSON } from '@/lib/llm/openrouter';

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-1.5-flash';

function hasGeminiApiKey(): boolean {
  return Boolean(process.env.GOOGLE_AI_API_KEY);
}

function isOpenRouterRecoverableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes('openrouter_api_key is not set') ||
    message.includes('openrouter api error: 401') ||
    message.includes('openrouter api error: 402') ||
    message.includes('openrouter api error: 403') ||
    message.includes('user not found') ||
    message.includes('invalid api key') ||
    message.includes('unauthorized') ||
    message.includes('no auth credentials found')
  );
}

async function askGeminiJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.2
): Promise<T> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY is not configured');
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: DEFAULT_GEMINI_MODEL });

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              `${systemPrompt}\n\n` +
              'IMPORTANT: Respond with valid JSON only. No markdown, no code fences, no extra text. Just the JSON object.\n\n' +
              `${userPrompt}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature,
      responseMimeType: 'application/json',
    },
  });

  const text = result.response.text().trim();

  if (!text) {
    throw new Error('Empty response from Gemini');
  }

  let jsonStr = text;
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      try {
        return JSON.parse(jsonStr.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        throw new Error(`Failed to parse Gemini JSON response: ${jsonStr.slice(0, 200)}...`);
      }
    }

    throw new Error(`Failed to parse Gemini JSON response: ${jsonStr.slice(0, 200)}...`);
  }
}

export async function askLLMJSONWithFallback<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.2
): Promise<T> {
  try {
    return await askLLMJSON<T>(systemPrompt, userPrompt, temperature);
  } catch (error) {
    if (!isOpenRouterRecoverableError(error)) {
      throw error;
    }

    if (!hasGeminiApiKey()) {
      const originalMessage = error instanceof Error ? error.message : 'Unknown OpenRouter error';
      throw new Error(
        `Text generation is unavailable: OpenRouter failed (${originalMessage}) and GOOGLE_AI_API_KEY is not configured for Gemini fallback.`
      );
    }

    console.warn(
      '[LLM] OpenRouter failed with a recoverable auth/provider error. Falling back to Gemini:',
      error instanceof Error ? error.message : String(error)
    );

    try {
      return await askGeminiJSON<T>(systemPrompt, userPrompt, temperature);
    } catch (fallbackError) {
      const originalMessage = error instanceof Error ? error.message : 'Unknown OpenRouter error';
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(
        `Text generation failed in both providers. OpenRouter: ${originalMessage}. Gemini fallback: ${fallbackMessage}.`
      );
    }
  }
}
