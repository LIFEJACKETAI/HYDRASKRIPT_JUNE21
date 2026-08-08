'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Loader2,
  FileText,
  Trash2,
  Upload,
  RefreshCw,
  BookOpen,
  CheckCircle,
  RotateCcw,
  XCircle,
  AlertOctagon,
  AlertTriangle,
  Info,
  Clock,
  User,
  Link2,
  Puzzle,
  MapPin,
  Eye,
  Globe,
  MessageSquare,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getJob, runEditorialReview, listEditorialReviews, getEditorialReview, updateEditorialFindingStatus, deleteEditorialReview } from '@/lib/api';
import type { BookData, EditorialCategory, EditorialFindingData, EditorialFindingStatus, EditorialReviewDetail, EditorialReviewSummary } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

// ─── Meta config ──────────────────────────────────────────────────────────────

const SEVERITY_META: Record<string, { label: string; icon: React.ElementType; text: string; border: string; bg: string; dot: string }> = {
  critical: { label: 'Critical', icon: AlertOctagon, text: 'text-red-400', border: 'border-red-500/25', bg: 'bg-red-500/5', dot: 'bg-red-400' },
  warning: { label: 'Warning', icon: AlertTriangle, text: 'text-amber-400', border: 'border-amber-500/25', bg: 'bg-amber-500/5', dot: 'bg-amber-400' },
  info: { label: 'Info', icon: Info, text: 'text-sky-400', border: 'border-sky-500/25', bg: 'bg-sky-500/5', dot: 'bg-sky-400' },
};

const CATEGORY_META: Record<EditorialCategory, { label: string; icon: React.ElementType; chip: string }> = {
  TIMELINE: { label: 'Timeline', icon: Clock, chip: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  CHARACTER: { label: 'Character', icon: User, chip: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30' },
  CONTINUITY: { label: 'Continuity', icon: Link2, chip: 'text-purple-300 bg-purple-500/10 border-purple-500/30' },
  CROSS_REFERENCE: { label: 'Cross-Reference', icon: Puzzle, chip: 'text-pink-300 bg-pink-500/10 border-pink-500/30' },
  PLOT_HOLE: { label: 'Plot Hole', icon: Puzzle, chip: 'text-orange-300 bg-orange-500/10 border-orange-500/30' },
  LOCATION: { label: 'Location', icon: MapPin, chip: 'text-blue-300 bg-blue-500/10 border-blue-500/30' },
  POV: { label: 'POV', icon: Eye, chip: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  FACTUAL: { label: 'Factual', icon: Globe, chip: 'text-teal-300 bg-teal-500/10 border-teal-500/30' },
  DIALOGUE: { label: 'Dialogue', icon: MessageSquare, chip: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/30' },
  OTHER: { label: 'Other', icon: Info, chip: 'text-slate-300 bg-white/5 border-white/15' },
};

const CATEGORY_ORDER: EditorialCategory[] = [
  'TIMELINE', 'CHARACTER', 'CONTINUITY', 'CROSS_REFERENCE', 'PLOT_HOLE', 'LOCATION', 'POV', 'FACTUAL', 'DIALOGUE', 'OTHER',
];

const SEVERITY_ORDER = ['critical', 'warning', 'info'] as const;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface EditorialReviewPanelProps {
  books: BookData[];
  onReviewsChanged?: () => void;
}

export default function EditorialReviewPanel({ books, onReviewsChanged }: EditorialReviewPanelProps) {
  const [reviews, setReviews] = useState<EditorialReviewSummary[]>([]);
  const [activeReview, setActiveReview] = useState<EditorialReviewDetail | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  // Run dialog
  const [runOpen, setRunOpen] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Running job
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [runningReviewId, setRunningReviewId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<{ progress: number; message: string; failed: string | null }>({ progress: 0, message: 'Queued...', failed: null });

  // Filters
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [categoryFilter, setCategoryFilter] = useState<EditorialCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'fixed' | 'ignored'>('all');
  const [search, setSearch] = useState('');

  const loadReviews = useCallback(async () => {
    const data = await listEditorialReviews();
    setReviews(data);
    setListLoading(false);
    onReviewsChanged?.();
  }, [onReviewsChanged]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    const result = await getEditorialReview(id);
    if (result.success && result.data) {
      setActiveReview(result.data);
    }
    setDetailLoading(false);
  }, []);

  // Initial load: reviews list, then auto-open the most recent report.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await listEditorialReviews();
      if (cancelled) return;
      setReviews(data);
      setListLoading(false);
      const first = data[0];
      if (first && first.status === 'completed') {
        const result = await getEditorialReview(first.id);
        if (!cancelled && result.success && result.data) setActiveReview(result.data);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Poll the running job.
  useEffect(() => {
    if (!runningJobId) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      const job = await getJob(runningJobId);
      if (cancelled || !job) return;
      setJobStatus({
        progress: job.progressPercent || 0,
        message: job.progressMessage || 'Reviewing...',
        failed: job.status === 'failed' ? job.errorMessage || 'Review failed.' : null,
      });
      if (job.status === 'completed' || job.status === 'failed') {
        if (interval) clearInterval(interval);
        setRunningJobId(null);
        setJobStatus((s) => ({ ...s, failed: job.status === 'failed' ? job.errorMessage || 'Review failed.' : null }));
        if (job.status === 'completed' && runningReviewId) {
          toast({ title: 'Editorial review complete', description: 'The full report is ready to review.' });
          await loadReviews();
          await loadDetail(runningReviewId);
        } else if (job.status === 'failed') {
          await loadReviews();
        }
        setRunningReviewId(null);
      }
    };

    poll();
    interval = setInterval(poll, 2500);
    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [runningJobId, runningReviewId, loadReviews, loadDetail]);

  const toggleBook = (id: string) => {
    setSelectedBookIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  };

  const handleSubmit = async () => {
    if (selectedBookIds.length === 0 && !file) {
      toast({ title: 'Nothing selected', description: 'Choose at least one book or upload a manuscript file.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const result = await runEditorialReview({
      bookIds: selectedBookIds.length > 0 ? selectedBookIds : undefined,
      file: file ?? undefined,
      title: title.trim() || undefined,
    });
    setSubmitting(false);
    if (result.success && result.data) {
      setRunOpen(false);
      setSelectedBookIds([]);
      setFile(null);
      setTitle('');
      setRunningReviewId(result.data.reviewId);
      setRunningJobId(result.data.jobId);
      setJobStatus({ progress: 0, message: 'Queued...', failed: null });
      toast({ title: 'Review started', description: 'The AI editor is reading the manuscript now.' });
    } else {
      toast({ title: 'Could not start review', description: result.error || 'An error occurred.', variant: 'destructive' });
    }
  };

  const handleDelete = async (reviewId: string) => {
    if (!window.confirm('Delete this editorial report? This cannot be undone.')) return;
    const result = await deleteEditorialReview(reviewId);
    if (result.success) {
      toast({ title: 'Report deleted' });
      if (activeReview?.id === reviewId) setActiveReview(null);
      await loadReviews();
    } else {
      toast({ title: 'Delete failed', description: result.error || 'Unknown error', variant: 'destructive' });
    }
  };

  const handleFindingStatus = async (finding: EditorialFindingData, status: EditorialFindingStatus) => {
    if (!activeReview) return;
    const result = await updateEditorialFindingStatus(activeReview.id, finding.id, status);
    if (result.success) {
      setActiveReview((prev) =>
        prev ? { ...prev, findings: prev.findings.map((f) => (f.id === finding.id ? { ...f, status } : f)) } : prev
      );
    } else {
      toast({ title: 'Update failed', description: result.error || 'Unknown error', variant: 'destructive' });
    }
  };

  const counts = useMemo(() => {
    const findings = activeReview?.findings ?? [];
    return {
      critical: findings.filter((f) => f.severity === 'critical' && f.status === 'open').length,
      warning: findings.filter((f) => f.severity === 'warning' && f.status === 'open').length,
      info: findings.filter((f) => f.severity === 'info' && f.status === 'open').length,
      total: findings.length,
    };
  }, [activeReview]);

  const filteredFindings = useMemo(() => {
    const findings = activeReview?.findings ?? [];
    const q = search.trim().toLowerCase();
    return findings
      .filter((f) => (severityFilter === 'all' ? true : f.severity === severityFilter))
      .filter((f) => (categoryFilter === 'all' ? true : f.category === categoryFilter))
      .filter((f) => (statusFilter === 'all' ? true : f.status === statusFilter))
      .filter((f) => {
        if (!q) return true;
        return [f.title, f.description, f.quote, f.location, f.bookTitle].join(' ').toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const ia = SEVERITY_ORDER.indexOf(a.severity);
        const ib = SEVERITY_ORDER.indexOf(b.severity);
        return ia - ib;
      });
  }, [activeReview, severityFilter, categoryFilter, statusFilter, search]);

  const running = runningJobId !== null;

  return (
    <div className="rounded-2xl bg-[#0d0d10] border border-[#312839] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#312839] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-fuchsia-300" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              AI Editorial Review
              {running && <Loader2 className="h-3.5 w-3.5 text-cyan-400 animate-spin" />}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              The LLM reads the manuscript like a publishing-house editor — timeline, characters, cross-references, plot holes.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadReviews} title="Refresh reports" className="border-[#312839] text-slate-300 hover:bg-white/5">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setRunOpen(true)} className="btn-gradient" disabled={running}>
            <Sparkles className="h-4 w-4 mr-2" /> {running ? 'Reviewing...' : 'Run New Review'}
          </Button>
        </div>
      </div>

      {/* Running progress */}
      {running && (
        <div className="px-4 py-3 border-b border-[#312839] bg-cyan-500/5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-300 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 text-cyan-400 animate-spin" /> {jobStatus.message}
            </p>
            <span className="text-[10px] text-cyan-300 font-bold">{jobStatus.progress}%</span>
          </div>
          <Progress value={Math.max(jobStatus.progress, 2)} className="h-1.5" />
        </div>
      )}

      {jobStatus.failed && !running && (
        <div className="mx-4 mt-4 rounded-lg bg-red-500/10 border border-red-500/25 px-4 py-3">
          <p className="text-xs text-red-300 font-semibold">Review failed</p>
          <p className="text-[11px] text-red-300/70 mt-0.5">{jobStatus.failed}</p>
        </div>
      )}

      {/* Report switcher */}
      {reviews.length > 0 && (
        <div className="px-4 py-3 border-b border-[#312839] flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mr-1">Reports</span>
          {reviews.slice(0, 8).map((r) => (
            <div
              key={r.id}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                activeReview?.id === r.id
                  ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                  : r.status === 'completed'
                    ? 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
                    : r.status === 'failed'
                      ? 'bg-red-500/5 border-red-500/20 text-red-400'
                      : 'bg-white/5 border-white/10 text-slate-500'
              }`}
              title={r.status === 'completed' ? formatTime(r.createdAt) : r.status}
            >
              {r.status === 'completed' ? (
                <button
                  onClick={() => loadDetail(r.id)}
                  className="flex items-center gap-1.5 text-[11px] font-medium"
                  title={formatTime(r.createdAt)}
                >
                  <CheckCircle className="h-3 w-3" />
                  <span className="max-w-[140px] truncate">{r.sourceLabel}</span>
                  <span className="text-[9px] text-slate-500">{r.findingCount}</span>
                </button>
              ) : (
                <>
                  {r.status === 'failed' ? (
                    <XCircle className="h-3 w-3" />
                  ) : (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  <span className="max-w-[140px] truncate">{r.sourceLabel}</span>
                  <span className="text-[9px] text-slate-500">{r.findingCount}</span>
                </>
              )}
              <button
                onClick={() => handleDelete(r.id)}
                className="text-slate-600 hover:text-red-400 transition-colors ml-0.5"
                aria-label={`Delete report ${r.sourceLabel}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1">
        {listLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 text-cyan-400 animate-spin" />
          </div>
        ) : !activeReview && reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-500/15 to-cyan-500/15 border border-white/10 flex items-center justify-center mb-4">
              <BookOpen className="h-7 w-7 text-slate-500" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">No editorial reviews yet</h3>
            <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
              Run an AI editorial review on a single book, your whole series, or an uploaded manuscript. The editor will
              flag timeline errors, character inconsistencies, broken cross-references, plot holes, and more.
            </p>
            <Button onClick={() => setRunOpen(true)} className="btn-gradient mt-5">
              <Sparkles className="h-4 w-4 mr-2" /> Run First Review
            </Button>
          </div>
        ) : activeReview ? (
          <div>
            {/* Report header */}
            <div className="px-4 pt-4 pb-3 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white">{activeReview.sourceLabel}</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {formatTime(activeReview.createdAt)} · {activeReview.scope === 'book' ? 'Library review' : 'Manuscript review'} ·{' '}
                    ≈ {Math.round(activeReview.textLength / 5).toLocaleString()} words
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-300">
                    <AlertOctagon className="h-3 w-3" /> {counts.critical}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                    <AlertTriangle className="h-3 w-3" /> {counts.warning}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-300">
                    <Info className="h-3 w-3" /> {counts.info}
                  </span>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 min-w-[160px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search findings..."
                      className="bg-[#141419] border border-[#312839] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 w-full"
                    />
                  </div>
                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
                    className="bg-[#141419] border border-[#312839] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500/50"
                    aria-label="Filter by severity"
                  >
                    <option value="all">All severities</option>
                    <option value="critical">Critical</option>
                    <option value="warning">Warning</option>
                    <option value="info">Info</option>
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                    className="bg-[#141419] border border-[#312839] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500/50"
                    aria-label="Filter by status"
                  >
                    <option value="all">All statuses</option>
                    <option value="open">Open</option>
                    <option value="fixed">Fixed</option>
                    <option value="ignored">Ignored</option>
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <SlidersHorizontal className="h-3 w-3 text-slate-600 mr-0.5" />
                  {CATEGORY_ORDER.map((cat) => {
                    const meta = CATEGORY_META[cat];
                    const active = categoryFilter === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(active ? 'all' : cat)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider border transition-all ${
                          active ? 'bg-white/10 border-cyan-500/50 text-white' : 'border-white/10 text-slate-500 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <meta.icon className="h-3 w-3" /> {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Findings list */}
            {detailLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 text-cyan-400 animate-spin" />
              </div>
            ) : filteredFindings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center px-6">
                <CheckCircle className="h-8 w-8 text-emerald-400 mb-3" />
                <p className="text-sm font-semibold text-white">No findings match</p>
                <p className="text-xs text-slate-500 mt-1">Try widening the filters or running a fresh review.</p>
              </div>
            ) : (
              <div className="px-4 pb-4 space-y-3">
                {filteredFindings.map((finding) => {
                  const sev = SEVERITY_META[finding.severity] ?? SEVERITY_META.info;
                  const cat = CATEGORY_META[finding.category] ?? CATEGORY_META.OTHER;
                  const SevIcon = sev.icon;
                  const CatIcon = cat.icon;
                  return (
                    <div key={finding.id} className={`rounded-xl ${sev.bg} ${sev.border} border p-3 flex flex-col gap-2`}>
                      <div className="flex items-start gap-3">
                        <SevIcon className={`h-4 w-4 ${sev.text} mt-0.5 shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className={`text-[9px] font-bold uppercase tracking-wider ${sev.text}`}>{sev.label}</span>
                            <span className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${cat.chip}`}>
                              <CatIcon className="h-2.5 w-2.5" /> {cat.label}
                            </span>
                            {finding.bookTitle && (
                              <span className="text-[9px] font-medium text-slate-500 border border-white/10 rounded-full px-1.5 py-0.5">
                                {finding.bookTitle}
                              </span>
                            )}
                            {finding.location && (
                              <span className="text-[9px] font-medium text-slate-500">{finding.location}</span>
                            )}
                          </div>
                          <h4 className="text-xs font-bold text-white leading-tight">{finding.title}</h4>
                          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{finding.description}</p>
                          {finding.quote && (
                            <blockquote className="mt-2 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[11px] text-slate-300 italic leading-relaxed">
                              &ldquo;{finding.quote}&rdquo;
                            </blockquote>
                          )}
                          {finding.suggestion && (
                            <p className="text-[11px] text-emerald-300/90 mt-1.5 leading-relaxed">
                              <span className="font-bold uppercase tracking-wider text-[9px]">Fix: </span>
                              {finding.suggestion}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-7">
                        {finding.status === 'open' && (
                          <>
                            <button
                              onClick={() => handleFindingStatus(finding, 'fixed')}
                              className="flex items-center gap-1 text-[9px] font-bold uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-1 rounded hover:bg-emerald-500/25 transition-colors"
                            >
                              <CheckCircle className="h-3 w-3" /> Mark Fixed
                            </button>
                            <button
                              onClick={() => handleFindingStatus(finding, 'ignored')}
                              className="flex items-center gap-1 text-[9px] font-bold uppercase text-slate-500 px-2 py-1 rounded hover:text-white transition-colors"
                            >
                              <XCircle className="h-3 w-3" /> Ignore
                            </button>
                          </>
                        )}
                        {finding.status !== 'open' && (
                          <>
                            <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded ${finding.status === 'fixed' ? 'text-emerald-300 bg-emerald-500/10' : 'text-slate-500 bg-white/5'}`}>
                              {finding.status}
                            </span>
                            <button
                              onClick={() => handleFindingStatus(finding, 'open')}
                              className="flex items-center gap-1 text-[9px] font-bold uppercase text-slate-500 px-2 py-1 rounded hover:text-white transition-colors"
                            >
                              <RotateCcw className="h-3 w-3" /> Reopen
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Run review dialog */}
      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent className="bg-[#0d0d10] border-[#312839] text-white max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-fuchsia-400" /> Run AI Editorial Review
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              The LLM reads the manuscript like a publishing-house editor and flags timeline errors, character
              inconsistencies, cross-reference breaks, plot holes, and more.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Book selection */}
            <div>
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Review books in your library <span className="text-slate-600 normal-case font-normal">(single book or full series)</span>
              </p>
              {books.length === 0 ? (
                <p className="text-[11px] text-slate-600">No books available.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {books.map((book) => {
                    const selected = selectedBookIds.includes(book.id);
                    return (
                      <button
                        key={book.id}
                        onClick={() => toggleBook(book.id)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
                          selected
                            ? 'bg-cyan-500/10 border-cyan-500/40'
                            : 'bg-white/5 border-white/10 hover:border-cyan-500/30'
                        }`}
                      >
                        <input type="checkbox" checked={selected} readOnly className="accent-cyan-500" />
                        <BookOpen className={`h-3.5 w-3.5 ${selected ? 'text-cyan-300' : 'text-slate-500'}`} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-medium text-white truncate">{book.title}</span>
                          <span className="block text-[9px] text-slate-500">{book.chapters?.length ?? 0} chapters</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-[#312839]" />
              <span className="text-[10px] uppercase tracking-widest text-slate-600 font-bold">or</span>
              <div className="flex-1 h-px bg-[#312839]" />
            </div>

            {/* Manuscript upload */}
            <div>
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Upload a manuscript <span className="text-slate-600 normal-case font-normal">(.txt / .pdf / .docx)</span>
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.pdf,.docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg border border-dashed border-[#312839] px-4 py-6 flex flex-col items-center gap-2 text-slate-400 hover:border-fuchsia-500/40 hover:text-white transition-all"
              >
                <Upload className="h-5 w-5" />
                {file ? (
                  <span className="text-xs font-medium text-cyan-300">{file.name}</span>
                ) : (
                  <span className="text-xs">Click to choose a manuscript file</span>
                )}
              </button>
            </div>

            {/* Title */}
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">
                Report title <span className="text-slate-600 normal-case font-normal">(optional)</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. My Novel — First Pass Edit"
                className="w-full bg-[#141419] border border-[#312839] rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRunOpen(false)} className="border-[#312839] text-slate-300">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="btn-gradient">
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {submitting ? 'Starting...' : 'Run Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
