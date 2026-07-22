'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Play,
  Download,
  Trash2,
  BookOpen,
  Users,
  Tag,
  Zap,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAppStore } from '@/lib/store';
import { getBook, deleteBook, startGeneration, exportBook } from '@/lib/api';
import type { BookData } from '@/lib/api';
import ChapterEditor from '@/components/book/ChapterEditor';
import GenerationProgress from '@/components/book/GenerationProgress';
import OutlineEditor from '@/components/book/OutlineEditor';
import { toast } from '@/hooks/use-toast';

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
  outlining: { label: 'Outlining', className: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  awaiting_outline_approval: { label: 'Awaiting Approval', className: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  writing: { label: 'Writing', className: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  awaiting_chapter_approval: { label: 'Reviewing Chapter', className: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  finalizing: { label: 'Finalizing', className: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  completed: { label: 'Completed', className: 'bg-green-500/20 text-green-300 border-green-500/30' },
  failed: { label: 'Failed', className: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

const audienceLabels: Record<string, string> = {
  adult: 'Adult',
  '0-5': 'Ages 0-5',
  '6-9': 'Ages 6-9',
  '10-14': 'Ages 10-14',
};

export default function BookDetail() {
  const { selectedBookId, setSelectedBookId, setCurrentView, setIsGenerating, activeJobId, setActiveJobId } = useAppStore();
  const [book, setBook] = useState<BookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [generationJobId, setGenerationJobId] = useState<string | null>(activeJobId);

  const fetchBook = useCallback(async () => {
    if (!selectedBookId) return;
    setLoading(true);
    const data = await getBook(selectedBookId);
    setBook(data);
    setLoading(false);
  }, [selectedBookId]);

  // ✅ Derived outline — safe against null + malformed JSON, recomputes when book loads
  const parsedOutline = useMemo(() => {
    if (!book?.outline) return { title: '', chapters: [] };
    try {
      return JSON.parse(book.outline);
    } catch {
      return { title: '', chapters: [] };
    }
  }, [book]);

  useEffect(() => {
    fetchBook();
  }, [fetchBook]);

  // Refresh book data when generation completes
  const handleGenerationComplete = useCallback(() => {
    setIsGenerating(false);
    setActiveJobId(null);
    setGenerationJobId(null);
    fetchBook();
    toast({ title: 'Generation complete!', description: 'Your book has been generated.' });
  }, [fetchBook, setIsGenerating, setActiveJobId]);

  const handleGenerationError = useCallback((error: string) => {
    setIsGenerating(false);
    setActiveJobId(null);
    setGenerationJobId(null);
    toast({ title: 'Generation failed', description: error, variant: 'destructive' });
  }, [setIsGenerating, setActiveJobId]);

  const handleApproveOutline = async (updatedOutline: any) => {
    try {
      const response = await fetch(`/api/books/${selectedBookId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'outline', updatedOutline }),
      });
      const result = await response.json();
      if (result.success) {
        toast({ title: 'Outline approved!', description: 'The AI is now writing your first chapter.' });
        fetchBook();
      } else {
        toast({ title: 'Approval failed', description: result.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to approve outline.', variant: 'destructive' });
    }
  };

  const handleStartGeneration = async () => {
    if (!selectedBookId) return;
    setIsGenerating(true);
    try {
      const result = await startGeneration(selectedBookId);
      if (result.success && result.data) {
        const data = result.data as { jobId: string; estimatedCredits: number };
        setActiveJobId(data.jobId);
        setGenerationJobId(data.jobId);
        toast({
          title: 'Generation started!',
          description: `Estimated ${data.estimatedCredits} credits`,
        });
        fetchBook();
      } else {
        setIsGenerating(false);
        toast({
          title: 'Failed to start generation',
          description: result.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch {
      setIsGenerating(false);
      toast({ title: 'Error', description: 'Failed to start generation.', variant: 'destructive' });
    }
  };

  const handleExport = async () => {
    if (!selectedBookId) return;
    setIsExporting(true);
    try {
      const result = await exportBook(selectedBookId);
      if (result.success && result.data) {
        const data = result.data as { downloadUrl: string };
        if (data.downloadUrl) {
          window.open(data.downloadUrl, '_blank');
        }
        toast({ title: 'Export started!', description: 'Your PDF is being prepared.' });
      } else {
        toast({
          title: 'Export failed',
          description: result.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to export book.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedBookId) return;
    setIsDeleting(true);
    try {
      const result = await deleteBook(selectedBookId);
      if (result.success) {
        toast({ title: 'Book deleted', description: 'The book has been removed.' });
        setSelectedBookId(null);
        setCurrentView('dashboard');
      } else {
        toast({ title: 'Failed to delete', description: result.error || 'Unknown error', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to delete book.', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="text-center py-12">
        <BookOpen className="h-12 w-12 mx-auto text-gray-600 mb-4" />
        <p className="text-gray-400">Book not found.</p>
        <Button variant="ghost" onClick={() => setCurrentView('dashboard')} className="mt-4 text-purple-400">
          ← Back to Dashboard
        </Button>
      </div>
    );
  }

  const statusInfo = statusConfig[book.status] || statusConfig.draft;
  const isDraft = book.status === 'draft';
  const isCompleted = book.status === 'completed';
  const isFailed = book.status === 'failed';

  const gradientSeed = book.id.charCodeAt(0) % 6;
  const gradients = [
    'from-purple-600/40 to-cyan-600/40',
    'from-pink-600/40 to-purple-600/40',
    'from-cyan-600/40 to-blue-600/40',
    'from-amber-600/40 to-red-600/40',
    'from-green-600/40 to-teal-600/40',
    'from-violet-600/40 to-indigo-600/40',
  ];
 
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setSelectedBookId(null);
            setCurrentView('dashboard');
          }}
          className="text-gray-400 hover:text-white hover:bg-[#1e1e1e]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white truncate">{book.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={`text-[10px] border ${statusInfo.className}`}>
              {statusInfo.label}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDraft && (
            <Button onClick={handleStartGeneration} className="btn-gradient" disabled={book.status === 'generating'}>
              <Play className="h-4 w-4 mr-2" />
              Generate
            </Button>
          )}
          {isFailed && (
            <Button onClick={handleStartGeneration} className="btn-gradient" variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          )}
          {isCompleted && (
            <Button onClick={handleExport} disabled={isExporting} className="bg-[#1e1e1e] text-cyan-300 hover:bg-[#252525] border border-cyan-500/30">
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? 'Exporting...' : 'Export PDF'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowDeleteDialog(true)}
            className="text-gray-500 hover:text-red-400 hover:bg-[#1e1e1e]"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Cover & Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Cover */}
        <div className="md:col-span-1">
          <div className={`rounded-xl overflow-hidden aspect-[3/4] ${book.coverImageUrl ? '' : `bg-gradient-to-br ${gradients[gradientSeed]}`} flex items-center justify-center border border-gray-800`}>
            {book.coverImageUrl ? (
              <img src={book.coverImageUrl} alt={book.title} className="w-full h-full object-cover" />
            ) : (
              <BookOpen className="h-16 w-16 text-white/20" />
            )}
          </div>
        </div>

        {/* Details */}
        <div className="md:col-span-2 space-y-4">
          <Card className="bg-[#2a2a2a] border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-base">Book Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 flex items-center gap-1"><Tag className="h-3 w-3" /> Genre</p>
                  <p className="text-sm text-white mt-0.5 capitalize">{book.genre}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 flex items-center gap-1"><Users className="h-3 w-3" /> Audience</p>
                  <p className="text-sm text-white mt-0.5">{audienceLabels[book.targetAudience] || book.targetAudience}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 flex items-center gap-1"><FileText className="h-3 w-3" /> Chapters</p>
                  <p className="text-sm text-white mt-0.5">{book.chapters?.length || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 flex items-center gap-1"><Zap className="h-3 w-3" /> Credits</p>
                  <p className="text-sm text-white mt-0.5">
                    {book.totalCreditsCharged > 0 ? book.totalCreditsCharged : book.totalCreditsEstimated} est.
                  </p>
                </div>
                {book.styleProfile && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500">Style Profile</p>
                    <p className="text-sm text-purple-300 mt-0.5">{book.styleProfile.name}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Outline View (Static) */}
          {book.outline && book.status !== 'awaiting_outline_approval' && (
            <Card className="bg-[#2a2a2a] border-gray-800">
              <CardHeader>
                <CardTitle className="text-white text-base">Outline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {parsedOutline.title && <h3 className="text-purple-300 font-semibold">{parsedOutline.title}</h3>}
                  <div className="space-y-2">
                    {parsedOutline.chapters?.map((ch: any, i: number) => (
                      <div key={i} className="text-sm">
                        <span className="text-gray-500 mr-2">Ch {i+1}:</span>
                        <span className="text-white font-medium">{ch.title}</span>
                        <p className="text-gray-400 mt-1 ml-8">{ch.synopsis}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Blueprint Editor - Visible only when awaiting approval */}
      {book.status === 'awaiting_outline_approval' && (
        <OutlineEditor
          outline={(() => {
            try { return JSON.parse(book.outline || '{}').chapters ?? []; }
            catch { return []; }
       })()}
          onApprove={handleApproveOutline}
          isLoading={!!generationJobId}
        />
      )}

      {/* Generation Progress */}
      {generationJobId && (
        <GenerationProgress
          jobId={generationJobId}
          genre={book.genre}
          onComplete={handleGenerationComplete}
          onError={handleGenerationError}
        />
      )}

      {/* Chapters */}
      <Card className="bg-[#2a2a2a] border-gray-800">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-purple-400" />
            Chapters ({book.chapters?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChapterEditor chapters={book.chapters || []} bookId={selectedBookId || ''} />
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-[#1a1a1a] border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>Delete Book</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to delete "{book.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
