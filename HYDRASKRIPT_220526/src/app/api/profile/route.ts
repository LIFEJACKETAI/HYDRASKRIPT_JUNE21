// HydraSkript - Profile API Route
// GET /api/profile - Get current user profile
// PUT /api/profile - Update profile

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getOrCreateProfile } from '@/lib/utils/bookHelpers';

function getAuthEmail(request: NextRequest): string {
  return request.headers.get('x-user-email') || 'demo@hydraskript.com';
}

// GET - Get profile
export async function GET(request: NextRequest) {
  try {
    const email = getAuthEmail(request);
    const profile = await getOrCreateProfile(email);

    return NextResponse.json({
      success: true,
      data: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        credits: profile.credits,
        tier: profile.tier,
        isAdmin: profile.isAdmin,
        createdAt: profile.createdAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT - Update profile
export async function PUT(request: NextRequest) {
  try {
    const email = getAuthEmail(request);
    const profile = await getOrCreateProfile(email);

    const body = await request.json();
    const updated = await db.profile.update({
      where: { id: profile.id },
      data: {
        ...(body.name && { name: body.name }),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        credits: updated.credits,
        tier: updated.tier,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
