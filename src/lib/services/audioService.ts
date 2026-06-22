// HydraSkript - Audio Service
// Handles text-to-speech generation using Google AI Studio (Gemini)
// Includes text chunking and voice mapping logic

// ... existing imports
import { saveBase64File, generateFilename, createMediaAsset } from '@/lib/utils/storage';

/**
 * Generates a short voice preview for the user to hear before committing.
 */
export async function generateVoicePreview(voiceId: string): Promise<{ success: boolean; audioBase64?: string; error?: string }> {
  const previewText = "Hello! I am your AI narrator. I will bring your story to life with emotion and clarity. Does my voice suit your book?";
  return generateAudioChunk(previewText, voiceId);
}

/**
 * Calls Google AI Studio (Gemini) TTS API...
 */
export async function generateAudioChunk(
// ... rest of function


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
 * Calls Google AI Studio (Gemini) TTS API to generate audio for a chunk of text.
 * Returns the base64 audio data.
 */
export async function generateAudioChunk(
  text: string,
  voiceId: string
): Promise<{ success: boolean; audioBase64?: string; error?: string }> {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is not configured');

    // Using the Google AI Studio TTS endpoint
    // Note: This is a conceptual implementation of the Gemini TTS API call
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
      const errData = await response.json();
      throw new Error(`Gemini TTS API error: ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    if (!data.audioContent) throw new Error('No audio content returned from API');

    return { success: true, audioBase64: data.audioContent };
  } catch (error) {
    console.error('[AudioService] generateAudioChunk failed:', error);
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
    const publicUrl = saveBase64File('audio-chunks', filename, audioBase64);

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
