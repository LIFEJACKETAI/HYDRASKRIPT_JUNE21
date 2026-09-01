'use client';

import { useState, useMemo, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ArrowLeft } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('[Auth] Sign-in error:', error);
        toast({
          title: 'Authentication failed',
          description: error.message || 'Please check your credentials',
          variant: 'destructive',
        });
        return;
      }

      // Verify session is established before redirecting
      if (data.session) {
        toast({ title: 'Welcome back!' });
        const redirectTo = next.startsWith('/') ? next : '/';
        window.location.href = redirectTo;
        return;
      }

      console.error('[Auth] No session returned after sign-in');
      toast({
        title: 'Authentication failed',
        description: 'Sign-in succeeded, but no session was established. Try refreshing.',
        variant: 'destructive',
      });
    } catch (error: any) {
      console.error('[Auth] Sign-in error:', error);
      toast({
        title: 'Authentication failed',
        description: error.message || 'Please check your credentials',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
      <div className="w-full max-w-md p-8 rounded-2xl bg-[#0d0d10] border border-white/10 shadow-2xl" suppressHydrationWarning>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/')}
          className="mb-6 text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>

        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">Welcome Back</h2>
          <p className="text-sm text-slate-400">Enter your credentials to access your account.</p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-300 text-xs">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-600"
              placeholder="your@email.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300 text-xs">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-600"
              placeholder="••••••••"
              minLength={6}
            />
          </div>

          <Button type="submit" disabled={loading} className="btn-gradient w-full py-6">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign In'}
          </Button>
        </form>

        <div className="mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/auth/forgot-password')}
            className="text-slate-400 hover:text-white text-sm w-full"
          >
            Forgot your password?
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
