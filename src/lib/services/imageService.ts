// HydraSkript - Image Generation Service (Hardened for Coloring Books)
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

export interface GenerateImageOptions {
  prompt: string;
  style?: string;
  size?: string;
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

export async function generateImage(options: GenerateImageOptions): Promise<GeneratedImageResult> {
  const { prompt, style = 'pixar', size = '1024x1024', ownerId, bookId, assetType } = options;
  const styleConfig = STYLE_CONFIG[style] || STYLE_CONFIG.pixar;
  const enhancedPrompt = `${prompt}, ${styleConfig.prompt}`;

  try {
    const zai = await getZAI();
    const response = await zai.images.generations.create({ prompt: enhancedPrompt, size });

    if (!response.data?.[0]?.base64) throw new Error('Invalid response from image API');

    const imageBase64 = response.data[0].base64;
    const filename = generateFilename(`${assetType}_${style}`, 'png');
    const publicUrl = saveBase64File(assetType === 'cover' ? 'covers' : 'illustrations', filename, imageBase64);

    const asset = await createMediaAsset({
      ownerId, bookId, assetType, storagePath: publicUrl, publicUrl,
      metadata: { style, size, prompt: enhancedPrompt },
    });

    return { success: true, publicUrl, assetId: asset.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function generateBookCover(bookId: string, ownerId: string, bookTitle: string, genre: string, targetAudience: string, coloringTheme?: string | null): Promise<GeneratedImageResult> {
  const isChildrenBook = ['0-5', '6-9', '10-14'].includes(targetAudience);
  const isColoringBook = genre === 'coloring';
  const style = isColoringBook ? 'lineart-adult' : 'pixar';

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

export async function generateChapterIllustration(bookId: string, ownerId: string, chapterIndex: number, illustrationPrompt: string, style: string = 'pixar'): Promise<GeneratedImageResult> {
  return generateImage({ prompt: illustrationPrompt, style, size: '1344x768', ownerId, bookId, assetType: 'illustration' });
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
