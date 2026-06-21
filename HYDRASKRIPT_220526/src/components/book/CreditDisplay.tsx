'use client';

import { Coins, AlertTriangle } from 'lucide-react';

interface CreditDisplayProps {
  credits: number | null;
}

export default function CreditDisplay({ credits }: CreditDisplayProps) {
  if (credits === null) {
    return (
      <div className="rounded-lg bg-[#1e1e1e] p-3 border border-gray-800">
        <div className="flex items-center gap-2 text-gray-500">
          <Coins className="h-4 w-4" />
          <span className="text-xs">Loading credits...</span>
        </div>
      </div>
    );
  }

  const isLow = credits < 20;

  return (
    <div className={`rounded-lg p-3 border ${isLow ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-gray-800 bg-[#1e1e1e]'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className={`h-4 w-4 ${isLow ? 'text-yellow-400' : 'text-purple-400'}`} />
          <span className="text-xs text-gray-400">Credits</span>
        </div>
        {isLow && (
          <AlertTriangle className="h-3 w-3 text-yellow-400" />
        )}
      </div>
      <p className={`text-xl font-bold mt-1 ${isLow ? 'text-yellow-300' : 'text-white'}`}>
        {credits.toLocaleString()}
      </p>
      {isLow && (
        <p className="text-[10px] text-yellow-400/80 mt-1">
          Low balance — purchase more credits
        </p>
      )}
    </div>
  );
}
