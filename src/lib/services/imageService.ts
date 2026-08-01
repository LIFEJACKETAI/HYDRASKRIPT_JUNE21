/**
 * Backend 1: Google Gemini 2.5 Flash Image.
 * Returns base64 inside candidates[].content.parts[].inlineData.
 * Now with retry logic for quota limits (429 Too Many Requests).
 */
async function generateWithGemini(prompt: string, options: GenerateImageOptions): Promise<GeneratedImageResult> {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY as string)
    const modelName = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'
    const model = genAI.getGenerativeModel({ model: modelName })

    // Retry logic for 429 Too Many Requests errors
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await model.generateContent(prompt)
        const parts: any[] = result.response?.candidates?.[0]?.content?.parts || []
        const imagePart: any = parts.find((p: any) => p.inlineData && p.inlineData.data)
        if (!imagePart || !imagePart.inlineData) {
          const text = parts.filter((p: any) => p.text).map((p: any) => p.text).join('')
          return { success: false, error: `Gemini returned no image. ${text ? 'Text: ' + text.slice(0, 200) : ''}` }
        }
        const data: string = imagePart.inlineData.data
        const mimeType: string = imagePart.inlineData.mimeType
        return persistAsset({
          base64: data,
          mimeType: mimeType || 'image/png',
          assetType: options.assetType,
          style: options.style,
          ownerId: options.ownerId,
          bookId: options.bookId,
          prompt,
        })
      } catch (error) {
        if (error instanceof Error && error.message.includes('429 Too Many Requests')) {
          if (attempt === maxRetries) {
            throw error;
          }
          console.warn(`[imageService] Gemini quota limit hit, retrying (attempt ${attempt + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 10000))); // Exponential backoff
        } else {
          throw error;
        }
      }
    }

    throw new Error('Maximum retry attempts exceeded for Gemini image generation');
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}