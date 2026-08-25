'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app] route error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-xl font-semibold text-white">Something went wrong</h2>
      <p className="max-w-md text-sm text-slate-400">
        {error.message || 'An unexpected error occurred while rendering this view.'}
      </p>
      <Button onClick={() => reset()}>Try again</Button>
    </div>
  );
}
