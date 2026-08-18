import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter })

async function fixDatabase() {
  try {
    console.log('Fixing database schema...')
    
    // Add missing columns to profiles table
    await db.$executeRaw`
      ALTER TABLE profiles 
      ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT,
      ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT,
      ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT DEFAULT 'inactive',
      ADD COLUMN IF NOT EXISTS "currentPeriodEnd" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "freeCreditsGranted" BOOLEAN DEFAULT false;
    `
    console.log('✅ Added Stripe columns to profiles')
    
    // Create editorial_reviews table if not exists
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS editorial_reviews (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "bookId" UUID NOT NULL,
          "ownerId" UUID NOT NULL,
          "jobId" UUID,
          status TEXT DEFAULT 'queued',
          feedback TEXT DEFAULT '',
          score INTEGER,
          "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now(),
          "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `
    console.log('✅ Created editorial_reviews table')
    
    // Add foreign keys for editorial_reviews
    await db.$executeRaw`
      ALTER TABLE editorial_reviews
      ADD CONSTRAINT fk_editorial_reviews_book
      FOREIGN KEY ("bookId") REFERENCES books(id) ON DELETE CASCADE;
    `
    console.log('✅ Added book FK')
    
    await db.$executeRaw`
      ALTER TABLE editorial_reviews
      ADD CONSTRAINT fk_editorial_reviews_owner
      FOREIGN KEY ("ownerId") REFERENCES profiles(id) ON DELETE CASCADE;
    `
    console.log('✅ Added owner FK')
    
    await db.$executeRaw`
      ALTER TABLE editorial_reviews
      ADD CONSTRAINT fk_editorial_reviews_job
      FOREIGN KEY ("jobId") REFERENCES jobs(id) ON DELETE SET NULL;
    `
    console.log('✅ Added job FK')
    
    // Create indexes
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_editorial_reviews_book ON editorial_reviews("bookId");
    `
    console.log('✅ Created book index')
    
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_editorial_reviews_owner ON editorial_reviews("ownerId");
    `
    console.log('✅ Created owner index')
    
    console.log('\n✅ Database schema fixed successfully!')
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await db.$disconnect()
  }
}

fixDatabase()