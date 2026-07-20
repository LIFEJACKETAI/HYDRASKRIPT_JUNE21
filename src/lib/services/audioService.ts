// HydraSkript - Audio Service
// Handles text-to-speech generation using Google AI Studio (Gemini)
// Includes text chunking and voice mapping logic

// ... existing imports
import { saveBase64File, generateFilename, createMediaAsset } from '@/lib/utils/storage';

const AUDIOBOOK_VOICES = [
  { id: 'en-US-Neural2-C', gender: 'female', style: 'warm' },
  { id: 'en-US-Neural2-E', gender: 'female', style: 'clear' },
  { id: 'en-GB-Neural2-A', gender: 'female', style: 'british' },
  { id: 'en-US-Neural2-D', gender: 'male', style: 'warm' },
  { id: 'en-US-Neural2-A', gender: 'male', style: 'clear' },
  { id: 'en-GB-Neural2-B', gender: 'male', style: 'british' },
] as const;

/**
 * Generates a short voice preview for the user to hear before committing.
 */
export async function generateVoicePreview(voiceId: string): Promise<{ success: boolean; audioBase64?: string; error?: string }> {
  const previewText = "Hello! I am your AI narrator. I will bring your story to life with emotion and clarity. Does my voice suit your book?";
  return generateAudioChunk(previewText, voiceId);
}




/**
 * Voice configuration for Gemini TTS.
 * Maps gender/style to the specific Google AI Studio voice IDs.
 */
export function getVoiceId(gender: 'male' | 'female', preferredStyle?: string) {
  const voices = AUDIOBOOK_VOICES.filter(v => v.gender === gender);
  if (!preferredStyle) return voices[0].id;

  const matched = voices.find(v => v.style.includes(preferredStyle));
  return matched ? matched.id : voices[0].id;
}

/**
 * Chunks text into segments of maximum length.
 * Ensures we don't split words or sentences mid-way.
 */
export function chunkText(text: string, maxLength = 4000): string[] {
  const chunks: string[] = [];
  let currentChunk = '';

  const paragraphs = text.split(/\n\n+/);

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 <= maxLength) {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    } else {
      if (currentChunk) chunks.push(currentChunk);

      // If a single paragraph is longer than maxLength, split it by sentences
      if (paragraph.length > maxLength) {
        const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [paragraph];
        let sentenceChunk = '';

        for (const sentence of sentences) {
          if (sentenceChunk.length + sentence.length <= maxLength) {
            sentenceChunk += sentence;
          } else {
            chunks.push(sentenceChunk);
            sentenceChunk = sentence;
          }
        }
        if (sentenceChunk) currentChunk = sentenceChunk;
      } else {
        currentChunk = paragraph;
      }
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

/**
 * Utility to execute a function with exponential backoff.
 * Specifically used to handle transient 429 (Too Many Requests) and 503 (Service Unavailable) errors.
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 2000): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const status = error?.status || error?.response?.status;
      
      // Only retry on transient errors (429 Too Many Requests or 503 Service Unavailable)
      if (status === 429 || status === 503 || error.message?.includes('429') || error.message?.includes('503')) {
        if (attempt < maxAttempts) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          console.warn(`[AudioService] Transient error ${status || 'API'}. Retrying in ${delay}ms... (Attempt ${attempt}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      // For non-transient errors, fail immediately
      throw error;
    }
  }
  throw lastError;
}

/**
 * Calls Google AI Studio (Gemini) TTS API to generate audio for a chunk of text.
 * Returns the base64 audio data.
 */
export async function generateAudioChunk(
  text: string,
  voiceId: string
): Promise<{ success: boolean; audioBase64?: string; error?: string }> {
  try {
    return await withRetry(async () => {
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is not configured');

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/text-to-speech:synthesize?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { name: voiceId },
          audioConfig: { audioEncoding: 'MP3' },
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        // We throw the status so the retry wrapper can identify 429/503
        const error = new Error(`Gemini TTS API error: ${errData.error?.message || response.statusText}`);
        (error as any).status = response.status;
        throw error;
      }

      const data = await response.json();
      if (!data.audioContent) throw new Error('No audio content returned from API');

      return { success: true, audioBase64: data.audioContent };
    });
  } catch (error) {
    console.error('[AudioService] generateAudioChunk failed after retries:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown audio generation error'
    };
  }
}

/**
 * Saves a generated audio chunk to storage and creates a media asset record.
 */
export async function saveAudioChunk(
  ownerId: string,
  bookId: string,
  chunkIndex: number,
  audioBase64: string
): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
  try {
    const filename = generateFilename(`audio_chunk_${bookId}_${chunkIndex}`, 'mp3');
    const publicUrl = await saveBase64File('audio-chunks', filename, audioBase64, {
      contentType: 'audio/mpeg',
    });

    await createMediaAsset({
      ownerId,
      bookId,
      assetType: 'audiobook_chapter',
      storagePath: publicUrl,
      publicUrl,
      metadata: { chunkIndex },
    });

    return { success: true, publicUrl };
  } catch (error) {
    console.error('[AudioService] saveAudioChunk failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save audio chunk'
    };
  }
}
