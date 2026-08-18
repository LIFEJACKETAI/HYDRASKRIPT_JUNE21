import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter })

async function addBookFields() {
  try {
    console.log('Adding description and chapterCount fields to books table...')
    
    // Add description column
    await db.$executeRaw`
      ALTER TABLE books 
      ADD COLUMN IF NOT EXISTS description TEXT
    `
    console.log('✅ Added description column')
    
    // Add chapterCount column
    await db.$executeRaw`
      ALTER TABLE books 
      ADD COLUMN IF NOT EXISTS "chapterCount" INTEGER
    `
    console.log('✅ Added chapterCount column')
    
    console.log('\n✅ Book fields added successfully!')
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await db.$disconnect()
  }
}

addBookFields()