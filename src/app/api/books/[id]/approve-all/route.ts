// HydraSkript - Auto-approve All Chapters API Route
// POST /api/books/[id]/approve-all - Approve all pending chapters at once

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jobQueue } from '@/lib/workers/queue';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { profile } = await requireProfile(request);

    const book = await db.book.findUnique({
      where: { id, ownerId: profile.id },
      include: { chapters: true },
    });

    if (!book) {
      return NextResponse.json({ success: false, error: 'Book not found' }, { status: 404 });
    }

    // Check if there are any pending chapters to approve
    const pendingChapters = book.chapters.filter(
      (ch) => ch.status === 'awaiting_approval' || ch.status === 'writing' || ch.status === 'completed'
    );

    if (pendingChapters.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No chapters require approval' },
        { status: 400 }
      );
    }

    const approvedIndices: number[] = [];

    // Approve all pending chapters in order
    for (const chapter of pendingChapters.sort((a, b) => a.index - b.index)) {
      if (chapter.status !== 'completed') {
        await db.chapter.update({
          where: { bookId_index: { bookId: id, index: chapter.index } },
          data: { approvalStatus: 'approved', status: 'completed' },
        });
      }
      approvedIndices.push(chapter.index);
    }

    // Find the next unapproved chapter (still pending/not completed)
    const nextUnapproved = book.chapters.find(
      (ch) => !approvedIndices.includes(ch.index) && ch.status === 'pending'
    );

    if (nextUnapproved) {
      // There are still chapters to write - create a job for the first unapproved chapter
      // with autoApprove enabled so the worker chains through every remaining chapter
      const jobId = await jobQueue.createJob({
        bookId: id,
        ownerId: profile.id,
        jobType: 'write_chapter',
        creditsReserved: 0,
        stepIndex: nextUnapproved.index,
        result: JSON.stringify({ autoApprove: true }),
      });

      await jobQueue.startJob(jobId, 'write_chapter');

      return NextResponse.json({
        success: true,
        message: `Approved ${approvedIndices.length} chapters. Moving to chapter ${nextUnapproved.index + 1}.`,
        data: { jobId, nextChapterIndex: nextUnapproved.index },
      });
    } else {
      // All chapters now approved - finalize the book
      const bookWithCredits = await db.book.findUnique({ where: { id } });
      const totalCredits = bookWithCredits?.totalCreditsEstimated || 0;

      const jobId = await jobQueue.createJob({
        bookId: id,
        ownerId: profile.id,
        jobType: 'finalize_book',
        creditsReserved: 0,
        creditsConsumed: totalCredits,
      });

      await jobQueue.startJob(jobId, 'finalize_book');

      await db.book.update({ where: { id }, data: { status: 'finalizing' } });

      return NextResponse.json({
        success: true,
        message: 'All chapters approved. Finalizing book.',
        data: { jobId, status: 'finalizing' },
      });
    }
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Auto-approve all failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}