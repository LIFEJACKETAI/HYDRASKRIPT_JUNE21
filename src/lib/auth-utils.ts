import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Retrieves the authenticated user's email from the Supabase session.
 * Throws an error or returns null if the user is not authenticated.
 */
export async function getAuthenticatedUserEmail(request: NextRequest): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return null;
    }
    
    return user.email;
  } catch (e) {
    console.error('[Auth Utils] Error getting authenticated user email:', e);
    return null;
  }
}
