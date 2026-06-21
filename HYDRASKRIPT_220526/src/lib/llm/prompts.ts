// HydraSkript - System Prompts for All Generation Tasks
// Each prompt is carefully crafted for deterministic, high-quality output

import type { TargetAudience, Genre, ColoringTheme } from '@/types';
import { COLORING_THEMES } from '@/types';

// ─── Outline Generation ───────────────────────────────────────────────────────

export function getOutlinePrompt(genre: Genre, targetAudience: TargetAudience, chapterCount: number, stylePrompt: string): string {
  const audienceNote = targetAudience === 'adult'
    ? 'This is for an adult audience. Use sophisticated language and mature themes.'
    : `This is for children aged ${targetAudience}. Use age-appropriate language, simple vocabulary, and positive themes.`;

  return `You are a master book outliner with expertise in ${genre} fiction. ${stylePrompt ? `Your writing style should match: ${stylePrompt}` : ''}

${audienceNote}

Create a detailed book outline with exactly ${chapterCount} chapters. Each chapter should have a compelling title, a 2-3 sentence synopsis, and a word count target appropriate for the audience.

IMPORTANT: Respond with valid JSON only in this exact format:
{
  "title": "The Book Title",
  "chapters": [
    {
      "title": "Chapter Title",
      "synopsis": "What happens in this chapter",
      "wordTarget": 1500
    }
  ]
}

Guidelines:
- Word targets: Adult = 1500-3000, Teen (10-14) = 800-1500, Children (6-9) = 300-600, Picture book (0-5) = 50-150
- Ensure each chapter advances the plot meaningfully
- Include rising action, climax, and resolution
- Make chapter titles evocative and engaging
- Maintain narrative continuity between chapters`;
}

export function getOutlineUserPrompt(title: string, genre: Genre, targetAudience: TargetAudience): string {
  return `Create a complete outline for a ${genre} book titled "${title}" for the ${targetAudience} audience. Make it compelling, well-structured, and original.`;
}

// ─── Chapter Writing ──────────────────────────────────────────────────────────

export function getChapterWritePrompt(
  stylePrompt: string,
  bookTitle: string,
  genre: Genre,
  chapterIndex: number,
  totalChapters: number,
  previousSummary: string
): string {
  const isFirstChapter = chapterIndex === 0;
  const isLastChapter = chapterIndex === totalChapters - 1;

  let continuityNote = '';
  if (isFirstChapter) {
    continuityNote = 'This is the first chapter. Establish the setting, introduce the main characters, and hook the reader immediately.';
  } else if (isLastChapter) {
    continuityNote = 'This is the FINAL chapter. Resolve all major plot threads, provide a satisfying conclusion, and tie back to the beginning. The previous chapter ended with: ' + previousSummary;
  } else {
    continuityNote = `The previous chapter ended with: ${previousSummary}. Maintain narrative continuity and advance the plot.`;
  }

  return `You are an expert ${genre} author writing chapter ${chapterIndex + 1} of "${bookTitle}". ${stylePrompt ? `Write in this style: ${stylePrompt}` : ''}

${continuityNote}

IMPORTANT: Respond with valid JSON only in this exact format:
{
  "content": "The full chapter text here...",
  "charactersIntroduced": ["Character Name - brief description"],
  "summaryForNextChapter": "A 2-3 sentence summary of how this chapter ends, for continuity with the next chapter"
}

Writing guidelines:
- Write compelling, vivid prose that pulls the reader in
- Use sensory details and show-don't-tell techniques
- Ensure natural dialogue that reveals character
- Maintain consistent voice and tone
- End with a hook or transition that compels the reader to continue`;
}

export function getChapterUserPrompt(
  chapterTitle: string,
  synopsis: string,
  wordTarget: number
): string {
  return `Write chapter "${chapterTitle}" with approximately ${wordTarget} words.

Chapter synopsis: ${synopsis}

Write the complete chapter now. Remember: output valid JSON with content, charactersIntroduced, and summaryForNextChapter fields.`;
}

// ─── Style Analysis ───────────────────────────────────────────────────────────

export function getStyleAnalysisPrompt(): string {
  return `You are an expert literary analyst. Analyze the provided writing samples and create a detailed instruction for mimicking this writing voice.

Focus on:
1. Sentence structure (short/punchy vs. long/flowing)
2. Vocabulary level and word choices
3. Tone (formal, casual, humorous, dark, etc.)
4. Pacing (fast action vs. slow description)
5. Dialogue style
6. Use of metaphors, similes, and literary devices
7. Point of view tendencies
8. Character description approach
9. Setting description style
10. Emotional register

IMPORTANT: Respond with valid JSON only:
{
  "systemPrompt": "A 200-word instruction for an AI to write in this exact style..."
}`;
}

export function getStyleAnalysisUserPrompt(exemplarTexts: string[]): string {
  const samples = exemplarTexts.map((text, i) => `--- Sample ${i + 1} ---\n${text.slice(0, 2000)}`).join('\n\n');
  return `Analyze these writing samples and generate a style instruction:\n\n${samples}`;
}

// ─── Image Prompt Extraction ──────────────────────────────────────────────────

export function getImagePromptExtractionPrompt(): string {
  return `You are an expert at creating image generation prompts from text. Extract the most visually compelling moment from the chapter text and create a detailed image prompt.

IMPORTANT: Respond with valid JSON only:
{
  "prompt": "A detailed image generation prompt describing the key visual scene, including characters, setting, action, mood, and lighting",
  "subject": "Brief description of the main subject"
}`;
}

export function getImagePromptExtractionUserPrompt(chapterContent: string): string {
  // Truncate to avoid token limits
  const truncated = chapterContent.slice(0, 1500);
  return `Extract the most visually compelling scene from this chapter and create an image prompt:\n\n${truncated}`;
}

// ─── Children's Book Adaptation ───────────────────────────────────────────────

export function getChildrensChapterPrompt(audience: TargetAudience): string {
  if (audience === '0-5') {
    return `You are writing a picture book for toddlers (ages 0-5). 
- Use very simple words (1-2 syllables)
- Short sentences (3-5 words)
- Repetitive structures
- Focus on colors, shapes, feelings, animals
- Each page should have one simple concept
- Include gentle rhymes when natural`;
  }
  if (audience === '6-9') {
    return `You are writing an early reader chapter book (ages 6-9).
- Use simple vocabulary with occasional new words
- Short paragraphs
- Lots of dialogue
- Relatable characters and situations
- Age-appropriate humor and wonder
- Clear good/bad distinctions`;
  }
  return `You are writing a middle-grade novel (ages 10-14).
- More sophisticated vocabulary and themes
- Characters dealing with real emotions
- Adventure and self-discovery themes
- Balance dialogue and description
- Chapter cliffhangers
- Age-appropriate complexity`;
}

// ─── Coloring Book Outline ────────────────────────────────────────────────────

export function getColoringOutlinePrompt(theme: ColoringTheme, chapterCount: number): string {
  const themeConfig = COLORING_THEMES[theme];
  const themeLabel = themeConfig.label;

  return `You are designing a ${themeLabel} coloring book for adults. Each "chapter" is actually a coloring page with a specific subject to draw.

Create a detailed outline with exactly ${chapterCount} coloring pages. Each page should have:
- A descriptive title for the coloring page
- A detailed synopsis describing EXACTLY what should be drawn (this will be used as the image generation prompt)
- A word target of 10 (ignored for coloring books, but required by the format)

The subjects should vary across pages and explore different aspects of the "${themeLabel}" theme. Make each page unique and interesting.

IMPORTANT: The synopsis for each page should be a vivid, detailed visual description of what the coloring page should depict. Be specific about composition, elements, and arrangement. Think of it as an art director's brief for a line artist.

IMPORTANT: Respond with valid JSON only in this exact format:
{
  "title": "The Book Title",
  "chapters": [
    {
      "title": "Page Title",
      "synopsis": "Detailed visual description of what this coloring page depicts, including specific elements, composition, and mood",
      "wordTarget": 10
    }
  ]
}

Guidelines:
- Each page should feature a distinct subject within the ${themeLabel} theme
- Descriptions should be detailed enough for an artist to draw from
- Vary complexity across pages (some simple, some intricate)
- Include atmospheric details and mood descriptions
- Ensure visual variety across all pages`;
}

export function getColoringOutlineUserPrompt(title: string, theme: ColoringTheme): string {
  const themeConfig = COLORING_THEMES[theme];
  return `Create a complete outline for an adult coloring book titled "${title}" with the theme "${themeConfig.label}". ${themeConfig.description}. Make each page visually unique and captivating.`;
}

// ─── Coloring Page Content ────────────────────────────────────────────────────

export function getColoringChapterPrompt(theme: ColoringTheme, pageIndex: number, totalPages: number): string {
  const themeConfig = COLORING_THEMES[theme];
  return `You are creating the text description for page ${pageIndex + 1} of an adult coloring book about ${themeConfig.label}. 
Write a brief, evocative 2-3 sentence description that would accompany this coloring page — like the text you'd see on the facing page of an adult coloring book. It should be poetic, calming, and thematically relevant.

IMPORTANT: Respond with valid JSON only in this exact format:
{
  "content": "The brief descriptive text for this page...",
  "charactersIntroduced": [],
  "summaryForNextChapter": "Brief note about what the next page could explore"
}`;
}

// ─── Summary Generation ───────────────────────────────────────────────────────

export function getSummaryPrompt(bookTitle: string, genre: Genre): string {
  return `You are a professional book describer. Write a compelling 2-3 sentence book description/blurb for "${bookTitle}" in the ${genre} genre. This will be used as marketing copy.`;
}
