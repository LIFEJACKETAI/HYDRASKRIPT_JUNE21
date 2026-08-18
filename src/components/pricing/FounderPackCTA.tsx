'use client';

import Link from 'next/link';
import { FOUNDER_PACK, getFounderOfferStatus } from '@/config/founderPack';

type FounderPackCTAProps = {
  soldCount: number;
};

export function FounderPackCTA({ soldCount }: FounderPackCTAProps) {
  const offer = getFounderOfferStatus(soldCount);
  const progressPercent = Math.min(
    100,
    Math.round((soldCount / FOUNDER_PACK.totalSlots) * 100)
  );

  return (
    <section className="w-full bg-black px-6 py-16 text-white">
      <div className="mx-auto max-w-5xl rounded-2xl border border-gray-800 bg-[#2a2a2a] p-8 shadow-2xl">
        <div className="mb-6 inline-flex rounded-full border border-cyan-500/40 bg-black px-4 py-2 text-sm text-cyan-300">
          Limited Founder Lifetime Offer
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
            <div className="mb-8 rounded-xl border border-gray-800 bg-black p-5">
              {offer.available ? (
                <>
                  <p className="text-sm uppercase tracking-wide text-gray-400">
                    Current Founder Price
                  </p>
                  <div className="mt-2 flex items-end gap-3">
                    <span className="text-5xl font-bold text-white">
                      {offer.displayPrice}
                    </span>
                    <span className="pb-2 text-gray-300">one-time</span>
                  </div>
                  <p className="mt-3 text-gray-300">
                    {offer.phase === 'early_bird'
                      ? `First 100 Founder seats. ${offer.remainingSlots} early-bird spots remaining.`
                      : `${offer.remainingSlots} Founder spots remaining at $499.`}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm uppercase tracking-wide text-gray-400">
                    Founder Offer
                  </p>
                  <div className="mt-2 text-4xl font-bold text-white">
                    Closed
                  </div>
                  <p className="mt-3 text-gray-300">
                    All 500 Founder Lifetime seats have been claimed.
                  </p>
                </>
              )}
            </div>
            <div className="mb-8">
              <div className="mb-2 flex justify-between text-sm text-gray-300">
                <span>{soldCount} / {FOUNDER_PACK.totalSlots} claimed</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-black">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-500"
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
              <Link
                href="/api/checkout/founder"
                className="inline-flex rounded-xl bg-gradient-to-r from-purple-500 to-cyan-500 px-8 py-4 text-lg font-bold text-white transition hover:opacity-90"
              >
                Become a Founder
              </Link>
            ) : (
              <button
                disabled
                className="inline-flex cursor-not-allowed rounded-xl bg-gray-700 px-8 py-4 text-lg font-bold text-gray-300"
              >
                Founder Offer Closed
              </button>
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