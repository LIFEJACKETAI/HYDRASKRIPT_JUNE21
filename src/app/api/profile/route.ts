import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getOrCreateProfile } from '@/lib/utils/bookHelpers';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';
import { getCreditBalance } from '@/lib/utils/credits';

// GET - Get profile
export async function GET(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);

    // credits = total across all wallets so every UI surface shows the same balance
    const credits = await getCreditBalance(profile.id);

    return NextResponse.json({
      success: true,
      data: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        credits,
        tier: profile.tier,
        isAdmin: profile.isAdmin,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT - Update profile
export async function PUT(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);

    const body = await request.json();
    const updated = await db.profile.update({
      where: { id: profile.id },
      data: {
        ...(body.name && { name: body.name }),
      },
    });

    const credits = await getCreditBalance(updated.id);

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        credits,
        tier: updated.tier,
      },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
