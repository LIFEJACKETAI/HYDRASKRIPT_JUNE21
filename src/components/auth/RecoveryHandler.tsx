'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

export function RecoveryHandler() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const handleRecovery = async () => {
      // Only handle recovery if we're on the landing page or callback page
      // and there's a hash fragment with access_token
      const hash = window.location.hash
      
      if (hash && (pathname === '/' || pathname === '/auth/callback')) {
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
          // No valid tokens in hash
          router.push('/login?error=invalid_recovery_link')
        }
      }
    }

    handleRecovery()
  }, [router, supabase, pathname])

  // This component doesn't render anything
  return null
}