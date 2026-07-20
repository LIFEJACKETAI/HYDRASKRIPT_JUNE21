// HydraSkript - Admin API Route
// GET /api/admin - Get admin dashboard data (all jobs, analytics)

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { forbiddenResponse, isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';

// GET - Admin dashboard data
export async function GET(request: NextRequest) {
  try {
    const { profile } = await requireProfile(request);

    if (!profile.isAdmin) {
      return forbiddenResponse('Admin access required');
    }

    // Get all jobs
    const jobs = await db.job.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        book: { select: { id: true, title: true } },
        owner: { select: { id: true, email: true, name: true } },
      },
    });

    // Get analytics
    const totalUsers = await db.profile.count();
    const totalBooks = await db.book.count();
    const completedBooks = await db.book.count({ where: { status: 'completed' } });
    const failedBooks = await db.book.count({ where: { status: 'failed' } });
    const totalCreditsConsumed = await db.creditLedger.aggregate({
      _sum: { amount: true },
      where: { amount: { lt: 0 } },
    });

    const jobStats = {
      queued: await db.job.count({ where: { status: 'queued' } }),
      active: await db.job.count({ where: { status: 'active' } }),
      completed: await db.job.count({ where: { status: 'completed' } }),
      failed: await db.job.count({ where: { status: 'failed' } }),
    };

    return NextResponse.json({
      success: true,
      data: {
        analytics: {
          totalUsers,
          totalBooks,
          completedBooks,
          failedBooks,
          totalCreditsConsumed: Math.abs(totalCreditsConsumed._sum.amount || 0),
          jobStats,
        },
        jobs: jobs.map(j => ({
          id: j.id,
          jobType: j.jobType,
          status: j.status,
          progressMessage: j.progressMessage,
          progressPercent: j.progressPercent,
          creditsReserved: j.creditsReserved,
          creditsConsumed: j.creditsConsumed,
          errorMessage: j.errorMessage,
          book: j.book,
          owner: j.owner,
          createdAt: j.createdAt,
          completedAt: j.completedAt,
        })),
      },
    });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Admin data failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
