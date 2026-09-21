import { LlmBudgetExceededError, transientProgressMessage } from '@/lib/llm/budget';

describe('queue retry explanations', () => {
  it('does not blame providers for an internal claim timeout, even with a nested 503', () => {
    expect(transientProgressMessage(new LlmBudgetExceededError('last response 503'), 1, 3, 'generate_audiobook'))
      .toBe('Processing time limit reached — re-queued, retry 1/3.');
  });

  it('identifies Gemini TTS for audiobook provider retries', () => {
    expect(transientProgressMessage(new Error('Gemini TTS API error (429)'), 2, 3, 'generate_audiobook'))
      .toBe('Gemini TTS temporarily unavailable or rate-limited — re-queued, retry 2/3.');
  });

  it('does not label text generation as Gemini TTS', () => {
    expect(transientProgressMessage(new Error('503'), 1, 3, 'write_chapter'))
      .toBe('AI provider temporarily unavailable or rate-limited — re-queued, retry 1/3.');
  });
});
