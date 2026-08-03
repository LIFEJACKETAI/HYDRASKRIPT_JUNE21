// HydraSkript - Image Generation Service (Hardened for Coloring Books)
// Primary backend: Google Gemini 2.5 Flash Image. Fallback: Pollinations AI.
import { saveBase64File, generateFilename, createMediaAsset } from '@/lib/utils/storage';
import { STYLE_CONFIG, COLORING_THEMES } from '@/types';
import type { ColoringTheme } from '@/types';

type ImageSize = '1024x1024' | '768x1344' | '864x1152' | '1344x768' | '1152x864' | '1440x720' | '720x1440';

export interface GenerateImageOptions {
  prompt: string;
  style?: string;
  size?: ImageSize;
  ownerId: string;
  bookId?: string;
  assetType: string;
}

export interface GeneratedImageResult {
  success: boolean;
  publicUrl?: string;
  assetId?: string;
  error?: string;
}

/**
 * Persist a generated base64 image and register a media asset.
 */
async function persistAsset(params: {
  base64: string;
  mimeType: string;
  assetType: string;
  style: string;
  ownerId: string;
  bookId?: string;
  prompt: string;
}): Promise<GeneratedImageResult> {
  try {
    const { base64, mimeType, assetType, style, ownerId, bookId, prompt } = params;
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
    const filename = generateFilename(`${assetType}_${style}`, ext);
    const publicUrl = await saveBase64File(
      assetType === 'cover' ? 'covers' : 'illustrations',
      filename,
      base64,
      { contentType: mimeType || 'image/png' }
    );
    const asset = await createMediaAsset({
      ownerId,
      bookId,
      assetType,
      storagePath: publicUrl,
      publicUrl,
      metadata: { style, prompt },
    });
    return { success: true, publicUrl, assetId: asset.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Backend 1: Google Gemini 2.5 Flash Image.
 * Returns base64 inside candidates[].content.parts[].inlineData.
 * Now with retry logic for quota limits (429 Too Many Requests).
 */
async function generateWithGemini(prompt: string, options: GenerateImageOptions): Promise<GeneratedImageResult> {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY as string);
    const modelName = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
    const model = genAI.getGenerativeModel({ model: modelName });

    // Retry logic for 429 Too Many Requests errors
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await model.generateContent(prompt);
        const parts: any[] = result.response?.candidates?.[0]?.content?.parts || [];
        const imagePart: any = parts.find((p: any) => p.inlineData && p.inlineData.data);
        if (!imagePart || !imagePart.inlineData) {
          const text = parts.filter((p: any) => p.text).map((p: any) => p.text).join('');
          return { success: false, error: `Gemini returned no image. ${text ? 'Text: ' + text.slice(0, 200) : ''}` };
        }
        const data: string = imagePart.inlineData.data;
        const mimeType: string = imagePart.inlineData.mimeType;
        return persistAsset({
          base64: data,
          mimeType: mimeType || 'image/png',
          assetType: options.assetType,
          style: options.style || 'pixar',
          ownerId: options.ownerId,
          bookId: options.bookId,
          prompt,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('429 Too Many Requests')) {
          if (attempt === maxRetries) {
            throw error;
          }
          console.warn(`[imageService] Gemini quota limit hit, retrying (attempt ${attempt}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt), 10000))); // Exponential backoff
        } else {
          throw error;
        }
      }
    }

    throw new Error('Maximum retry attempts exceeded for Gemini image generation');
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Backend 2: Pollinations AI.
 * Fetches image from URL and converts to base64.
 */
async function generateWithPollinations(prompt: string, size: ImageSize, options: GenerateImageOptions): Promise<GeneratedImageResult> {
  try {
    // Pollinations uses URL-encoded prompts, convert to base64
    const encodedPrompt = encodeURIComponent(prompt);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true`;

    const response = await fetch(pollinationsUrl);
    if (!response.ok) {
      throw new Error(`Pollinations API error: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/png';

    return persistAsset({
      base64,
      mimeType: contentType,
      assetType: options.assetType,
      style: options.style || 'pixar',
      ownerId: options.ownerId,
      bookId: options.bookId,
      prompt,
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Generate an image using available backends (Gemini primary, Pollinations fallback)
 */
export async function generateImage(options: GenerateImageOptions): Promise<GeneratedImageResult> {
  const { prompt, style = 'pixar', size = '1024x1024', ownerId, bookId, assetType } = options;
  const styleConfig = STYLE_CONFIG[style] || STYLE_CONFIG.pixar;
  const enhancedPrompt = `${prompt}, ${styleConfig.prompt}`;

  // Primary: Gemini
  if (process.env.GOOGLE_AI_API_KEY) {
    const geminiResult = await generateWithGemini(enhancedPrompt, { ...options, prompt: enhancedPrompt });
    if (geminiResult.success) return geminiResult;
    console.error('[imageService] Gemini image generation failed:', geminiResult.error);
  }

  // Fallback: Pollinations
  const pollinationsResult = await generateWithPollinations(enhancedPrompt, size, options);
  if (pollinationsResult.success) return pollinationsResult;
  return { success: false, error: pollinationsResult.error || 'All image backends failed.' };
}

/**
 * Generate a book cover based on genre, audience, and theme.
 */
export async function generateBookCover(bookId: string, ownerId: string, bookTitle: string, genre: string, targetAudience: string, coloringTheme?: string | null): Promise<GeneratedImageResult> {
  const isChildrenBook = ['0-5', '6-9', '10-14'].includes(targetAudience);
  const isColoringBook = genre === 'coloring';
  const style = isColoringBook
    ? (isChildrenBook ? 'lineart' : 'lineart-adult')
    : 'pixar';

  let coverPrompt: string;
  if (isColoringBook && coloringTheme && COLORING_THEMES[coloringTheme as ColoringTheme]) {
    const themeConfig = COLORING_THEMES[coloringTheme as ColoringTheme];
    coverPrompt = `${themeConfig.coverPrompt}. Book title: "${bookTitle}". Pure black and white line art, no shading.`;
  } else if (isChildrenBook) {
    coverPrompt = `Children's book cover for "${bookTitle}". ${genre} genre. Bright, colorful, inviting, no text.`;
  } else {
    coverPrompt = `Professional book cover for "${bookTitle}". ${genre} genre. Cinematic, elegant, no text.`;
  }

  return generateImage({ prompt: coverPrompt, style, size: '1344x768', ownerId, bookId, assetType: 'cover' });
}

/**
 * Generate a chapter illustration with character consistency support.
 */
export async function generateChapterIllustration(bookId: string, ownerId: string, chapterIndex: number, illustrationPrompt: string, style: string = 'pixar', characterNames?: string[]): Promise<GeneratedImageResult> {
  // Character Consistency Logic: If we have names, we append a consistency anchor to the prompt
  let finalPrompt = illustrationPrompt;
  if (characterNames && characterNames.length > 0) {
    const hero = characterNames[0];
    finalPrompt = `Character consistency: The main character is named ${hero}. ${illustrationPrompt}. Ensure ${hero} looks the same as in previous illustrations.`;
  }

  return generateImage({ prompt: finalPrompt, style, size: '1344x768', ownerId, bookId, assetType: 'illustration' });
}

/**
 * Generate a coloring page with appropriate style for children or adults.
 */
export async function generateColoringPage(bookId: string, ownerId: string, chapterIndex: number, subject: string, theme?: ColoringTheme | null): Promise<GeneratedImageResult> {
  const isAdultTheme = !!theme;
  const themeConfig = theme ? COLORING_THEMES[theme] : null;

  const adultStyleAddon = isAdultTheme
    ? 'intricate details, fine lines, professional quality line art, detailed patterns, suitable for adult coloring'
    : 'simple composition, thick outlines, for children to color';

  const promptPrefix = themeConfig ? themeConfig.pagePromptPrefix : 'Coloring book page:';
  const prompt = `${promptPrefix} ${subject}. ${adultStyleAddon}. Pure black and white line art, clean white background, no shading, no grayscale, no color, high contrast.`;

  return generateImage({
    prompt,
    style: isAdultTheme ? 'lineart-adult' : 'lineart',
    size: '1024x1024',
    ownerId,
    bookId,
    assetType: 'coloring_page',
  });
}