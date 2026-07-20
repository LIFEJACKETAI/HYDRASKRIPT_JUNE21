import { NextRequest, NextResponse } from 'next/server';
import { getAuthEmail } from '@/lib/auth-helpers';
import { getOrCreateProfile } from '@/lib/utils/bookHelpers';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export async function requireProfile(request: NextRequest) {
  const email = await getAuthEmail(request);

  if (!email) {
    throw new UnauthorizedError();
  }

  const profile = await getOrCreateProfile(email);
  return { email, profile };
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

export function forbiddenResponse(message = 'Forbidden') {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

export function isUnauthorizedError(error: unknown): error is UnauthorizedError {
  return error instanceof UnauthorizedError;
}
