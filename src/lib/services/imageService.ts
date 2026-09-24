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

const LINE_ART_STYLES = new Set(['lineart', 'lineart-adult']);

/**
 * Detect a degenerate generation: a flat, near-contentless image (a uniform gray
 * or blank wash). Pollinations periodically returns these for line-art prompts,
 * and no amount of post-processing can pull colorable contours out of them, so
 * they must be rejected and regenerated with a different seed.
 */
async function isDegenerateImage(buffer: Buffer): Promise<boolean> {
  try {
    const sharp = (await import('sharp')).default;
    const stats = await sharp(buffer).stats();
    // A flat gray/white/black wash has almost no tonal variation (stdev ~0-30),
    // while a drawing — even a faint sketch — spans a wide tonal range. Real
    // line-art input measures ~40+ stdev, so anything flatter than 32 is a
    // contentless box that no post-processing can turn into a coloring page.
    return stats.channels[0].stdev < 32;
  } catch {
    return true;
  }
}

/**
 * Post-conversion gate: a usable coloring page has a healthy line density
 * (about 0.8-12% black, matching real coloring-book page coverage) over a
 * mostly-white page. Below that it reads as blank; above it as a blob. Also
 * rejects pages with solid black bands (e.g. a Pollinations caption strip or a
 * baked-in shadow bar), which padding with ink cannot fix.
 */
async function isLineArtUsable(pngBuffer: Buffer): Promise<boolean> {
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(pngBuffer).metadata();
    const gray = await sharp(pngBuffer).flatten({ background: '#fff' }).grayscale().raw().toBuffer();
    const { width: W, height: H } = meta;
    let black = 0;
    let white = 0;
    for (const v of gray) {
      if (v < 40) black++;
      else if (v >= 230) white++;
    }
    const blackFraction = black / gray.length;
    const whiteFraction = white / gray.length;
    if (blackFraction < 0.008 || blackFraction > 0.12 || whiteFraction < 0.7) return false;

    let run = 0;
    for (let y = 0; y < H; y++) {
      let rowBlack = 0;
      for (let x = 0; x < W; x++) {
        if (gray[y * W + x] < 40) rowBlack++;
      }
      if (rowBlack / W > 0.55) {
        run++;
        if (run > Math.max(4, H * 0.02)) return false;
      } else {
        run = 0;
      }
    }

    // Full-height solid strips (the vertical frame edge Pollinations often
    // bakes into the image). Two adjacent columns that are >80% dark for the
    // entire height is a border, not a drawing.
    run = 0;
    for (let x = 0; x < W; x++) {
      let colBlack = 0;
      for (let y = 0; y < H; y++) {
        if (gray[y * W + x] < 40) colBlack++;
      }
      if (colBlack / H > 0.8) {
        run++;
        if (run >= 2) return false;
      } else {
        run = 0;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the gray value at which the darkest `fraction` of pixels sit. Keeps line
 * strokes at a healthy, visible thickness instead of the hairline edges that a
 * pure edge detector leaves behind on faint Pollinations sketches.
 */
function percentileThreshold(grayRaw: Buffer, fraction: number): number {
  const hist = new Float64Array(256);
  for (const v of grayRaw) hist[v]++;
  let target = Math.floor(grayRaw.length * fraction);
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= target) return v;
  }
  return 255;
}

/**
 * Convert a colored OR shaded-grayscale image into clean black-and-white line art.
 *
 * The image backends are asked for "black and white line art", but they often
 * return a *shaded* picture instead — full color from Pollinations, or a
 * grayscale illustration with gradients/shadows from a model that half-followed
 * the prompt. Neither is colorable. Two things were wrong before:
 *   1. The old guard skipped any image whose RGB channel means were close
 *      (i.e. grayscale), so a shaded grayscale image was stored untouched — the
 *      exact "black and white but not colorable" complaint.
 *   2. A plain threshold turns every shaded region into a solid black blob.
 *
 * Instead we run a Difference of Gaussians: the local mean minus the image keeps
 * thin dark contours while cancelling large-scale shading, so shadows do not
 * fill in. We then thicken the hairlines so there is room to color between them.
 *
 * Returns null only when the image already looks like clean line art (light and
 * near-grayscale), so good output from a capable backend is left untouched.
 */
async function toLineArtBase64(base64: string, mimeType: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const sharp = (await import('sharp')).default;
    const input = Buffer.from(base64, 'base64');

    const stats = await sharp(input).stats();
    const means = stats.channels.slice(0, 3).map((c) => c.mean);
    const spread = Math.max(...means) - Math.min(...means);

    // Distinguish genuine line art from a shaded or faint illustration. Both can
    // be near-grayscale and light, so luminance alone is not enough: only real
    // line art already has a healthy amount of solid black (the contours) next
    // to a mostly-white page. A faint wash has almost no true black; a shaded
    // picture has too much ink. Re-running the extractor on good line art fills
    // it into a black blob, so this skip matters.
    const grayRaw = await sharp(input).grayscale().raw().toBuffer();
    let black = 0;
    let white = 0;
    for (const v of grayRaw) {
      if (v < 40) black++;
      else if (v >= 230) white++;
    }
    const blackFraction = black / grayRaw.length;
    const whiteFraction = white / grayRaw.length;
    const alreadyLineArt = Number.isFinite(spread) && spread <= 10
      && blackFraction >= 0.008 && blackFraction <= 0.2 && whiteFraction >= 0.35;
    if (alreadyLineArt) return null;

    const gray = await sharp(input).grayscale().toBuffer();
    const localMean = await sharp(gray).blur(6).toBuffer();
    const dog = await sharp(localMean)
      .composite([{ input: gray, blend: 'difference' }])
      .toBuffer();
    const edges = await sharp(dog).linear(6, 0).threshold(30).toBuffer();

    let union: Buffer;
    if (blackFraction >= 0.015) {
      // Darker illustration with real ink: keep only contours so fills, shadows
      // and baked-in black bands never turn into solid blobs.
      union = edges;
    } else {
      // Faint/mid sketch: keep the darkest ~4% as thick visible strokes, then
      // union with the contours so interior detail survives.
      const t = percentileThreshold(grayRaw, 0.04);
      const ink = await sharp(gray).threshold(t).negate().toBuffer();
      union = await sharp(edges).composite([{ input: ink, blend: 'lighten' }]).toBuffer();
    }

    // Thicken the contours so there is room to color between them.
    const thickened = await sharp(union).blur(1.2).threshold(55).toBuffer();
    const lineArt = await sharp(thickened).negate().png().toBuffer();

    return { base64: lineArt.toString('base64'), mimeType: 'image/png' };
  } catch (error) {
    console.error('[imageService] Line-art post-processing failed (non-fatal):', error instanceof Error ? error.message : String(error));
    return null;
  }
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
    const { assetType, style, ownerId, bookId, prompt } = params;
    let { base64, mimeType } = params;

    // Guarantee line art for coloring pages / lineart styles.
    if (assetType === 'coloring_page' || LINE_ART_STYLES.has(style)) {
      const converted = await toLineArtBase64(base64, mimeType);
      if (converted) {
        base64 = converted.base64;
        mimeType = converted.mimeType;
      }
    }

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
    const modelName = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
    const model = genAI.getGenerativeModel({ model: modelName });

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
          await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt), 10000)));
        } else {
          throw error;
        }
      }
    }
    return { success: false, error: 'Image generation failed after all retries' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Backend 2: Pollinations AI.
 * Fetches image from URL and converts to base64. Honors the requested size,
 * model, and uses a deterministic per-book seed for character consistency.
 */
function pollinationsSize(size: ImageSize): { width: number; height: number } {
  const [w, h] = size.split('x').map((n) => parseInt(n, 10));
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { width: w, height: h };
  }
  return { width: 1024, height: 1024 };
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2147483647;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Pollinations request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function generateWithPollinations(prompt: string, size: ImageSize, options: GenerateImageOptions): Promise<GeneratedImageResult> {
  // Pollinations uses URL-encoded prompts
  const encodedPrompt = encodeURIComponent(prompt);
  const { width, height } = pollinationsSize(size);
  const model = process.env.POLLINATIONS_MODEL || 'flux';
  // Pollinations ignores "no color" instructions in the positive prompt, so pass
  // an explicit negative prompt for line-art styles to bias it toward outlines.
  const negative = LINE_ART_STYLES.has(options.style || '')
    ? `&negative_prompt=${encodeURIComponent('color, colorful, shading, gradient, grayscale, painting, 3d, photorealistic, filled')}`
    : '';

  const maxRetries = 4;
  const baseSeed = hashString(`${options.bookId ?? options.ownerId}:${options.assetType}`);
  let lastError = '';
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Vary the seed per attempt: Pollinations occasionally returns a flat,
    // degenerate image for line-art prompts, and a fresh seed nearly always
    // yields a usable one.
    const seed = (baseSeed + attempt * 7919) % 2147483647;
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true${negative}`;
    try {
      const response = await fetchWithTimeout(pollinationsUrl, 60_000);
      if (!response.ok) {
        throw new Error(`Pollinations API error: ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || 'image/png';
      // Guard against Pollinations returning a non-image (e.g. an error page).
      if (!contentType.includes('image')) {
        throw new Error(`Pollinations returned non-image content-type: ${contentType}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Reject flat washes outright — nothing to extract.
      if (await isDegenerateImage(buffer)) {
        lastError = `Pollinations returned a flat image (attempt ${attempt}/${maxRetries})`;
        console.warn(`[imageService] ${lastError}; retrying with a new seed...`);
        await new Promise((resolve) => setTimeout(resolve, 800));
        continue;
      }

      const base64 = buffer.toString('base64');

      // Convert to line art and verify the result actually looks like a
      // coloring page before persisting. Too-faint output needs a new seed.
      const converted = await toLineArtBase64(base64, contentType);
      if (converted) {
        if (!(await isLineArtUsable(Buffer.from(converted.base64, 'base64')))) {
          lastError = `Pollinations line art came out blank/faint (attempt ${attempt}/${maxRetries})`;
          console.warn(`[imageService] ${lastError}; retrying with a new seed...`);
          await new Promise((resolve) => setTimeout(resolve, 800));
          continue;
        }
        return persistAsset({
          base64: converted.base64,
          mimeType: converted.mimeType,
          assetType: options.assetType,
          style: options.style || 'pixar',
          ownerId: options.ownerId,
          bookId: options.bookId,
          prompt,
        });
      }

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
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === maxRetries) {
        return { success: false, error: lastError };
      }
      console.warn(`[imageService] Pollinations failed (attempt ${attempt}/${maxRetries}):`, lastError);
      await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
    }
  }

  return { success: false, error: `Pollinations generation failed after ${maxRetries} attempts: ${lastError}` };
}

/**
 * Backend 3: Stability AI (stable-image / core).
 * Uses a stable per-book seed for character consistency and honors the
 * requested aspect ratio. Returns JSON with a base64 `image` payload.
 */
function stabilityAspectRatio(size: ImageSize): string {
  const [w, h] = size.split('x').map((n) => parseInt(n, 10));
  if (!Number.isFinite(w) || !Number.isFinite(h) || h <= 0) return '1:1';
  if (w === h) return '1:1';
  const ratio = w / h;
  if (ratio >= 1.7) return '16:9';
  if (ratio >= 1.3) return '3:2';
  if (ratio >= 1.05) return '4:5';
  if (ratio <= 0.58) return '9:16';
  if (ratio <= 0.75) return '2:3';
  return '4:5';
}

async function generateWithStability(prompt: string, size: ImageSize, options: GenerateImageOptions): Promise<GeneratedImageResult> {
  const apiKey = process.env.STABILITY_AI_API_KEY;
  if (!apiKey) return { success: false, error: 'No Stability API key configured' };

  const aspectRatio = stabilityAspectRatio(size);
  // A stable per-book seed keeps characters/art consistent across chapters.
  const seed = hashString(`${options.bookId ?? options.ownerId}:${options.assetType}`) % 2147483647;

  const form = new FormData();
  form.append('prompt', prompt);
  form.append('aspect_ratio', aspectRatio);
  form.append('output_format', 'png');
  form.append('seed', String(seed));
  if (options.style === 'lineart' || options.style === 'lineart-adult') {
    form.append('negative_prompt', 'color, gradient, grayscale, shading, 3d, photo, photorealistic, full color');
  }

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      let response: Response;
      try {
        response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
          },
          body: form,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        let detail = '';
        try {
          const err: any = await response.json();
          detail = err?.message || (Array.isArray(err?.errors) ? err.errors.join(', ') : '') || '';
        } catch {}
        throw new Error(`Stability API error: ${response.status} ${detail}`.trim());
      }

      const data = (await response.json()) as { image?: string };
      if (!data?.image) {
        throw new Error('Stability returned no image data');
      }

      return persistAsset({
        base64: data.image,
        mimeType: 'image/png',
        assetType: options.assetType,
        style: options.style || 'pixar',
        ownerId: options.ownerId,
        bookId: options.bookId,
        prompt,
      });
    } catch (error) {
      if (attempt === maxRetries) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
      console.warn(`[imageService] Stability failed (attempt ${attempt}/${maxRetries}):`, error instanceof Error ? error.message : String(error));
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }

  return { success: false, error: `Stability generation failed after ${maxRetries} attempts` };
}

/**
 * Generate an image using available backends (Stability primary, Gemini & Pollinations fallback)
 */
export async function generateImage(options: GenerateImageOptions): Promise<GeneratedImageResult> {
  const { prompt, style = 'pixar', size = '1024x1024', ownerId, bookId, assetType } = options;
  const styleConfig = STYLE_CONFIG[style] || STYLE_CONFIG.pixar;
  const enhancedPrompt = `${prompt}, ${styleConfig.prompt}`;

  // Primary: Stability AI
  if (process.env.STABILITY_AI_API_KEY) {
    const stabilityResult = await generateWithStability(enhancedPrompt, size, { ...options, prompt: enhancedPrompt });
    if (stabilityResult.success) return stabilityResult;
    console.error('[imageService] Stability image generation failed:', stabilityResult.error);
  }

  // Secondary: Gemini
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
    ? 'intricate fine detail, evenly weighted continuous lines, ornate patterns, professional adult coloring-book quality'
    : 'simple bold outlines, thick continuous lines, large open areas, for children to color';

  const promptPrefix = themeConfig ? themeConfig.pagePromptPrefix : 'Coloring book page:';
  const prompt = `Coloring book page: ${promptPrefix} ${subject}. ${adultStyleAddon}. Render as clean black contour lines on a pure white background — a professional coloring-book outline drawing. Absolutely no color, no grayscale tones, no shading, no shadows, no gradients, no hatching, no cross-hatching, no stippling, no solid filled black areas, no texture, no photorealism, no pencil sketch. Only crisp continuous black outlines with white space left to color in.`;

  return generateImage({
    prompt,
    style: isAdultTheme ? 'lineart-adult' : 'lineart',
    size: '1024x1024',
    ownerId,
    bookId,
    assetType: 'coloring_page',
  });
}