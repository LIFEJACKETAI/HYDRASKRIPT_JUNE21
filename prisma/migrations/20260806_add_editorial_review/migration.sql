-- CreateTable
CREATE TABLE "editorial_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "bookId" UUID,
    "scope" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "textLength" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "jobId" UUID,
    "sourceText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "editorial_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editorial_findings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reviewId" UUID NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quote" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "bookTitle" TEXT NOT NULL DEFAULT '',
    "suggestion" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "editorial_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "editorial_reviews_ownerId_createdAt_idx" ON "editorial_reviews"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "editorial_findings_reviewId_idx" ON "editorial_findings"("reviewId");

-- AddForeignKey
ALTER TABLE "editorial_reviews" ADD CONSTRAINT "editorial_reviews_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_reviews" ADD CONSTRAINT "editorial_reviews_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_reviews" ADD CONSTRAINT "editorial_reviews_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editorial_findings" ADD CONSTRAINT "editorial_findings_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "editorial_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

