jest.mock('@/lib/utils/storage', () => ({
  saveFile: jest.fn(),
  generateFilename: jest.fn(),
  createMediaAsset: jest.fn(),
}));

import { chunkText, generateAudioChunk, normalizeVoiceId } from '@/lib/services/audioService';

describe('audiobook text and voice preparation', () => {
  it('does not drop text when a paragraph has no sentence punctuation', () => {
    const text = 'word '.repeat(1200).trim();
    const chunks = chunkText(text, 400);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(' ').replace(/\s+/g, ' ').trim()).toBe(text.replace(/\s+/g, ' ').trim());
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThanOrEqual(400);
  });

  it('keeps paragraph boundaries and uses supported Gemini voice names', () => {
    const chunks = chunkText('First paragraph.\n\nSecond paragraph.');

    expect(chunks).toEqual(['First paragraph.\n\nSecond paragraph.']);
    expect(normalizeVoiceId('en-US-Neural2-C')).toBe('Aoede');
    expect(normalizeVoiceId('Charon')).toBe('Charon');
    expect(normalizeVoiceId('unknown-voice')).toBe('Aoede');
  });

  it('calls the Gemini generateContent TTS endpoint and returns inline audio', async () => {
    const previousKey = process.env.GOOGLE_AI_API_KEY;
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{ inlineData: { data: 'AAECAw==', mimeType: 'audio/L16;rate=24000' } }],
          },
        }],
      }),
    });
    global.fetch = fetchMock;

    await expect(generateAudioChunk('Read this passage.', 'Aoede')).resolves.toEqual({
      success: true,
      audioBase64: 'AAECAw==',
      audioMimeType: 'audio/L16;rate=24000',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'test-key' }),
        body: expect.stringContaining('"voiceName":"Aoede"'),
      })
    );

    if (previousKey === undefined) delete process.env.GOOGLE_AI_API_KEY;
    else process.env.GOOGLE_AI_API_KEY = previousKey;
  });
});

describe('Gemini-only TTS provider routing', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    delete process.env.GOOGLE_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_TTS_MODEL;
    process.env.NVIDIA_NIM_API_KEY = 'nvidia-must-not-be-used';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [
        { inlineData: { data: 'AAECAw==', mimeType: 'audio/L16;rate=24000' } },
      ] } }] }),
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('rejects a NVIDIA-only configuration without making an API call', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = await generateAudioChunk('Existing ebook text.', 'Aoede');
    expect(result.success).toBe(false);
    expect(result.error).toContain('GOOGLE_AI_API_KEY or GEMINI_API_KEY');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'])('uses %s for the requested TTS model, never NVIDIA', async (key) => {
    process.env[key] = 'google-test-key';
    process.env.GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
    expect((await generateAudioChunk('Existing ebook text.', 'Charon')).success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('google-test-key');
    expect(JSON.parse(init.body).generationConfig.responseModalities).toEqual(['AUDIO']);
    expect(JSON.parse(init.body).contents[0].parts[0].text).toBe('Existing ebook text.');
  });

  it('honors an explicit model override', async () => {
    process.env.GEMINI_API_KEY = 'google-test-key';
    process.env.GEMINI_TTS_MODEL = 'test-tts-model';
    await generateAudioChunk('Text.', 'Aoede');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/models/test-tts-model:generateContent');
  });
});
