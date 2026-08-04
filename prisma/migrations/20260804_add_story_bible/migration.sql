-- CreateTable
CREATE TABLE "story_bible_entities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "motivation" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "physicalTraits" TEXT NOT NULL DEFAULT '{}',
    "secrets" TEXT NOT NULL DEFAULT '{}',
    "portraitUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_bible_entities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "story_bible_entities_bookId_kind_idx" ON "story_bible_entities"("bookId", "kind");

-- CreateIndex
CREATE INDEX "story_bible_entities_ownerId_idx" ON "story_bible_entities"("ownerId");

-- AddForeignKey
ALTER TABLE "story_bible_entities" ADD CONSTRAINT "story_bible_entities_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_bible_entities" ADD CONSTRAINT "story_bible_entities_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
