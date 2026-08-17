import { createClient } from '@supabase/supabase-js'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Create Prisma client for database updates
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter })

async function resetAdminPassword() {
  const email = 'admin@hydraskript.com'
  const newPassword = 'Admin123!@#' // Change this to whatever you want

  try {
    // First, find the user
    const { data: users, error: listError } = await supabase.auth.admin.listUsers()
    
    if (listError) {
      console.error('Error listing users:', listError)
      return
    }

    const adminUser = users.users.find(u => u.email === email)
    
    if (!adminUser) {
      console.log('Admin user not found:', email)
      return
    }

    console.log('Found admin user:', adminUser.id, adminUser.email)

    // Update the password
    const { data, error } = await supabase.auth.admin.updateUserById(adminUser.id, {
      password: newPassword,
      email_confirm: true
    })

    if (error) {
      console.error('Error updating password:', error)
      return
    }

    console.log('✅ Password reset successfully!')
    console.log('Email:', email)
    console.log('New Password:', newPassword)
    console.log('User ID:', data.user?.id)
    
    // Also update their profile to give them max credits
    // Use raw SQL to avoid issues with new schema fields not in DB yet
    await db.$executeRaw`UPDATE profiles SET tier = 'studio', credits = 100000, "isAdmin" = true WHERE id = ${adminUser.id}`
    console.log('✅ Profile updated via raw SQL')

  } catch (err) {
    console.error('Unexpected error:', err)
  } finally {
    await db.$disconnect()
  }
}

resetAdminPassword()