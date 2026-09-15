jest.mock('@/lib/llm/nvidia-nim', () => ({
  askLLMJSON: jest.fn(),
  askLLM: jest.fn(),
}));

jest.mock('@/lib/llm/openrouter', () => ({
  askLLMJSON: jest.fn(),
  askLLM: jest.fn(),
}));

jest.mock('@/lib/llm/google-gemini', () => ({
  askLLMJSON: jest.fn(),
  askLLM: jest.fn(),
}));

jest.mock('@/lib/llm/mistral', () => ({
  askLLMJSON: jest.fn(),
  askLLM: jest.fn(),
}));


import { askLLMJSONWithFallback, askLLMWithFallback } from '@/lib/llm/fallback';
import {
  askLLMJSON as askGeminiJSON,
  askLLM as askGemini,
} from '@/lib/llm/google-gemini';
import {
  askLLMJSON as askNimJSON,
  askLLM as askNim,
} from '@/lib/llm/nvidia-nim';
import {
  askLLMJSON as askOpenRouterJSON,
  askLLM as askOpenRouter,
} from '@/lib/llm/openrouter';
import {
  askLLMJSON as askMistralJSON,
  askLLM as askMistral,
} from '@/lib/llm/mistral';

const mockAskGeminiJSON = askGeminiJSON as jest.MockedFunction<typeof askGeminiJSON>;
const mockAskGemini = askGemini as jest.MockedFunction<typeof askGemini>;
const mockAskNimJSON = askNimJSON as jest.MockedFunction<typeof askNimJSON>;
const mockAskNim = askNim as jest.MockedFunction<typeof askNim>;
const mockAskOpenRouterJSON = askOpenRouterJSON as jest.MockedFunction<typeof askOpenRouterJSON>;
const mockAskOpenRouter = askOpenRouter as jest.MockedFunction<typeof askOpenRouter>;
const mockAskMistralJSON = askMistralJSON as jest.MockedFunction<typeof askMistralJSON>;
const mockAskMistral = askMistral as jest.MockedFunction<typeof askMistral>;


describe('LLM fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses Gemini for JSON after the NVIDIA NIM and OpenRouter chains are exhausted', async () => {
    mockAskNimJSON.mockRejectedValue(new Error('NIM unavailable'));
    mockAskOpenRouterJSON.mockRejectedValue(new Error('OpenRouter unavailable'));
    mockAskGeminiJSON.mockResolvedValue({ title: 'Gemini result' });

    await expect(askLLMJSONWithFallback<{ title: string }>('system', 'user'))
      .resolves.toEqual({ title: 'Gemini result' });

    expect(mockAskNimJSON).toHaveBeenCalled();
    expect(mockAskOpenRouterJSON).toHaveBeenCalled();
    expect(mockAskGeminiJSON).toHaveBeenCalledWith('system', 'user', 0.2, 'gemini-3.6-flash');
  });

  it('uses Gemini for chapter prose after the NVIDIA NIM and OpenRouter chains are exhausted', async () => {
    mockAskNim.mockRejectedValue(new Error('NIM unavailable'));
    mockAskOpenRouter.mockRejectedValue(new Error('OpenRouter unavailable'));
    mockAskGemini.mockResolvedValue('Gemini chapter prose');

    await expect(askLLMWithFallback('system', 'user', 0.7, 4096))
      .resolves.toBe('Gemini chapter prose');

    expect(mockAskNim).toHaveBeenCalled();
    expect(mockAskOpenRouter).toHaveBeenCalled();
    expect(mockAskGemini).toHaveBeenCalledWith('system', 'user', 0.7, 'gemini-3.6-flash', 4096);
  });

  it('never sends a bare preferred model to NVIDIA NIM — it goes to the Mistral chain instead', async () => {
    // EDITORIAL_REVIEW_MODEL-style preferred model: a bare Mistral name.
    // Sending it to NIM 404s (this was the production 404 noise), so it must
    // only be tried on the Mistral provider.
    mockAskNimJSON.mockRejectedValue(new Error('NIM unavailable'));
    mockAskOpenRouterJSON.mockRejectedValue(new Error('OpenRouter unavailable'));
    mockAskGeminiJSON.mockRejectedValue(new Error('Gemini unavailable'));
    mockAskMistralJSON.mockResolvedValue({ ok: true });

    await expect(askLLMJSONWithFallback<unknown>('system', 'user', 0.2, 'mistral-medium-latest'))
      .resolves.toEqual({ ok: true });

    // The bare name must never reach the NIM provider.
    const nimModelsTried = mockAskNimJSON.mock.calls.map((c) => c[3]);
    expect(nimModelsTried).not.toContain('mistral-medium-latest');
    // …and the Mistral chain must try it FIRST (before the chain defaults).
    expect(mockAskMistralJSON.mock.calls[0][3]).toBe('mistral-medium-latest');
  });

  it('still honours a NIM-prefixed preferred model on the NIM chain', async () => {
    mockAskNimJSON.mockResolvedValue({ ok: true });

    await expect(askLLMJSONWithFallback<unknown>('system', 'user', 0.2, 'nvidia/nemotron-3.5-lightning-30b-a3b'))
      .resolves.toEqual({ ok: true });

    expect(mockAskNimJSON.mock.calls[0][3]).toBe('nvidia/nemotron-3.5-lightning-30b-a3b');
  });
});
