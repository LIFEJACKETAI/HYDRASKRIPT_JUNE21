'use client'

import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

export default function AuthCodeErrorPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
      <div className="w-full max-w-md p-8 rounded-2xl bg-[#0d0d10] border border-white/10 shadow-2xl text-center" suppressHydrationWarning>
        <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Authentication Error</h2>
        <p className="text-sm text-slate-400 mb-6">
          The authentication link is invalid or has expired. This can happen if the link was already used or if it expired.
        </p>
        <div className="flex flex-col gap-3">
          <Button
            variant="outline"
            onClick={() => router.push('/login')}
            className="flex items-center justify-center gap-3 py-6 border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          >
            Go to Login
          </Button>
          <Button
            variant="ghost"
            onClick={() => router.push('/')}
            className="text-slate-400 hover:text-white"
          >
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  )
}