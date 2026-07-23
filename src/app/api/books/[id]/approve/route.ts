// HydraSkript - Book Approval API Route
// POST /api/books/[id]/approve - Approve outline or chapter and trigger next step

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateChapter, finalizeBook } from '@/lib/services/bookGenerator';
import { jobQueue } from '@/lib/workers/queue';
import { isUnauthorizedError, requireProfile, unauthorizedResponse } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { profile } = await requireProfile(request);

    const body = await request.json();
    const { type, chapterIndex, updatedOutline } = body;

    if (!type) {
      return NextResponse.json({ success: false, error: 'Approval type is required' }, { status: 400 });
    }

    const book = await db.book.findUnique({
      where: { id, ownerId: profile.id },
    });

    if (!book) {
      return NextResponse.json({ success: false, error: 'Book not found' }, { status: 404 });
    }

    if (type === 'outline') {
      // 1. Update outline if user provided edits
      if (updatedOutline) {
        await db.book.update({
          where: { id },
          data: { outline: JSON.stringify(updatedOutline) },
        });
      }

      // 2. Transition to writing state
      await db.book.update({
        where: { id },
        data: { status: 'writing' },
      });

      // 3. Trigger the first chapter generation
      const jobId = await jobQueue.createJob({
        bookId: id,
        ownerId: profile.id,
        jobType: 'write_chapter',
        creditsReserved: 0, // Already reserved during startBookGeneration
      });

      await jobQueue.startJob(jobId, 'write_chapter', async () => {
        await generateChapter(id, profile.id, jobId, 0);
      });

      return NextResponse.json({ success: true, data: { jobId } });
    }

    if (type === 'chapter') {
      if (chapterIndex === undefined) {
        return NextResponse.json({ success: false, error: 'chapterIndex is required for chapter approval' }, { status: 400 });
      }

      // 1. Mark chapter as approved
      await db.chapter.update({
        where: { bookId_index: { bookId: id, index: chapterIndex } },
        data: { approvalStatus: 'approved', status: 'completed' },
      });

      // 2. Find the next chapter
      const nextChapter = await db.chapter.findFirst({
        where: { bookId: id, index: { gt: chapterIndex } },
        orderBy: { index: 'asc' },
      });

      if (nextChapter) {
        // More chapters to write
        const jobId = await jobQueue.createJob({
          bookId: id,
          ownerId: profile.id,
          jobType: 'write_chapter',
          creditsReserved: 0,
        });

        await jobQueue.startJob(jobId, 'write_chapter', async () => {
          await generateChapter(id, profile.id, jobId, nextChapter.index);
        });

        return NextResponse.json({ success: true, data: { jobId, nextChapterIndex: nextChapter.index } });
      } else {
        // Last chapter approved -> Finalize the book
        const jobId = await jobQueue.createJob({
          bookId: id,
          ownerId: profile.id,
          jobType: "finalize_book",
          creditsReserved: 0,
        });

        // We need totalCredits for final consumption
        const bookWithCredits = await db.book.findUnique({ where: { id } });
        const totalCredits = bookWithCredits?.totalCreditsEstimated || 0;

        await jobQueue.startJob(jobId, "finalize_book", async () => {
          await finalizeBook(id, profile.id, jobId, totalCredits);
        });

        return NextResponse.json({ success: true, data: { jobId, status: 'finalizing' } });
      }
    }

    return NextResponse.json({ success: false, error: 'Invalid approval type' }, { status: 400 });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return unauthorizedResponse();
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Approval failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
