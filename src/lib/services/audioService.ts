// HydraSkript - Audio Service
// Text-to-speech generation using Google's Gemini TTS API.

import { saveFile, generateFilename, createMediaAsset } from '@/lib/utils/storage';
import { audioBase64ToPlayableBuffer } from '@/lib/services/audioFormat';

/** Audiobooks use Gemini only; never reuse the text-generation provider key. */
export function getGeminiTtsConfig() {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Gemini TTS requires GOOGLE_AI_API_KEY or GEMINI_API_KEY; NVIDIA_NIM_API_KEY cannot be used for audiobook speech.');
  }
  return {
    apiKey,
    model: process.env.GEMINI_TTS_MODEL?.trim() || 'gemini-3.1-flash-tts-preview',
  };
}

/**
 * Gemini TTS uses prebuilt voice names, not Google Cloud Text-to-Speech voice
 * IDs. The old implementation sent values such as `en-US-Neural2-C` to the
 * Gemini endpoint, which is a different API and always failed. Keep the legacy
 * aliases below so jobs created by an older build can still be retried.
 */
const VOICE_ALIASES: Record<string, string> = {
  'en-US-Neural2-C': 'Aoede',
  'en-US-Neural2-E': 'Iapetus',
  'en-US-Neural2-F': 'Achernar',
  'en-GB-Neural2-A': 'Sulafat',
  'en-AU-Neural2-A': 'Laomedeia',
  'en-US-Neural2-D': 'Charon',
  'en-US-Neural2-J': 'Zubenelgenubi',
  'en-US-Neural2-A': 'Orus',
  'en-GB-Neural2-B': 'Sadaltager',
  'en-AU-Neural2-B': 'Fenrir',
};

const GEMINI_VOICE_NAMES = new Set([
  'Zephyr',
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Leda',
  'Orus',
  'Aoede',
  'Callirrhoe',
  'Autonoe',
  'Enceladus',
  'Iapetus',
  'Umbriel',
  'Algieba',
  'Despina',
  'Erinome',
  'Algenib',
  'Rasalgethi',
  'Laomedeia',
  'Achernar',
  'Alnilam',
  'Schedar',
  'Gacrux',
  'Pulcherrima',
  'Achird',
  'Zubenelgenubi',
  'Vindemiatrix',
  'Sadachbia',
  'Sadaltager',
  'Sulafat',
]);

export const DEFAULT_GEMINI_VOICE = 'Aoede';

/** Convert a UI/legacy voice id into a voice accepted by Gemini TTS. */
export function normalizeVoiceId(voiceId?: string | null): string {
  const requested = voiceId?.trim();
  if (!requested) return DEFAULT_GEMINI_VOICE;
  if (GEMINI_VOICE_NAMES.has(requested)) return requested;
  return VOICE_ALIASES[requested] ?? DEFAULT_GEMINI_VOICE;
}

/**
 * Generates a short voice preview for the user to hear before committing.
 */
export async function generateVoicePreview(
  voiceId: string
): Promise<{ success: boolean; audioBase64?: string; audioMimeType?: string; error?: string }> {
  const previewText =
    'Hello! I am your AI narrator. I will bring your story to life with emotion and clarity. Does my voice suit your book?';
  return generateAudioChunk(previewText, voiceId);
}

/**
 * Backwards-compatible helper used by older callers that only know a gender or
 * style. Gemini voices do not expose a gender field, so these are intentionally
 * stylistic defaults rather than Google Cloud voice ids.
 */
export function getVoiceId(gender: 'male' | 'female', preferredStyle?: string): string {
  if (preferredStyle?.toLowerCase().includes('clear')) return 'Iapetus';
  if (preferredStyle?.toLowerCase().includes('british')) return 'Sulafat';
  return gender === 'male' ? 'Charon' : DEFAULT_GEMINI_VOICE;
}

/**
 * Chunks text into segments suitable for a single TTS request. It prefers
 * sentence and word boundaries, but always preserves trailing text even when a
 * paragraph has no punctuation.
 */
export function chunkText(text: string, maxLength = 4000): string[] {
  if (!Number.isInteger(maxLength) || maxLength <= 0) {
    throw new Error('Audio chunk length must be a positive integer.');
  }

  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const splitLongSegment = (segment: string): string[] => {
    const pieces: string[] = [];
    let remaining = segment.trim();

    while (remaining.length > maxLength) {
      const window = remaining.slice(0, maxLength + 1);
      const sentenceMatches = [...window.matchAll(/[.!?](?:["'”’)]?)(?=\s|$)/g)];
      const sentenceEnd = sentenceMatches.at(-1)?.index;
      let cutAt = sentenceEnd === undefined ? -1 : sentenceEnd + 1;

      if (cutAt < Math.floor(maxLength * 0.5)) {
        const whitespace = window.slice(0, maxLength + 1).search(/\s(?!.*\s)/);
        cutAt = whitespace > 0 ? whitespace : maxLength;
      }

      const piece = remaining.slice(0, cutAt).trim();
      if (!piece) {
        // This is only reachable for an unusual string made entirely of
        // zero-width whitespace. Advance defensively so the loop terminates.
        cutAt = maxLength;
      }

      pieces.push((piece || remaining.slice(0, cutAt)).trim());
      remaining = remaining.slice(cutAt).trim();
    }

    if (remaining) pieces.push(remaining);
    return pieces;
  };

  const chunks: string[] = [];
  let current = '';
  const paragraphs = normalized.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);

  const flush = () => {
    if (current) {
      chunks.push(current);
      current = '';
    }
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxLength) {
      flush();
      const pieces = splitLongSegment(paragraph);
      chunks.push(...pieces.slice(0, -1));
      current = pieces.at(-1) ?? '';
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxLength) {
      current = candidate;
    } else {
      flush();
      current = paragraph;
    }
  }

  flush();
  return chunks;
}

/** Utility to execute a function with exponential backoff for provider errors. */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 2000): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number })?.status;
      const message = error instanceof Error ? error.message : String(error);
      const transient = status === 429 || (status !== undefined && status >= 500) || /\b(429|500|502|503|504)\b/.test(message);

      if (!transient || attempt >= maxAttempts) throw error;

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`[AudioService] Transient TTS error ${status ?? 'API'}. Retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function getInlineAudio(data: any): { audioBase64: string; mimeType?: string } | null {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;

  for (const part of parts) {
    const inlineData = part?.inlineData ?? part?.inline_data;
    if (typeof inlineData?.data === 'string' && inlineData.data.length > 0) {
      return {
        audioBase64: inlineData.data,
        mimeType: inlineData.mimeType ?? inlineData.mime_type,
      };
    }
  }

  return null;
}

/**
 * Call Gemini's native TTS model. The response is normally raw PCM, so callers
 * must use `audioMimeType` when turning it into a playable file.
 */
export async function generateAudioChunk(
  text: string,
  voiceId: string
): Promise<{ success: boolean; audioBase64?: string; audioMimeType?: string; error?: string }> {
  try {
    return await withRetry(async () => {
      const { apiKey, model } = getGeminiTtsConfig();
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: normalizeVoiceId(voiceId),
                  },
                },
              },
            },
          }),
          signal: AbortSignal.timeout(Number(process.env.GEMINI_TTS_TIMEOUT_MS || 120_000)),
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data?.error?.message || response.statusText || 'Unknown Gemini TTS error';
        const error = new Error(`Gemini TTS API error (${response.status}): ${message}`);
        (error as { status?: number }).status = response.status;
        throw error;
      }

      const inlineAudio = getInlineAudio(data);
      if (!inlineAudio) {
        const finishReason = data?.candidates?.[0]?.finishReason;
        throw new Error(
          `Gemini TTS returned no audio${finishReason ? ` (finish reason: ${finishReason})` : ''}.`
        );
      }

      return {
        success: true,
        audioBase64: inlineAudio.audioBase64,
        audioMimeType: inlineAudio.mimeType || 'audio/L16;codec=pcm;rate=24000',
      };
    });
  } catch (error) {
    console.error('[AudioService] generateAudioChunk failed after retries:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown audio generation error',
    };
  }
}

/**
 * Save one generated segment and create its media-asset record. `bookId` is
 * optional because upload-mode audiobooks are attached to a job, not a saved
 * Book row.
 */
export async function saveAudioChunk(
  ownerId: string,
  bookId: string | undefined,
  chunkIndex: number,
  audioBase64: string,
  options: {
    audioMimeType?: string;
    filePrefix?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<{ success: boolean; publicUrl?: string; mimeType?: string; extension?: string; error?: string }> {
  try {
    const playable = audioBase64ToPlayableBuffer(audioBase64, options.audioMimeType);
    const prefix = options.filePrefix || `audio_chunk_${bookId || 'upload'}_${chunkIndex}`;
    const filename = generateFilename(prefix, playable.extension);
    const publicUrl = await saveFile('audio-chunks', filename, playable.buffer, {
      contentType: playable.mimeType,
    });

    await createMediaAsset({
      ownerId,
      bookId,
      assetType: 'audiobook_chapter',
      storagePath: publicUrl,
      publicUrl,
      metadata: {
        chunkIndex,
        mimeType: playable.mimeType,
        ...options.metadata,
      },
    });

    return {
      success: true,
      publicUrl,
      mimeType: playable.mimeType,
      extension: playable.extension,
    };
  } catch (error) {
    console.error('[AudioService] saveAudioChunk failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save audio chunk',
    };
  }
}
