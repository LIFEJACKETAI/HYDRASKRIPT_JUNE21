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

const mockAskGeminiJSON = askGeminiJSON as jest.MockedFunction<typeof askGeminiJSON>;
const mockAskGemini = askGemini as jest.MockedFunction<typeof askGemini>;
const mockAskNimJSON = askNimJSON as jest.MockedFunction<typeof askNimJSON>;
const mockAskNim = askNim as jest.MockedFunction<typeof askNim>;
const mockAskOpenRouterJSON = askOpenRouterJSON as jest.MockedFunction<typeof askOpenRouterJSON>;
const mockAskOpenRouter = askOpenRouter as jest.MockedFunction<typeof askOpenRouter>;

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
    expect(mockAskGeminiJSON).toHaveBeenCalledWith('system', 'user', 0.2, 'gemini-2.5-flash');
  });

  it('uses Gemini for chapter prose after the NVIDIA NIM and OpenRouter chains are exhausted', async () => {
    mockAskNim.mockRejectedValue(new Error('NIM unavailable'));
    mockAskOpenRouter.mockRejectedValue(new Error('OpenRouter unavailable'));
    mockAskGemini.mockResolvedValue('Gemini chapter prose');

    await expect(askLLMWithFallback('system', 'user', 0.7, 4096))
      .resolves.toBe('Gemini chapter prose');

    expect(mockAskNim).toHaveBeenCalled();
    expect(mockAskOpenRouter).toHaveBeenCalled();
    expect(mockAskGemini).toHaveBeenCalledWith('system', 'user', 0.7, 'gemini-2.5-flash', 4096);
  });
});
