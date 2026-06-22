import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateProfile } from '@/lib/utils/bookHelpers';
import { getAuthEmail } from '@/lib/auth-helpers';

// POST - Start book generation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const email = await getAuthEmail(request);
    if (!email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const profile = await getOrCreateProfile(email);

    console.log(`[API] Start generation requested for book ${id} by ${email}`);

    // Dynamic import to reduce initial compilation burden
    const { startBookGeneration } = await import('@/lib/services/bookGenerator');
    const result = await startBookGeneration(id, profile.id);

    if ('error' in result) {
      console.error(`[API] Start generation failed for book ${id}: ${result.error}`);
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    console.log(`[API] Generation started for book ${id}, job: ${result.jobId}`);
    return NextResponse.json({
      success: true,
      data: {
        jobId: result.jobId,
        estimatedCredits: result.estimatedCredits,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Start generation failed:', message, error instanceof Error ? error.stack : '');
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
