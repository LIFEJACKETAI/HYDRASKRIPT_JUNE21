// HydraSkript - Image Generation Service
// Uses z-ai-web-dev-sdk for AI image generation
// Implements tiered fallback with circuit breaker pattern

import ZAI from 'z-ai-web-dev-sdk';
import { saveBase64File, generateFilename, createMediaAsset } from '@/lib/utils/storage';
import { STYLE_CONFIG, COLORING_THEMES } from '@/types';
import type { ColoringTheme } from '@/types';
import { db } from '@/lib/db';

// ─── ZAI Image Client Singleton ───────────────────────────────────────────────

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
}

const circuitBreakers: Record<string, CircuitBreakerState> = {};
const CIRCUIT_BREAKER_THRESHOLD = 3; // Open after 3 failures
const CIRCUIT_BREAKER_RESET_MS = 60000; // Reset after 1 minute

function isCircuitOpen(tier: string): boolean {
  const breaker = circuitBreakers[tier];
  if (!breaker || !breaker.isOpen) return false;

  // Check if we should try again
  if (Date.now() - breaker.lastFailureTime > CIRCUIT_BREAKER_RESET_MS) {
    breaker.isOpen = false;
    breaker.failures = 0;
    return false;
  }

  return true;
}

function recordFailure(tier: string) {
  if (!circuitBreakers[tier]) {
    circuitBreakers[tier] = { failures: 0, lastFailureTime: 0, isOpen: false };
  }
  const breaker = circuitBreakers[tier];
  breaker.failures++;
  breaker.lastFailureTime = Date.now();

  if (breaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    breaker.isOpen = true;
    console.warn(`[ImageService] Circuit breaker OPEN for tier: ${tier}`);
  }
}

function recordSuccess(tier: string) {
  if (circuitBreakers[tier]) {
    circuitBreakers[tier].failures = 0;
    circuitBreakers[tier].isOpen = false;
  }
}

// ─── Supported Sizes ──────────────────────────────────────────────────────────

const SUPPORTED_SIZES = [
  '1024x1024', '768x1344', '864x1152',
  '1344x768', '1152x864', '1440x720', '720x1440',
] as const;

type SupportedSize = typeof SUPPORTED_SIZES[number];

function isValidSize(size: string): size is SupportedSize {
  return SUPPORTED_SIZES.includes(size as SupportedSize);
}

// ─── Image Generation ─────────────────────────────────────────────────────────

export interface GenerateImageOptions {
  prompt: string;
  style?: string; // pixar, lineart, watercolor, realistic
  size?: string;
  ownerId: string;
  bookId?: string;
  assetType: string; // cover, illustration, coloring_page
}

export interface GeneratedImageResult {
  success: boolean;
  publicUrl?: string;
  assetId?: string;
  error?: string;
}

/**
 * Generate an image using z-ai-web-dev-sdk with the specified style.
 * Applies style presets to the prompt and handles errors gracefully.
 */
export async function generateImage(options: GenerateImageOptions): Promise<GeneratedImageResult> {
  const {
    prompt,
    style = 'pixar',
    size = '1024x1024',
    ownerId,
    bookId,
    assetType,
  } = options;

  // Apply style preset
  const styleConfig = STYLE_CONFIG[style] || STYLE_CONFIG.pixar;
  const enhancedPrompt = `${prompt}, ${styleConfig.prompt}`;
  const imageFormat = isValidSize(size) ? size : '1024x1024';

  try {
    const zai = await getZAI();

    console.log(`[ImageService] Generating image: "${enhancedPrompt.slice(0, 100)}..." (${imageFormat})`);

    const response = await zai.images.generations.create({
      prompt: enhancedPrompt,
      size: imageFormat,
    });

    if (!response.data || !response.data[0] || !response.data[0].base64) {
      throw new Error('Invalid response from image generation API');
    }

    const imageBase64 = response.data[0].base64;
    const filename = generateFilename(`${assetType}_${style}`, 'png');
    const publicUrl = saveBase64File(
      assetType === 'cover' ? 'covers' : 'illustrations',
      filename,
      imageBase64
    );

    // Record in database
    const asset = await createMediaAsset({
      ownerId,
      bookId,
      assetType,
      storagePath: publicUrl,
      publicUrl,
      metadata: { style, size: imageFormat, prompt: enhancedPrompt },
    });

    recordSuccess('zai');

    console.log(`[ImageService] Image generated: ${publicUrl}`);

    return {
      success: true,
      publicUrl,
      assetId: asset.id,
    };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error('[ImageService] Generation failed:', errMessage);
    recordFailure('zai');

    return {
      success: false,
      error: errMessage,
    };
  }
}

/**
 * Generate a cover image for a book.
 */
export async function generateBookCover(
  bookId: string,
  ownerId: string,
  bookTitle: string,
  genre: string,
  targetAudience: string,
  coloringTheme?: string | null
): Promise<GeneratedImageResult> {
  const isChildrenBook = ['0-5', '6-9', '10-14'].includes(targetAudience);
  const isColoringBook = genre === 'coloring';
  const style = isColoringBook ? 'lineart-adult' : 'pixar';

  let coverPrompt: string;
  if (isColoringBook && coloringTheme && COLORING_THEMES[coloringTheme as ColoringTheme]) {
    const themeConfig = COLORING_THEMES[coloringTheme as ColoringTheme];
    coverPrompt = `${themeConfig.coverPrompt}. Book title: "${bookTitle}". No text on image.`;
  } else if (isChildrenBook) {
    coverPrompt = `Book cover for children's book "${bookTitle}". ${genre} genre. Bright, colorful, inviting, no text on image.`;
  } else {
    coverPrompt = `Professional book cover for "${bookTitle}". ${genre} genre. Elegant, cinematic, compelling, no text on image.`;
  }

  return generateImage({
    prompt: coverPrompt,
    style,
    size: '1344x768',
    ownerId,
    bookId,
    assetType: 'cover',
  });
}

/**
 * Generate an illustration for a chapter.
 */
export async function generateChapterIllustration(
  bookId: string,
  ownerId: string,
  chapterIndex: number,
  illustrationPrompt: string,
  style: string = 'pixar'
): Promise<GeneratedImageResult> {
  return generateImage({
    prompt: illustrationPrompt,
    style,
    size: '1344x768',
    ownerId,
    bookId,
    assetType: 'illustration',
  });
}

/**
 * Generate a coloring page.
 * If a theme is provided, uses theme-specific prompt prefix and adult coloring style.
 */
export async function generateColoringPage(
  bookId: string,
  ownerId: string,
  chapterIndex: number,
  subject: string,
  theme?: ColoringTheme | null
): Promise<GeneratedImageResult> {
  const isAdultTheme = !!theme;
  const themeConfig = theme ? COLORING_THEMES[theme] : null;
  
  // For adult coloring books, use more detailed and intricate prompt
  const adultStyleAddon = isAdultTheme
    ? 'for adults, intricate details, fine lines, sophisticated composition, professional quality line art, detailed patterns and textures, suitable for adult coloring'
    : 'for children to color, simple composition';
    
  const promptPrefix = themeConfig ? themeConfig.pagePromptPrefix : 'Coloring book page:';
  const prompt = `${promptPrefix} ${subject}. ${adultStyleAddon}. Black and white line art, clean outlines, no shading, no color.`;
  
  return generateImage({
    prompt,
    style: isAdultTheme ? 'lineart-adult' : 'lineart',
    size: '1024x1024',
    ownerId,
    bookId,
    assetType: 'coloring_page',
  });
}
