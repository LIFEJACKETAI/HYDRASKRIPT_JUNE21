import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateProfile } from '@/lib/utils/bookHelpers';
import { getAuthEmail } from '@/lib/auth-helpers';
import { STYLE_CONFIG } from '@/types';
import { generateImage } from '@/lib/services/imageService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bookTitle, genre, targetAudience, style, prompt, aspectRatio, coloringTheme } = body;

    const email = await getAuthEmail(request);
    if (!email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await getOrCreateProfile(email);

    // Validate required fields
    if (!bookTitle || !genre || !targetAudience || !prompt) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: bookTitle, genre, targetAudience, prompt' },
        { status: 400 }
      );
    }

    console.log(`[API] Cover generation requested for "${bookTitle}" by ${email}`);

    // Map aspect ratio to image size
    const aspectRatioMap: Record<string, string> = {
      '6x9': '1344x768',
      '5x8': '1152x864',
      '1x1': '1024x1024',
    };
    const size = aspectRatioMap[aspectRatio] || '1344x768';

    // Determine style config
    const isChildrenBook = ['0-5', '6-9', '10-14'].includes(targetAudience);
    const isColoringBook = genre === 'coloring';
    const effectiveStyle = style || (isColoringBook ? (isChildrenBook ? 'lineart' : 'lineart-adult') : 'pixar');
    const styleConfig = STYLE_CONFIG[effectiveStyle] || STYLE_CONFIG.pixar;

    // Build enhanced prompt: USER PROMPT FIRST, then style reinforcement
    let finalPrompt = prompt.trim();
    
    // For coloring books, enforce line art
    if (isColoringBook && coloringTheme) {
      finalPrompt = `${finalPrompt}. Pure black and white line art, no shading, no color, clean white background.`;
    }
    // For regular covers, append style keywords as reinforcement (not replacement)
    else if (!isColoringBook) {
      // Extract key visual descriptors from style config
      const styleKeywords = styleConfig.prompt.split(',').slice(0, 6).join(', ');
      finalPrompt = `${finalPrompt}, ${styleKeywords}, professional book cover, no title text, no author name`;
    }

    const result = await generateImage({
      prompt: finalPrompt,
      style: effectiveStyle,
      size: size as any,
      ownerId: profile.id,
      bookId: body.bookId,
      assetType: 'cover',
    });

    if (!result.success) {
      console.error(`[API] Cover generation failed: ${result.error}`);
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    console.log(`[API] Cover generated successfully for "${bookTitle}"`);

    return NextResponse.json({
      success: true,
      data: {
        imageUrl: result.publicUrl,
        assetId: result.assetId,
        prompt: finalPrompt,
        style: effectiveStyle,
        size,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Cover generation error:', message, error instanceof Error ? error.stack : '');
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}