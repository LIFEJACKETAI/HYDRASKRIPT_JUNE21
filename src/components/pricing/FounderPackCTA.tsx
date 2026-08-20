'use client';

import { useState } from 'react';
import { FOUNDER_PACK, getFounderOfferStatus } from '@/config/founderPack';

type FounderPackCTAProps = {
  soldCount: number;
};

export function FounderPackCTA({ soldCount }: FounderPackCTAProps) {
  const offer = getFounderOfferStatus(soldCount);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const handleBecomeFounder = async () => {
    setStartingCheckout(true);
    setCheckoutError(null);
    try {
      const response = await fetch('/api/checkout/founder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await response.json();
      if (result.success && result.data?.checkoutUrl) {
        window.location.href = result.data.checkoutUrl;
        return;
      }
      setCheckoutError(result.error || 'Unable to start Founder checkout.');
    } catch {
      setCheckoutError('Failed to start Founder checkout. Please try again.');
    } finally {
      setStartingCheckout(false);
    }
  };
  const progressPercent = Math.min(
    100,
    Math.round((soldCount / FOUNDER_PACK.totalSlots) * 100)
  );

  // Calculate phase-specific progress
  const earlyBirdSold = Math.min(soldCount, FOUNDER_PACK.earlyBird.slots);
  const standardSold = Math.max(0, soldCount - FOUNDER_PACK.earlyBird.slots);
  const earlyBirdPercent = Math.round((earlyBirdSold / FOUNDER_PACK.earlyBird.slots) * 100);
  const standardPercent = Math.round((standardSold / FOUNDER_PACK.standard.slots) * 100);

  // Time-based urgency (optional - could be enhanced with real deadline)
  const getPhaseStatus = () => {
    if (soldCount >= FOUNDER_PACK.totalSlots) return 'closed';
    if (soldCount < FOUNDER_PACK.earlyBird.slots) return 'early_bird';
    return 'standard';
  };

  const phaseStatus = getPhaseStatus();

  return (
    <section className="w-full bg-black px-6 py-16 text-white">
      <div className="mx-auto max-w-5xl rounded-2xl border border-gray-800 bg-[#2a2a2a] p-8 shadow-2xl">
        <div className="mb-6 inline-flex rounded-full border border-cyan-500/40 bg-black px-4 py-2 text-sm text-cyan-300">
          Limited Founder Lifetime Offer
        </div>
        
        {/* Phase Status Badge */}
        <div className="mb-6 flex items-center gap-3 flex-wrap">
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
            phaseStatus === 'early_bird' 
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
              : phaseStatus === 'standard' 
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' 
                : 'bg-gray-700 text-gray-400 border border-gray-600'
          }`}>
            {phaseStatus === 'early_bird' && (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                </span>
                EARLY BIRD PHASE
              </>
            )}
            {phaseStatus === 'standard' && (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </span>
                STANDARD PHASE
              </>
            )}
            {phaseStatus === 'closed' && 'OFFER CLOSED'}
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h2 className="mb-4 bg-gradient-to-r from-purple-500 to-cyan-500 bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
              Become a HydraSkript Founder
            </h2>
            <p className="mb-6 text-lg text-gray-300">
              One payment. Lifetime access to the core book generation platform.
              Limited to the first 500 founders.
            </p>

            {/* Phase Breakdown Cards */}
            <div className="mb-8 grid gap-4 sm:grid-cols-2">
              {/* Early Bird Phase Card */}
              <div className={`relative rounded-xl border p-5 ${
                phaseStatus === 'early_bird' 
                  ? 'border-purple-500/50 bg-purple-500/5 ring-1 ring-purple-500/20' 
                  : phaseStatus === 'standard' 
                    ? 'border-gray-700/50 bg-gray-800/50 opacity-60' 
                    : 'border-gray-700/50 bg-gray-800/50 opacity-40'
              }`}>
                {phaseStatus === 'early_bird' && (
                  <div className="absolute -top-3 left-4 px-2 py-0.5 text-[10px] font-bold text-purple-300 bg-purple-600 rounded-full">
                    CURRENT PHASE
                  </div>
                )}
                {phaseStatus === 'standard' && (
                  <div className="absolute -top-3 left-4 px-2 py-0.5 text-[10px] font-bold text-gray-500 bg-gray-800 rounded-full">
                    COMPLETED
                  </div>
                )}
                {phaseStatus === 'closed' && (
                  <div className="absolute -top-3 left-4 px-2 py-0.5 text-[10px] font-bold text-gray-500 bg-gray-800 rounded-full">
                    COMPLETED
                  </div>
                )}

                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm uppercase tracking-wide text-gray-400">Early Bird</span>
                  <span className="text-2xl font-bold text-white">${FOUNDER_PACK.earlyBird.displayPrice}</span>
                </div>
                <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden mb-3">
                  <div 
                    className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, earlyBirdPercent)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{earlyBirdSold} / {FOUNDER_PACK.earlyBird.slots} claimed</span>
                  <span>{100 - earlyBirdPercent} spots remaining</span>
                </div>
                <p className="mt-3 text-sm text-gray-300">
                  {phaseStatus === 'early_bird' 
                    ? `Hurry! Only ${FOUNDER_PACK.earlyBird.slots - earlyBirdSold} spots left at $399!`
                    : 'Early bird phase complete. All 100 spots claimed.'}
                </p>
              </div>

              {/* Standard Phase Card */}
              <div className={`relative rounded-xl border p-5 ${
                phaseStatus === 'standard' 
                  ? 'border-cyan-500/50 bg-cyan-500/5 ring-1 ring-cyan-500/20' 
                  : phaseStatus === 'early_bird' 
                    ? 'border-gray-700/50 bg-gray-800/50 opacity-60' 
                    : 'border-gray-700/50 bg-gray-800/50 opacity-40'
              }`}>
                {phaseStatus === 'standard' && (
                  <div className="absolute -top-3 left-4 px-2 py-0.5 text-[10px] font-bold text-cyan-300 bg-cyan-600 rounded-full">
                    CURRENT PHASE
                  </div>
                )}
                {phaseStatus === 'closed' && (
                  <div className="absolute -top-3 left-4 px-2 py-0.5 text-[10px] font-bold text-gray-500 bg-gray-800 rounded-full">
                    CLOSED
                  </div>
                )}

                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm uppercase tracking-wide text-gray-400">Standard</span>
                  <span className="text-2xl font-bold text-white">${FOUNDER_PACK.standard.displayPrice}</span>
                </div>
                <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden mb-3">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, standardPercent)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{standardSold} / {FOUNDER_PACK.standard.slots} claimed</span>
                  <span>{FOUNDER_PACK.standard.slots - standardSold} spots remaining</span>
                </div>
                <p className="mt-3 text-sm text-gray-300">
                  {phaseStatus === 'standard'
                    ? `Only ${FOUNDER_PACK.standard.slots - standardSold} spots left at $499!`
                    : phaseStatus === 'early_bird'
                      ? 'Unlocks after Early Bird sells out.'
                      : 'Offer closed. All 500 spots claimed.'}
                </p>
              </div>
            </div>

            {/* Overall Progress */}
            <div className="mb-8">
              <div className="mb-2 flex justify-between text-sm text-gray-300">
                <span>Total Progress: {soldCount} / {FOUNDER_PACK.totalSlots} claimed</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-black">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 via-cyan-500 to-blue-500 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="mb-8 grid gap-3 sm:grid-cols-2">
              {FOUNDER_PACK.includes.slice(0, 8).map((item) => (
                <div key={item} className="flex gap-3 text-gray-300">
                  <span className="text-cyan-400">✓</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>

            {offer.available ? (
              <button
                type="button"
                onClick={handleBecomeFounder}
                disabled={startingCheckout}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-cyan-500 px-8 py-4 text-lg font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {startingCheckout ? (
                  <>
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Starting checkout…
                  </>
                ) : (
                  'Become a Founder'
                )}
              </button>
            ) : (
              <button
                disabled
                className="inline-flex cursor-not-allowed rounded-xl bg-gray-700 px-8 py-4 text-lg font-bold text-gray-300"
              >
                Founder Offer Closed
              </button>
            )}
            {checkoutError && (
              <p className="mt-3 text-sm font-medium text-red-400">{checkoutError}</p>
            )}
          </div>

          <div className="rounded-2xl border border-gray-800 bg-black p-6">
            <h3 className="mb-4 text-2xl font-bold text-white">
              Founder Value
            </h3>
            <div className="mb-6 rounded-xl border border-gray-800 bg-[#2a2a2a] p-5">
              <p className="text-gray-300">You receive:</p>
              <p className="mt-2 text-4xl font-bold text-white">
                500 credits/month
              </p>
              <p className="mt-2 text-gray-400">
                Founder credits refresh monthly and do not roll over.
              </p>
            </div>
            <div className="mb-6 space-y-3 text-gray-300">
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span>100 credits</span>
                <span>$15</span>
              </div>
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span>500 credits</span>
                <span>$60</span>
              </div>
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span>1000 credits</span>
                <span>$100</span>
              </div>
            </div>
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-5">
              <p className="font-semibold text-cyan-300">
                500 credits normally costs $60.
              </p>
              <p className="mt-3 text-gray-300">
                At $399, you break even in approximately 6.7 months.
              </p>
              <p className="mt-2 text-gray-300">
                At $499, you break even in approximately 8.4 months.
              </p>
            </div>
            <div className="mt-6 rounded-xl border border-purple-500/30 bg-purple-500/10 p-5">
              <p className="font-semibold text-purple-300">
                Audiobooks are not included.
              </p>
              <p className="mt-2 text-gray-300">
                Audiobooks are a premium add-on and are charged separately based
                on finished audio length.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-10 border-t border-gray-800 pt-6">
          <h4 className="mb-3 text-lg font-bold text-white">
            Founder Limits
          </h4>
          <div className="grid gap-3 text-sm text-gray-300 md:grid-cols-2">
            <p>• 500 credits/month</p>
            <p>• Max 5 active generation jobs per day</p>
            <p>• Max 50 generated images/month</p>
            <p>• Max 5 completed books/month</p>
            <p>• Max 100,000 generated words/month</p>
            <p>• Audiobooks excluded</p>
            <p>• Credits do not roll over</p>
            <p>• Individual creator use only unless upgraded</p>
          </div>
        </div>
      </div>
    </section>
  );
}