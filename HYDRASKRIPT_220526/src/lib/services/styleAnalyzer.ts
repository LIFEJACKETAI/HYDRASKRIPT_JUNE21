// HydraSkript - Style Analyzer Service
// Extracts writing style from exemplar texts using LLM analysis
// Stores the generated system prompt for use in chapter generation

import { db } from '@/lib/db';
import { askLLMJSON } from '@/lib/llm/openrouter';
import { getStyleAnalysisPrompt, getStyleAnalysisUserPrompt } from '@/lib/llm/prompts';
import { StyleAnalysisSchema, validateOrThrow } from '@/lib/llm/schema';

// ─── Style Analysis ───────────────────────────────────────────────────────────

/**
 * Analyze exemplar texts and generate a style instruction system prompt.
 * This is RAG-based (not fine-tuning) — we generate a "Write like this" instruction.
 */
export async function analyzeStyle(exemplarTexts: string[]): Promise<string> {
  if (exemplarTexts.length === 0) {
    throw new Error('At least one exemplar text is required');
  }

  console.log(`[StyleAnalyzer] Analyzing ${exemplarTexts.length} exemplar texts...`);

  const systemPrompt = getStyleAnalysisPrompt();
  const userPrompt = getStyleAnalysisUserPrompt(exemplarTexts);

  const result = await askLLMJSON<unknown>(systemPrompt, userPrompt, 0.3);

  // Validate the response
  const validated = validateOrThrow(StyleAnalysisSchema, result);

  console.log(`[StyleAnalyzer] Generated style prompt (${validated.systemPrompt.length} chars)`);

  return validated.systemPrompt;
}

/**
 * Create a style profile from exemplar texts.
 * Analyzes the texts and stores the resulting system prompt.
 */
export async function createStyleProfile(params: {
  ownerId: string;
  name: string;
  description?: string;
  exemplarTexts: string[];
}): Promise<{
  id: string;
  name: string;
  systemPrompt: string;
}> {
  // Analyze the style
  const systemPrompt = await analyzeStyle(params.exemplarTexts);

  // Store in database
  const profile = await db.styleProfile.create({
    data: {
      ownerId: params.ownerId,
      name: params.name,
      description: params.description ?? '',
      exemplarTexts: JSON.stringify(params.exemplarTexts),
      embedding: JSON.stringify([]), // Placeholder — embedding not available in sandbox
      systemPrompt,
    },
  });

  console.log(`[StyleAnalyzer] Created style profile: ${profile.id}`);

  return {
    id: profile.id,
    name: profile.name,
    systemPrompt,
  };
}

/**
 * Get a style profile's system prompt for use in generation.
 */
export async function getStyleSystemPrompt(profileId: string | null): Promise<string> {
  if (!profileId) return '';

  const profile = await db.styleProfile.findUnique({
    where: { id: profileId },
    select: { systemPrompt: true },
  });

  return profile?.systemPrompt ?? '';
}

/**
 * List all style profiles for a user.
 */
export async function listStyleProfiles(ownerId: string) {
  return db.styleProfile.findMany({
    where: { ownerId },
    select: {
      id: true,
      name: true,
      description: true,
      systemPrompt: true,
      exemplarTexts: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Delete a style profile.
 */
export async function deleteStyleProfile(profileId: string, ownerId: string): Promise<boolean> {
  try {
    await db.styleProfile.delete({
      where: { id: profileId, ownerId },
    });
    return true;
  } catch {
    return false;
  }
}
