import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter })

async function fixBookStatusEnum() {
  try {
    console.log('Fixing BookStatus enum...')
    
    // Add missing values to BookStatus enum
    const missingValues = [
      'outlining',
      'awaiting_outline_approval',
      'writing',
      'awaiting_chapter_approval',
      'finalizing'
    ]
    
    for (const value of missingValues) {
      await db.$executeRawUnsafe(`ALTER TYPE "BookStatus" ADD VALUE IF NOT EXISTS '${value}'`)
      console.log(`✅ Added ${value} to BookStatus enum`)
    }
    
    console.log('\n✅ BookStatus enum fixed successfully!')
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await db.$disconnect()
  }
}

fixBookStatusEnum()