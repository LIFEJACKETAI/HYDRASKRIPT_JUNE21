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
      provider: 'gemini',
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

describe('Fish Audio primary / Gemini fallback routing', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.FISH_AUDIO_API_KEY = 'fish-test-key';
    process.env.FISH_AUDIO_REFERENCE_ID = 'fish-voice-id';
    process.env.FISH_AUDIO_MODEL = 's2.1-pro-free';
    process.env.GOOGLE_AI_API_KEY = 'gemini-test-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses Fish Audio when configured and returns MP3 audio', async () => {
    const fishBody = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x01]);
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: async () => fishBody.buffer,
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateAudioChunk('Read this passage.', 'Aoede');
    expect(result).toMatchObject({ success: true, provider: 'fish', audioMimeType: 'audio/mpeg' });

    const [url, init] = (fetchMock as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.fish.audio/v1/tts');
    expect((init as RequestInit).headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer fish-test-key',
        model: 's2.1-pro-free',
      })
    );
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.reference_id).toBe('fish-voice-id');
    expect(body.format).toBe('mp3');
  });

  it('falls back to Gemini when the Fish Audio key is missing', async () => {
    delete process.env.FISH_AUDIO_API_KEY;
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
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateAudioChunk('Read this passage.', 'Aoede');
    expect(result.success).toBe(true);
    expect((fetchMock as jest.Mock).mock.calls[0][0]).toContain(
      'https://generativelanguage.googleapis.com/v1beta/models/'
    );
  });

  it('switches to Gemini when the Fish Audio API returns an error', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'invalid api key' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ inlineData: { data: 'AAECAw==', mimeType: 'audio/L16;rate=24000' } }],
            },
          }],
        }),
      });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await generateAudioChunk('Read this passage.', 'Aoede');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ success: true, provider: 'gemini' });
  });
});
