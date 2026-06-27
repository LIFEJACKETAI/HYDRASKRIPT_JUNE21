// HydraSkript - Style Profile Training API Route
// POST /api/training/style-profile - Create a style profile
// GET /api/training/style-profile - List style profiles

import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateProfile } from '@/lib/utils/bookHelpers';
import { createStyleProfile, listStyleProfiles, deleteStyleProfile } from '@/lib/services/styleAnalyzer';
import { CreateStyleProfileSchema, validateOrThrow } from '@/lib/llm/schema';

function getAuthEmail(request: NextRequest): string {
  const email = request.headers.get('x-user-email'); if (!email) throw new Error('Unauthorized'); return email;
}

// POST - Create a style profile from exemplar texts
export async function POST(request: NextRequest) {
  try {
    const email = await getAuthEmail(request);
    const profile = await getOrCreateProfile(email);

    const body = await request.json();
    const input = validateOrThrow(CreateStyleProfileSchema, body);

    const result = await createStyleProfile({
      ownerId: profile.id,
      name: input.name,
      description: input.description,
      exemplarTexts: input.exemplarTexts,
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Create style profile failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

// GET - List style profiles
export async function GET(request: NextRequest) {
  try {
    const email = await getAuthEmail(request);
    const profile = await getOrCreateProfile(email);

    const profiles = await listStyleProfiles(profile.id);

    // Parse exemplarTexts from JSON
    const formatted = profiles.map(p => ({
      ...p,
      exemplarTexts: JSON.parse(p.exemplarTexts || '[]'),
      preview: p.systemPrompt.slice(0, 150) + '...',
    }));

    return NextResponse.json({ success: true, data: formatted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] List style profiles failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE - Delete a style profile
export async function DELETE(request: NextRequest) {
  try {
    const email = await getAuthEmail(request);
    const profile = await getOrCreateProfile(email);

    const { profileId } = await request.json();
    const deleted = await deleteStyleProfile(profileId, profile.id);

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Delete style profile failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
