import {
  audioBase64ToPlayableBuffer,
  concatenateWavBuffers,
  extractWavPcm,
  pcmToWavBuffer,
} from '@/lib/services/audioFormat';

function asBase64(buffer: Buffer) {
  return buffer.toString('base64');
}

describe('audiobook audio formatting', () => {
  it('wraps Gemini PCM output in a valid WAV container', () => {
    const pcm = Buffer.from([0, 0, 16, 0, 32, 0, 48, 0]);
    const playable = audioBase64ToPlayableBuffer(
      asBase64(pcm),
      'audio/L16;codec=pcm;rate=24000'
    );

    expect(playable.extension).toBe('wav');
    expect(playable.mimeType).toBe('audio/wav');
    expect(playable.buffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(extractWavPcm(playable.buffer).pcm).toEqual(pcm);
  });

  it('concatenates WAV segments without repeating their headers', () => {
    const first = pcmToWavBuffer(Buffer.from([1, 2, 3, 4]));
    const second = pcmToWavBuffer(Buffer.from([5, 6, 7, 8]));
    const combined = concatenateWavBuffers([first, second]);

    expect(extractWavPcm(combined).pcm).toEqual(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(combined.length).toBe(44 + 8);
  });

  it('preserves an already-containerized WAV response', () => {
    const wav = pcmToWavBuffer(Buffer.from([9, 10]));
    const playable = audioBase64ToPlayableBuffer(asBase64(wav), 'audio/wav');

    expect(playable.extension).toBe('wav');
    expect(playable.buffer).toEqual(wav);
  });
});
