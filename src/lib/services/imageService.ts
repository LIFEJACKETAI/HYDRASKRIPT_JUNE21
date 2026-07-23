// HydraSkript - Image Generation Service (Hardened for Coloring Books)
// Primary backend: Google Gemini 2.5 Flash Image. Fallback: Z.AI (glm-image).
import ZAI from 'z-ai-web-dev-sdk';
import { saveBase64File, generateFilename, createMediaAsset } from '@/lib/utils/storage';
import { STYLE_CONFIG, COLORING_THEMES } from '@/types';
import type { ColoringTheme } from '@/types';
import { db } from '@/lib/db';

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;
async function getZAI() {
  if (!zaiInstance) zaiInstance = await ZAI.create();
  return zaiInstance;
}

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
 */
async function generateWithGemini(prompt: string, options: GenerateImageOptions): Promise<GeneratedImageResult> {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY as string);
    const modelName = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
    const model = genAI.getGenerativeModel({ model: modelName });
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
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Backend 2: Z.AI (glm-image). Kept as a fallback if Gemini is unavailable.
 */
async function generateWithZAI(prompt: string, size: ImageSize, options: GenerateImageOptions): Promise<GeneratedImageResult> {
  try {
    const zai = await getZAI();
    const response = await zai.images.generations.create({
      model: process.env.ZAI_IMAGE_MODEL || 'glm-image',
      prompt,
      size,
    });
    if (!response.data?.[0]?.base64) throw new Error('Invalid response from image API');
    const imageBase64 = response.data[0].base64;
    return persistAsset({
      base64: imageBase64,
      mimeType: 'image/png',
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

  // Fallback: Z.AI
  const zaiResult = await generateWithZAI(enhancedPrompt, size, options);
  if (zaiResult.success) return zaiResult;
  return { success: false, error: zaiResult.error || 'All image backends failed.' };
}

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

export async function generateChapterIllustration(bookId: string, ownerId: string, chapterIndex: number, illustrationPrompt: string, style: string = 'pixar', characterNames?: string[]): Promise<GeneratedImageResult> {
  // Character Consistency Logic: If we have names, we append a consistency anchor to the prompt
  let finalPrompt = illustrationPrompt;
  if (characterNames && characterNames.length > 0) {
    const hero = characterNames[0];
    finalPrompt = `Character consistency: The main character is named ${hero}. ${illustrationPrompt}. Ensure ${hero} looks the same as in previous illustrations.`;
  }

  return generateImage({ prompt: finalPrompt, style, size: '1344x768', ownerId, bookId, assetType: 'illustration' });
}

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
