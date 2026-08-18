import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter })

async function checkChapterStatuses() {
  try {
    const result = await db.$queryRaw`SELECT DISTINCT status FROM chapters`
    console.log('Chapter statuses:', result)
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await db.$disconnect()
  }
}

checkChapterStatuses()