'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, FileText, ImageIcon, Clock, CheckCircle, AlertCircle, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import type { ChapterData } from '@/lib/api';
import { retryChapter } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

const chapterStatusConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending: { label: 'Pending', icon: Clock, className: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
  writing: { label: 'Writing', icon: Loader2, className: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  reviewing: { label: 'Reviewing', icon: Loader2, className: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  awaiting_approval: { label: 'Review Needed', icon: Sparkles, className: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  completed: { label: 'Completed', icon: CheckCircle, className: 'bg-green-500/20 text-green-300 border-green-500/30' },
  failed: { label: 'Failed', icon: AlertCircle, className: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

interface ChapterEditorProps {
  chapters: ChapterData[];
  bookId: string;
  onChapterApproved?: (jobId?: string) => void;
  onChapterRetried?: (jobId: string) => void;
}

export default function ChapterEditor({ chapters, bookId, onChapterApproved, onChapterRetried }: ChapterEditorProps) {
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [approvingChapter, setApprovingChapter] = useState<string | null>(null);
  const [retryingChapter, setRetryingChapter] = useState<string | null>(null);
  const [localChapters, setLocalChapters] = useState<ChapterData[]>(chapters);

  useEffect(() => {
    setLocalChapters(chapters);
  }, [chapters]);

  const handleApprove = async (chapterId: string, index: number) => {
    setApprovingChapter(chapterId);
    try {
      const response = await fetch(`/api/books/${bookId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'chapter', chapterIndex: index }),
      });
      if (response.status === 401) {
        // Session expired while reviewing. Send them back through login.
        toast({ title: 'Session expired', description: 'Please log in again to continue.' });
        window.location.href = `/login?next=${encodeURIComponent('/dashboard')}`;
        return;
      }
      const result = await response.json();
      if (result.success) {
        toast({ title: 'Chapter approved!', description: 'Moving to the next chapter...' });
        setLocalChapters(prev =>
          prev.map(ch =>
            ch.index === index ? { ...ch, status: 'completed' as const, approvalStatus: 'approved' } : ch
          )
        );
        setExpandedChapter(null);
        // The approve endpoint returns the next chapter's jobId (or the
        // finalize jobId). Hand it to the parent so the progress UI resumes
        // polling instead of going dark while the next chapter writes.
        const nextJobId = result.data?.jobId as string | undefined;
        onChapterApproved?.(nextJobId);
      } else {
        toast({ title: 'Approval failed', description: result.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to approve chapter.', variant: 'destructive' });
    } finally {
      setApprovingChapter(null);
    }
  };

  const handleRetry = async (chapterId: string, index: number) => {
    setRetryingChapter(chapterId);
    try {
      const result = await retryChapter(bookId, index);
      if (result.success && result.data) {
        toast({ title: 'Retrying chapter...', description: 'Generation has been restarted for this chapter.' });
        setLocalChapters(prev =>
          prev.map(ch =>
            ch.index === index
              ? { ...ch, status: 'writing' as const, approvalStatus: 'pending', content: '', wordCount: 0 }
              : ch
          )
        );
        onChapterRetried?.(result.data.jobId);
      } else {
        toast({ title: 'Retry failed', description: result.error || 'Could not restart chapter generation.', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to retry chapter.', variant: 'destructive' });
    } finally {
      setRetryingChapter(null);
    }
  };

  if (!localChapters || localChapters.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p>No chapters yet. Generate the book to create chapters.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[600px] custom-scrollbar">
      <div className="space-y-2 pr-2">
        {localChapters
          .sort((a, b) => a.index - b.index)
          .map((chapter) => {
            const statusInfo = chapterStatusConfig[chapter.status] || chapterStatusConfig.pending;
            const StatusIcon = statusInfo.icon;
            const isExpanded = expandedChapter === chapter.id;

            return (
              <div
                key={chapter.id}
                className="rounded-lg border border-gray-800 bg-[#1e1e1e] overflow-hidden"
              >
                <button
                  onClick={() => setExpandedChapter(isExpanded ? null : chapter.id)}
                  className="w-full flex items-center justify-between p-3 hover:bg-[#252525] transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-purple-400 font-mono text-xs font-bold">
                      {String(chapter.index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-sm font-medium text-white truncate">
                        {chapter.title || `Chapter ${chapter.index + 1}`}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-500">
                          {chapter.wordCount?.toLocaleString() || 0} words
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {chapter.illustrationUrl && (
                      <ImageIcon className="h-3 w-3 text-cyan-400" />
                    )}
                    <Badge className={`text-[9px] border ${statusInfo.className}`}>
                      <StatusIcon className={`h-2.5 w-2.5 mr-1 ${chapter.status === 'writing' || chapter.status === 'reviewing' ? 'animate-spin' : ''}`} />
                      {statusInfo.label}
                    </Badge>
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    </motion.div>
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="border-t border-gray-800 p-4 space-y-3">
                        {chapter.synopsis && (
                          <div>
                            <h5 className="text-xs font-medium text-gray-400 mb-1">Synopsis</h5>
                            <p className="text-sm text-gray-300">{chapter.synopsis}</p>
                          </div>
                        )}

                        {chapter.illustrationUrl && (
                          <div>
                            <h5 className="text-xs font-medium text-gray-400 mb-1">Illustration</h5>
                            <img
                              src={chapter.illustrationUrl}
                              alt={`Illustration for ${chapter.title}`}
                              className="rounded-lg max-h-48 object-cover border border-gray-800"
                            />
                          </div>
                        )}

                        {chapter.status === 'failed' && (
                          <div className="rounded bg-red-500/10 border border-red-500/20 p-3 space-y-3">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                              <div>
                                <p className="text-sm font-medium text-red-200">This chapter failed to generate</p>
                                <p className="text-xs text-red-300/70 mt-0.5">
                                  The rest of your book is safe. Retry to restart generation for this chapter only.
                                </p>
                              </div>
                            </div>
                            <Button
                              onClick={() => handleRetry(chapter.id, chapter.index)}
                              disabled={retryingChapter === chapter.id}
                              className="w-full h-10 text-sm bg-red-500/20 text-red-100 hover:bg-red-500/30 border border-red-500/30"
                            >
                              {retryingChapter === chapter.id ? (
                                <><Loader2 className="h-3 w-3 mr-2 animate-spin" /> Restarting...</>
                              ) : (
                                <><RefreshCw className="h-3 w-3 mr-2" /> Retry / Regenerate Chapter</>
                              )}
                            </Button>
                          </div>
                        )}

                        {chapter.content ? (
                          <div className="space-y-4">
                            <div>
                              <h5 className="text-xs font-medium text-gray-400 mb-1">Content</h5>
                              <div className="prose prose-invert prose-sm max-w-none text-gray-300 whitespace-pre-wrap leading-relaxed">
                                {chapter.content}
                              </div>
                            </div>
                            {chapter.status === 'awaiting_approval' && (
                              <Button
                                onClick={() => handleApprove(chapter.id, chapter.index)}
                                disabled={approvingChapter === chapter.id}
                                className="w-full btn-gradient h-10 text-sm"
                              >
                                {approvingChapter === chapter.id ? (
                                  <><Loader2 className="h-3 w-3 mr-2 animate-spin" /> Processing...</>
                                ) : (
                                  <><CheckCircle className="h-3 w-3 mr-2" /> Approve & Proceed to Next Chapter</>
                                )}
                              </Button>
                            )}
                          </div>
                        ) : (
                          chapter.status !== 'failed' && (
                            <p className="text-sm text-gray-500 italic">
                              Content not yet generated.
                            </p>
                          )
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
      </div>
    </ScrollArea>
  );
}
