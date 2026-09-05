import { Suspense } from 'react';
import { loadFounderSoldCount } from '@/lib/server/founderOffer';
import { PricingClient } from './PricingClient';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const soldCount = await loadFounderSoldCount();
  return (
    <Suspense fallback={<div className="py-24 text-center text-slate-400">Loading pricing…</div>}>
      <PricingClient soldCount={soldCount} />
    </Suspense>
  );
}
