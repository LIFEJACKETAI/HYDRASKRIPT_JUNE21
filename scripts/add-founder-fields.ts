import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter })

async function addFounderFields() {
  try {
    console.log('Adding Founder Lifetime fields to database...')
    
    // Add new columns to profiles table
    await db.$executeRaw`
      ALTER TABLE profiles 
      ADD COLUMN IF NOT EXISTS "monthlyCredits" INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "purchasedCredits" INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "lifetimeCredits" INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "isLifetime" BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS "founderNumber" INTEGER UNIQUE,
      ADD COLUMN IF NOT EXISTS "founderBadge" BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS "monthlyCreditAllowance" INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "monthlyCreditsLastGrantedAt" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "audiobookEnabled" BOOLEAN DEFAULT false;
    `
    console.log('✅ Added Founder fields to profiles')
    
    // Create founder_sales table
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS founder_sales (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "profileId" UUID NOT NULL UNIQUE,
          "founderNumber" INTEGER NOT NULL UNIQUE CHECK ("founderNumber" >= 1 AND "founderNumber" <= 500),
          "pricePaidCents" INTEGER NOT NULL CHECK ("pricePaidCents" IN (39900, 49900)),
          "stripeCheckoutSessionId" TEXT NOT NULL UNIQUE,
          "stripePaymentIntentId" TEXT UNIQUE,
          "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `
    console.log('✅ Created founder_sales table')
    
    // Add foreign key for founder_sales
    await db.$executeRaw`
      ALTER TABLE founder_sales
      ADD CONSTRAINT fk_founder_sales_profile
      FOREIGN KEY ("profileId") REFERENCES profiles(id) ON DELETE CASCADE;
    `
    console.log('✅ Added foreign key for founder_sales')
    
    // Add paymentSource to media_assets
    await db.$executeRaw`
      ALTER TABLE media_assets
      ADD COLUMN IF NOT EXISTS "paymentSource" TEXT DEFAULT 'subscription_allowance';
    `
    console.log('✅ Added paymentSource to media_assets')
    
    // Add index for founder_sales
    await db.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_founder_sales_profile ON founder_sales("profileId");
    `
    console.log('✅ Created index for founder_sales')
    
    console.log('\n✅ Founder Lifetime schema changes applied successfully!')
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await db.$disconnect()
  }
}

addFounderFields()