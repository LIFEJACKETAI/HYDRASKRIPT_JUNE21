'use client';

import { useEffect, useState, useRef } from 'react';
import { Loader2, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { getJob } from '@/lib/api';
import type { JobData } from '@/lib/api';
import { GENERATION_FLAVOR } from '@/types';

interface GenerationProgressProps {
  jobId: string;
  genre?: string;
  estimatedDuration?: number | null;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export default function GenerationProgress({ jobId, genre, estimatedDuration, onComplete, onError }: GenerationProgressProps) {
  const [job, setJob] = useState<JobData | null>(null);
  const [flavorIndex, setFlavorIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    setElapsedSeconds(0);
  }, [jobId]);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const flavors = GENERATION_FLAVOR[genre || 'default'] || GENERATION_FLAVOR.default;

  const isChildrenBook = estimatedDuration != null && estimatedDuration > 20;

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const data = await getJob(jobId);
      if (!cancelled && data) {
        setJob(data);
        if (data.status === 'completed') {
          onCompleteRef.current?.();
        } else if (data.status === 'failed') {
          onErrorRef.current?.(data.errorMessage || 'Generation failed');
        }
      }
    }

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId]);

  useEffect(() => {
    if (!job || job.status === 'completed' || job.status === 'failed') return;
    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [job?.status]);

  useEffect(() => {
    if (job && job.status !== 'completed' && job.status !== 'failed') {
      const timer = setInterval(() => {
        setFlavorIndex((prev) => (prev + 1) % flavors.length);
      }, 4000);
      return () => clearInterval(timer);
    }
  }, [job, flavors.length]);

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const estimatedTotal = estimatedDuration ? formatTime(estimatedDuration) : null;
  const elapsed = formatTime(elapsedSeconds);

  if (!job) {
    return (
      <div className="rounded-lg bg-[#1e1e1e] border border-gray-800 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-purple-400 animate-spin" />
          <span className="text-sm text-gray-300">Connecting to generation engine...</span>
        </div>
        <Progress value={0} className="h-2" />
      </div>
    );
  }

  const isComplete = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const isGenerating = !isComplete && !isFailed;

  return (
    <div className={`rounded-lg border p-6 space-y-4 ${
      isFailed ? 'bg-red-500/5 border-red-500/30' :
      isComplete ? 'bg-green-500/5 border-green-500/30' :
      'bg-[#1e1e1e] border-purple-500/30 pulse-glow'
    }`}>
      <div className="flex items-center gap-3">
        {isComplete && <CheckCircle className="h-5 w-5 text-green-400" />}
        {isFailed && <AlertCircle className="h-5 w-5 text-red-400" />}
        {isGenerating && <Loader2 className="h-5 w-5 text-purple-400 animate-spin" />}
        <div className="flex-1">
          <p className="text-sm font-medium text-white">
            {isComplete && 'Generation Complete!'}
            {isFailed && 'Generation Failed'}
            {isGenerating && flavors[flavorIndex]}
          </p>
          {job.progressMessage && (
            <p className="text-xs text-gray-500 mt-0.5">{job.progressMessage}</p>
          )}
        </div>
        {isGenerating && estimatedTotal && (
          <div className="text-right">
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="h-3 w-3" />
              <span>Est. {estimatedTotal}</span>
            </div>
            <p className="text-xs text-purple-400 mt-0.5">Elapsed: {elapsed}</p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Progress
          value={job.progressPercent || 0}
          className="h-2 progress-gradient"
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>{job.progressPercent || 0}% complete</span>
          {isGenerating && (
            <span className="text-purple-400">
              {job.creditsConsumed} / {job.creditsReserved} credits used
            </span>
          )}
        </div>
      </div>

      {isFailed && job.errorMessage && (
        <div className="rounded bg-red-500/10 border border-red-500/20 p-3">
          <p className="text-xs text-red-300">{job.errorMessage}</p>
        </div>
      )}
    </div>
  );
}
