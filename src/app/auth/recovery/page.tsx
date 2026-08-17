'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function RecoveryPage() {
  const router = useRouter()
  const supabase = createClient()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    
    const handleRecovery = async () => {
      // Supabase puts the access token in the URL hash fragment for recovery flows
      const hash = window.location.hash
      
      if (hash) {
        // Extract tokens from hash fragment
        const params = new URLSearchParams(hash.substring(1))
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        const type = params.get('type')
        const expiresIn = params.get('expires_in')

        if (accessToken && refreshToken) {
          try {
            // Set the session from the hash fragment tokens
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })

            if (error) {
              console.error('Session recovery error:', error)
              router.push('/login?error=recovery_failed')
              return
            }

            // Success - redirect based on type
            if (type === 'recovery') {
              // Password reset flow - redirect to update password page
              router.push('/auth/update-password')
            } else {
              // Other auth flows (signup confirmation, etc.)
              router.push('/')
            }
          } catch (err) {
            console.error('Recovery error:', err)
            router.push('/login?error=recovery_failed')
          }
        } else {
          router.push('/login?error=invalid_recovery_link')
        }
      } else {
        // No hash fragment - might be a direct visit or expired link
        router.push('/login?error=invalid_recovery_link')
      }
    }

    handleRecovery()
  }, [router, supabase])

  // Don't render anything until mounted to avoid hydration mismatch
  if (!mounted) {
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
      <div className="w-full max-w-md p-8 rounded-2xl bg-[#0d0d10] border border-white/10 shadow-2xl text-center" suppressHydrationWarning>
        <Loader2 className="h-10 w-10 animate-spin text-purple-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Processing Recovery Link</h2>
        <p className="text-sm text-slate-400">Please wait while we verify your session...</p>
      </div>
    </div>
  )
}