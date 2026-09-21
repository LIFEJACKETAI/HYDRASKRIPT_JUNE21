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
