// Audio format helpers used by the audiobook worker.
//
// Gemini TTS returns raw 16-bit PCM (24 kHz, mono), not an MP3 file. Keeping
// the conversion here makes it impossible to accidentally save raw PCM with an
// .mp3 extension (which was the reason generated files could not be played).

import { Buffer } from 'node:buffer';

export interface PlayableAudio {
  buffer: Buffer;
  mimeType: string;
  extension: 'wav' | 'mp3' | 'ogg' | 'opus' | 'aac' | 'm4a' | 'flac';
}

export interface PcmAudioOptions {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
}

const WAV_HEADER_SIZE = 44;

function normalizePcmOptions(options: PcmAudioOptions = {}) {
  const sampleRate = options.sampleRate ?? 24_000;
  const channels = options.channels ?? 1;
  const bitsPerSample = options.bitsPerSample ?? 16;

  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new Error('Audio sample rate must be a positive integer.');
  }
  if (!Number.isInteger(channels) || channels <= 0) {
    throw new Error('Audio channel count must be a positive integer.');
  }
  if (![8, 16, 24, 32].includes(bitsPerSample)) {
    throw new Error('Audio bit depth must be 8, 16, 24, or 32 bits.');
  }

  return { sampleRate, channels, bitsPerSample };
}

/** Return true when a buffer starts with a RIFF/WAVE header. */
export function isWavBuffer(buffer: Uint8Array): boolean {
  return (
    buffer.length >= 12 &&
    Buffer.from(buffer.subarray(0, 4)).toString('ascii') === 'RIFF' &&
    Buffer.from(buffer.subarray(8, 12)).toString('ascii') === 'WAVE'
  );
}

/**
 * Wrap raw PCM samples in a standard RIFF/WAVE container.
 * Gemini's TTS response is signed little-endian 16-bit PCM.
 */
export function pcmToWavBuffer(pcm: Uint8Array, options: PcmAudioOptions = {}): Buffer {
  const { sampleRate, channels, bitsPerSample } = normalizePcmOptions(options);
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(WAV_HEADER_SIZE);
  const data = Buffer.from(pcm);

  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 4, 'ascii');
  header.write('fmt ', 12, 4, 'ascii');
  header.writeUInt32LE(16, 16); // PCM fmt chunk length
  header.writeUInt16LE(1, 20); // WAVE_FORMAT_PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 4, 'ascii');
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

/**
 * Read the PCM data and format from a WAVE file. The parser accepts extra RIFF
 * chunks (for example LIST or fact) instead of assuming the data starts at byte
 * 44.
 */
export function extractWavPcm(buffer: Uint8Array): {
  pcm: Buffer;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
} {
  if (!isWavBuffer(buffer)) {
    throw new Error('Expected a RIFF/WAVE audio buffer.');
  }

  const source = Buffer.from(buffer);
  let offset = 12;
  let sampleRate: number | undefined;
  let channels: number | undefined;
  let bitsPerSample: number | undefined;
  let pcm: Buffer | undefined;

  while (offset + 8 <= source.length) {
    const chunkId = source.toString('ascii', offset, offset + 4);
    const chunkSize = source.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = Math.min(chunkStart + chunkSize, source.length);

    if (chunkId === 'fmt ' && chunkEnd - chunkStart >= 16) {
      const audioFormat = source.readUInt16LE(chunkStart);
      if (audioFormat !== 1) {
        throw new Error(`Unsupported WAVE encoding ${audioFormat}; expected PCM.`);
      }
      channels = source.readUInt16LE(chunkStart + 2);
      sampleRate = source.readUInt32LE(chunkStart + 4);
      bitsPerSample = source.readUInt16LE(chunkStart + 14);
    } else if (chunkId === 'data') {
      pcm = source.subarray(chunkStart, chunkEnd);
    }

    // RIFF chunks are word aligned.
    offset = chunkEnd + (chunkSize % 2);
  }

  if (!pcm || !sampleRate || !channels || !bitsPerSample) {
    throw new Error('WAVE file is missing a PCM format or data chunk.');
  }

  return { pcm, sampleRate, channels, bitsPerSample };
}

/** Concatenate valid WAVE buffers and return one playable WAVE file. */
export function concatenateWavBuffers(buffers: Uint8Array[]): Buffer {
  if (buffers.length === 0) {
    throw new Error('Cannot assemble an audiobook with no audio segments.');
  }

  const parsed = buffers.map(extractWavPcm);
  const first = parsed[0];
  const sameFormat = parsed.every(
    (part) =>
      part.sampleRate === first.sampleRate &&
      part.channels === first.channels &&
      part.bitsPerSample === first.bitsPerSample
  );

  if (!sameFormat) {
    throw new Error('Audio segments use incompatible WAVE formats.');
  }

  return pcmToWavBuffer(Buffer.concat(parsed.map((part) => part.pcm)), {
    sampleRate: first.sampleRate,
    channels: first.channels,
    bitsPerSample: first.bitsPerSample,
  });
}

function sampleRateFromMimeType(mimeType: string): number {
  const match = mimeType.match(/(?:rate|samplerate)\s*=\s*(\d+)/i);
  return match ? Number(match[1]) : 24_000;
}

function extensionForMimeType(mimeType: string): PlayableAudio['extension'] {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('opus')) return 'opus';
  if (normalized.includes('aac')) return 'aac';
  if (normalized.includes('m4a')) return 'm4a';
  if (normalized.includes('flac')) return 'flac';
  return 'wav';
}

/**
 * Turn a base64 audio response into a file with a truthful extension/MIME type.
 * Raw PCM is converted to WAV; already-containerized responses are preserved.
 */
export function audioBase64ToPlayableBuffer(
  audioBase64: string,
  mimeType = 'audio/L16;codec=pcm;rate=24000'
): PlayableAudio {
  const source = Buffer.from(audioBase64, 'base64');

  if (isWavBuffer(source)) {
    return { buffer: source, mimeType: 'audio/wav', extension: 'wav' };
  }

  const normalizedMimeType = mimeType.toLowerCase();
  const isRawPcm =
    normalizedMimeType.includes('audio/l16') ||
    normalizedMimeType.includes('audio/pcm') ||
    normalizedMimeType.includes('audio/raw') ||
    normalizedMimeType.includes('application/octet-stream');

  if (isRawPcm || extensionForMimeType(mimeType) === 'wav') {
    return {
      buffer: pcmToWavBuffer(source, { sampleRate: sampleRateFromMimeType(mimeType) }),
      mimeType: 'audio/wav',
      extension: 'wav',
    };
  }

  return {
    buffer: source,
    mimeType: mimeType.split(';')[0] || 'application/octet-stream',
    extension: extensionForMimeType(mimeType),
  };
}
