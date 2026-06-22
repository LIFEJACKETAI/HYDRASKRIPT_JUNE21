import { NextRequest } from 'next/server';
import { getAuthenticatedUserEmail } from '@/lib/auth-utils';

/**
 * Retrieves the authenticated user's email from the Supabase session.
 * Throws an error or returns null if the user is not authenticated.
 */
export async function getAuthEmail(request: NextRequest): Promise<string | null> {
  return await getAuthenticatedUserEmail(request);
}
