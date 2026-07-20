'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Headphones,
  BookOpen,
  Upload,
  Play,
  CheckCircle,
  AlertCircle,
  Loader2,
  Download,
  Music,
  ChevronRight,
  ChevronLeft,
  File,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/lib/store';
import { listBooks, getJob, getUserEmail } from '@/lib/api';
import type { BookData, JobData } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

// ─── Voice Data ───────────────────────────────────────────────────────────────

const VOICES = [
  { id: 'en-US-Neural2-C', label: 'Aurora',   gender: 'female' as const, style: 'Warm & Storytelling' },
  { id: 'en-US-Neural2-E', label: 'Sage',     gender: 'female' as const, style: 'Clear & Professional' },
  { id: 'en-US-Neural2-F', label: 'Luna',     gender: 'female' as const, style: 'Soft & Gentle' },
  { id: 'en-GB-Neural2-A', label: 'Iris',     gender: 'female' as const, style: 'British & Sophisticated' },
  { id: 'en-AU-Neural2-A', label: 'Skye',     gender: 'female' as const, style: 'Australian & Lively' },
  { id: 'en-US-Neural2-D', label: 'Atlas',    gender: 'male'   as const, style: 'Deep & Authoritative' },
  { id: 'en-US-Neural2-J', label: 'River',    gender: 'male'   as const, style: 'Casual & Warm' },
  { id: 'en-US-Neural2-A', label: 'Orion',    gender: 'male'   as const, style: 'Clear & Dynamic' },
  { id: 'en-GB-Neural2-B', label: 'Alistair', gender: 'male'   as const, style: 'British & Classic' },
  { id: 'en-AU-Neural2-B', label: 'Hunter',   gender: 'male'   as const, style: 'Australian & Bold' },
];

type Voice = typeof VOICES[number];
type StepId = 1 | 2 | 3;
type Source = 'book' | 'upload';

// ─── Contextual narration messages ───────────────────────────────────────────

const NARRATION_MESSAGES = [
  (voice: string) => `${voice} is warming up the microphone...`,
  (voice: string) => `${voice} is finding the right tone...`,
  (_: string, ch: number) => `Narrating Chapter ${ch}...`,
  (voice: string) => `${voice} is adding emotional depth...`,
  (_: string) => `Weaving the story into sound...`,
  (voice: string) => `${voice} is breathing life into the words...`,
  (_: string) => `Polishing the narration...`,
  (_: string) => `Almost there, stitching chapters together...`,
];

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: StepId; total: number }) {
  const labels = ['Choose Source', 'Select Voice', 'Generate'];
  return (
    <div className="flex items-center gap-2">
      {labels.map((label, i) => {
        const step = (i + 1) as StepId;
        const isActive = step === current;
        const isDone = step < current;
        return (
          <div key={step} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 ${isActive ? '' : isDone ? '' : 'opacity-40'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                isDone
                  ? 'bg-gradient-to-br from-purple-500 to-cyan-500 text-white'
                  : isActive
                  ? 'bg-gradient-to-br from-purple-500 to-cyan-500 text-white'
                  : 'bg-[#1e1e1e] border border-gray-700 text-gray-500'
              }`}>
                {isDone ? <CheckCircle className="h-3.5 w-3.5" /> : step}
              </div>
              <span className={`text-xs font-medium hidden sm:inline ${isActive ? 'text-white' : isDone ? 'text-gray-400' : 'text-gray-600'}`}>
                {label}
              </span>
            </div>
            {i < total - 1 && (
              <ChevronRight className="h-3.5 w-3.5 text-gray-700 hidden sm:block" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Voice Card ───────────────────────────────────────────────────────────────

function VoiceCard({ voice, selected, onSelect }: { voice: Voice; selected: boolean; onSelect: () => void }) {
  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`w-full text-left p-4 rounded-xl border transition-all ${
        selected
          ? 'border-purple-500/60 bg-purple-500/10'
          : 'border-gray-800 bg-[#1e1e1e] hover:border-gray-700 hover:bg-[#222222]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{voice.label}</span>
            <Badge
              className={`text-[10px] ${
                voice.gender === 'female'
                  ? 'bg-pink-500/15 text-pink-300 border-pink-500/20'
                  : 'bg-blue-500/15 text-blue-300 border-blue-500/20'
              }`}
            >
              {voice.gender}
            </Badge>
          </div>
          <p className="text-xs text-gray-400 mt-1">{voice.style}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative group">
            <Button
              variant="ghost"
              size="icon"
              disabled
              className="h-7 w-7 text-gray-600 cursor-not-allowed"
              onClick={(e) => e.stopPropagation()}
            >
              <Play className="h-3 w-3" />
            </Button>
            <div className="absolute -top-7 right-0 bg-[#111] border border-gray-700 text-gray-400 text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              Preview coming soon
            </div>
          </div>

          {selected && (
            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
              <CheckCircle className="h-3 w-3 text-white" />
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}

// ─── Generation Progress Display ──────────────────────────────────────────────

interface GenerationDisplayProps {
  jobId: string;
  selectedVoice: Voice;
  onComplete: (job: JobData) => void;
  onError: (message: string) => void;
}

function GenerationDisplay({ jobId, selectedVoice, onComplete, onError }: GenerationDisplayProps) {
  const [job, setJob] = useState<JobData | null>(null);
  const [messageIndex, setMessageIndex] = useState(0);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const chapterRef = useRef(1);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // Derive chapter hint from progress percent
  useEffect(() => {
    if (job && job.progressPercent > 0) {
      const ch = Math.max(1, Math.round((job.progressPercent / 90) * 10));
      chapterRef.current = ch;
    }
  }, [job?.progressPercent]);

  // Poll for job updates every 3 seconds
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const data = await getJob(jobId);
      if (!cancelled && data) {
        setJob(data);
        if (data.status === 'completed') {
          onCompleteRef.current(data);
        } else if (data.status === 'failed') {
          onErrorRef.current(data.errorMessage || 'Audiobook generation failed.');
        }
      }
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId]);

  // Rotate flavor messages while active
  useEffect(() => {
    if (job && job.status !== 'completed' && job.status !== 'failed') {
      const timer = setInterval(() => {
        setMessageIndex((prev) => (prev + 1) % NARRATION_MESSAGES.length);
      }, 3500);
      return () => clearInterval(timer);
    }
  }, [job]);

  const isComplete = job?.status === 'completed';
  const isFailed = job?.status === 'failed';
  const isActive = !isComplete && !isFailed;

  const currentChapter = job && job.progressPercent > 0
    ? Math.max(1, Math.round((job.progressPercent / 90) * 10))
    : 1;

  const currentMessage = NARRATION_MESSAGES[messageIndex](selectedVoice.label, currentChapter);

  if (!job) {
    return (
      <div className="rounded-xl bg-[#1e1e1e] border border-gray-800 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-purple-400 animate-spin" />
          <span className="text-sm text-gray-300">Connecting to narration engine...</span>
        </div>
        <Progress value={0} className="h-2" />
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-6 space-y-5 transition-colors ${
      isFailed
        ? 'bg-red-500/5 border-red-500/30'
        : isComplete
        ? 'bg-green-500/5 border-green-500/30'
        : 'bg-[#1e1e1e] border-purple-500/30'
    }`}>
      <div className="flex items-center gap-3">
        {isComplete && <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />}
        {isFailed && <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />}
        {isActive && <Loader2 className="h-5 w-5 text-purple-400 animate-spin shrink-0" />}

        <div>
          <p className="text-sm font-medium text-white">
            {isComplete && 'Audiobook Generation Complete!'}
            {isFailed && 'Generation Failed'}
            {isActive && currentMessage}
          </p>
          {job.progressMessage && (
            <p className="text-xs text-gray-500 mt-0.5">{job.progressMessage}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Progress value={job.progressPercent || 0} className="h-2 progress-gradient" />
        <div className="flex justify-between text-xs text-gray-500">
          <span>{job.progressPercent || 0}% complete</span>
          {isActive && (
            <span className="text-purple-400">{selectedVoice.label} is narrating</span>
          )}
        </div>
      </div>

      {isFailed && job.errorMessage && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
          <p className="text-xs text-red-300">{job.errorMessage}</p>
        </div>
      )}
    </div>
  );
}

// ─── Download Results ─────────────────────────────────────────────────────────

interface DownloadResultsProps {
  job: JobData;
  voiceName: string;
}

function DownloadResults({ job, voiceName }: DownloadResultsProps) {
  type ResultShape = {
    chapters?: { chapterIndex: number; title: string; publicUrl: string }[];
    fullAudiobook?: string;
    simulated?: boolean;
  };

  const result = job.result as ResultShape | null;

  if (!result) {
    return (
      <div className="text-center py-8">
        <Music className="h-10 w-10 mx-auto text-gray-600 mb-3" />
        <p className="text-sm text-gray-500">No download data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {result.simulated && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs text-amber-300">
            Running in simulation mode — no Google TTS API key detected. In production, real MP3 files would be generated.
          </p>
        </div>
      )}

      {/* Full audiobook */}
      {result.fullAudiobook && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center shrink-0">
              <Music className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Complete Audiobook</p>
              <p className="text-xs text-gray-400">M4B format — narrated by {voiceName}</p>
            </div>
          </div>
          <Button
            size="sm"
            className="btn-gradient"
            onClick={() => window.open(result.fullAudiobook, '_blank')}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download M4B
          </Button>
        </div>
      )}

      {/* Per-chapter MP3s */}
      {result.chapters && result.chapters.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider px-1">
            Individual Chapters ({result.chapters.length})
          </p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
            {result.chapters.map((ch) => (
              <div
                key={ch.chapterIndex}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[#1e1e1e] border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[#2a2a2a] border border-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-400 shrink-0">
                    {ch.chapterIndex + 1}
                  </div>
                  <span className="text-sm text-gray-300 truncate">{ch.title}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-gray-500 hover:text-white hover:bg-[#252525] shrink-0"
                  onClick={() => window.open(ch.publicUrl, '_blank')}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AudiobookGenerator() {
  const { setCurrentView } = useAppStore();

  const [step, setStep] = useState<StepId>(1);
  const [source, setSource] = useState<Source>('book');
  const [books, setBooks] = useState<BookData[]>([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [genderFilter, setGenderFilter] = useState<'all' | 'female' | 'male'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [completedJob, setCompletedJob] = useState<JobData | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load books on mount
  useEffect(() => {
    setBooksLoading(true);
    listBooks().then((data) => {
      setBooks(data.filter((b) => b.status === 'completed'));
      setBooksLoading(false);
    });
  }, []);

  const filteredVoices = genderFilter === 'all' ? VOICES : VOICES.filter((v) => v.gender === genderFilter);

  const canProceedStep1 =
    source === 'book' ? selectedBookId.length > 0 : uploadedFile !== null;

  const canProceedStep2 = selectedVoice !== null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'text/plain',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const allowedExts = ['.txt', '.pdf', '.docx'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
      toast({
        title: 'Unsupported file type',
        description: 'Please upload a .txt, .pdf, or .docx file.',
        variant: 'destructive',
      });
      return;
    }

    setUploadedFile(file);
  };

  const handleGenerate = useCallback(async () => {
    if (!selectedVoice) return;

    setIsSubmitting(true);
    try {
      const requestInit: RequestInit = { method: 'POST' };

      if (source === 'book') {
        requestInit.headers = {
          'Content-Type': 'application/json',
        };
        requestInit.body = JSON.stringify({
          voiceId: selectedVoice.id,
          source,
          bookId: selectedBookId,
        });
      } else {
        if (!uploadedFile) {
          toast({
            title: 'No manuscript selected',
            description: 'Please choose a manuscript file before generating.',
            variant: 'destructive',
          });
          return;
        }

        const formData = new FormData();
        formData.append('voiceId', selectedVoice.id);
        formData.append('source', source);
        formData.append('file', uploadedFile);
        requestInit.body = formData;
      }

      const res = await fetch('/api/audiobook', requestInit);

      const json = await res.json();

      if (!json.success) {
        toast({ title: 'Failed to start', description: json.error || 'An error occurred.', variant: 'destructive' });
        return;
      }

      setActiveJobId(json.data.jobId);
      toast({
        title: 'Audiobook generation started!',
        description: `${selectedVoice.label} will narrate ${json.data.chapters} chapters.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedVoice, source, selectedBookId, uploadedFile]);

  const handleJobComplete = useCallback((job: JobData) => {
    setCompletedJob(job);
    toast({ title: 'Audiobook complete!', description: 'Your audiobook is ready to download.' });
  }, []);

  const handleJobError = useCallback((message: string) => {
    toast({ title: 'Generation failed', description: message, variant: 'destructive' });
    setActiveJobId(null);
  }, []);

  const selectedBook = books.find((b) => b.id === selectedBookId);

  // ── Render Step 1 ────────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-5">
      {/* Source toggle */}
      <div className="flex gap-3">
        {(['book', 'upload'] as Source[]).map((s) => (
          <button
            key={s}
            onClick={() => { setSource(s); setSelectedBookId(''); setUploadedFile(null); }}
            className={`flex-1 flex items-center justify-center gap-2 p-3.5 rounded-xl border transition-all font-medium text-sm ${
              source === s
                ? 'border-purple-500/60 bg-purple-500/10 text-white'
                : 'border-gray-800 bg-[#1e1e1e] text-gray-400 hover:border-gray-700 hover:text-white'
            }`}
          >
            {s === 'book' ? <BookOpen className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            {s === 'book' ? 'From Existing Book' : 'Upload Manuscript'}
          </button>
        ))}
      </div>

      {/* Book selector */}
      <AnimatePresence mode="wait">
        {source === 'book' && (
          <motion.div
            key="book-select"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            {booksLoading ? (
              <Skeleton className="h-10 w-full rounded-lg" />
            ) : books.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#1e1e1e] border border-gray-800 text-center">
                <BookOpen className="h-8 w-8 mx-auto text-gray-600 mb-2" />
                <p className="text-sm text-gray-400">No completed books found.</p>
                <p className="text-xs text-gray-600 mt-1">Generate a book first, then come back to create an audiobook.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentView('create-book')}
                  className="text-purple-400 hover:text-purple-300 mt-2"
                >
                  Create a book <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            ) : (
              <Select value={selectedBookId} onValueChange={setSelectedBookId}>
                <SelectTrigger className="bg-[#1e1e1e] border-gray-700 text-white w-full h-11">
                  <SelectValue placeholder="Choose a completed book..." />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-gray-700">
                  {books.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="text-gray-300 focus:bg-[#252525] focus:text-white">
                      <span className="flex items-center gap-2">
                        <BookOpen className="h-3.5 w-3.5 text-purple-400" />
                        {b.title}
                        <span className="text-gray-500 text-xs">— {b.genre}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {selectedBook && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-purple-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">{selectedBook.title}</p>
                    <p className="text-xs text-gray-400">
                      {selectedBook.chapters?.length ?? 0} chapters • {selectedBook.genre} • {selectedBook.targetAudience}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {source === 'upload' && (
          <motion.div
            key="upload-area"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`w-full flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed transition-all ${
                uploadedFile
                  ? 'border-purple-500/40 bg-purple-500/5'
                  : 'border-gray-700 bg-[#1e1e1e] hover:border-gray-600 hover:bg-[#222222]'
              }`}
            >
              {uploadedFile ? (
                <>
                  <File className="h-8 w-8 text-purple-400" />
                  <p className="text-sm font-medium text-white">{uploadedFile.name}</p>
                  <p className="text-xs text-gray-500">
                    {(uploadedFile.size / 1024).toFixed(1)} KB
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-gray-600" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-300">Click to upload manuscript</p>
                    <p className="text-xs text-gray-600 mt-1">Supports .txt, .pdf, .docx</p>
                  </div>
                </>
              )}
            </button>

            {uploadedFile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUploadedFile(null)}
                className="text-gray-500 hover:text-white hover:bg-[#1e1e1e] w-full"
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Remove file
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // ── Render Step 2 ────────────────────────────────────────────────────────────

  const renderStep2 = () => (
    <div className="space-y-4">
      {/* Gender filter */}
      <div className="flex gap-2">
        {(['all', 'female', 'male'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setGenderFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              genderFilter === f
                ? 'border-purple-500/50 bg-purple-500/10 text-purple-300'
                : 'border-gray-800 bg-[#1e1e1e] text-gray-500 hover:text-white hover:border-gray-700'
            }`}
          >
            {f === 'all' ? 'All Voices' : f === 'female' ? 'Female' : 'Male'}
          </button>
        ))}
      </div>

      {/* Voice grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filteredVoices.map((voice) => (
          <VoiceCard
            key={voice.id}
            voice={voice}
            selected={selectedVoice?.id === voice.id}
            onSelect={() => setSelectedVoice(voice)}
          />
        ))}
      </div>

      {selectedVoice && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20"
        >
          <p className="text-sm text-cyan-300">
            <span className="font-semibold">{selectedVoice.label}</span> selected — {selectedVoice.style}
          </p>
        </motion.div>
      )}
    </div>
  );

  // ── Render Step 3 ────────────────────────────────────────────────────────────

  const renderStep3 = () => (
    <div className="space-y-5">
      {/* Summary */}
      {!activeJobId && !completedJob && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <div className="p-4 rounded-xl bg-[#1e1e1e] border border-gray-800 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center shrink-0">
                {source === 'book' ? <BookOpen className="h-4 w-4 text-white" /> : <File className="h-4 w-4 text-white" />}
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Source</p>
                <p className="text-sm font-medium text-white">
                  {source === 'book'
                    ? selectedBook?.title ?? 'Selected Book'
                    : uploadedFile?.name ?? 'Uploaded Manuscript'}
                </p>
              </div>
            </div>

            <Separator className="bg-gray-800" />

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#2a2a2a] border border-gray-700 flex items-center justify-center shrink-0">
                <Headphones className="h-4 w-4 text-purple-400" />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Narrator</p>
                <p className="text-sm font-medium text-white">
                  {selectedVoice?.label} — {selectedVoice?.style}
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isSubmitting}
            className="w-full btn-gradient h-12 text-base"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting narration...
              </>
            ) : (
              <>
                <Headphones className="h-4 w-4 mr-2" />
                Generate Audiobook
              </>
            )}
          </Button>
        </motion.div>
      )}

      {/* Progress */}
      {activeJobId && !completedJob && selectedVoice && (
        <GenerationDisplay
          jobId={activeJobId}
          selectedVoice={selectedVoice}
          onComplete={handleJobComplete}
          onError={handleJobError}
        />
      )}

      {/* Results */}
      {completedJob && selectedVoice && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-400" />
            <p className="text-sm font-semibold text-white">Audiobook Ready!</p>
          </div>
          <DownloadResults job={completedJob} voiceName={selectedVoice.label} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setActiveJobId(null);
              setCompletedJob(null);
              setStep(1);
              setSelectedBookId('');
              setUploadedFile(null);
              setSelectedVoice(null);
            }}
            className="text-gray-500 hover:text-white hover:bg-[#1e1e1e] w-full"
          >
            Create Another Audiobook
          </Button>
        </motion.div>
      )}
    </div>
  );

  // ── Layout ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentView('dashboard')}
          className="text-gray-400 hover:text-white hover:bg-[#1e1e1e]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
            <Headphones className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Audiobook Generator</h1>
            <p className="text-sm text-gray-500">Transform your book into a professional narrated audiobook</p>
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      <StepIndicator current={step} total={3} />

      {/* Step Card */}
      <Card className="bg-[#2a2a2a] border-gray-800">
        <CardHeader className="pb-4">
          <CardTitle className="text-white text-base">
            {step === 1 && 'Step 1: Choose Your Source'}
            {step === 2 && 'Step 2: Select a Voice'}
            {step === 3 && 'Step 3: Generate Audiobook'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.2 }}
            >
              {step === 1 && renderStep1()}
              {step === 2 && renderStep2()}
              {step === 3 && renderStep3()}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Navigation */}
      {!activeJobId && !completedJob && (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => setStep((prev) => Math.max(1, prev - 1) as StepId)}
            disabled={step === 1}
            className="text-gray-400 hover:text-white hover:bg-[#1e1e1e]"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>

          {step < 3 && (
            <Button
              onClick={() => setStep((prev) => Math.min(3, prev + 1) as StepId)}
              disabled={step === 1 ? !canProceedStep1 : step === 2 ? !canProceedStep2 : false}
              className="btn-gradient"
            >
              Continue
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
