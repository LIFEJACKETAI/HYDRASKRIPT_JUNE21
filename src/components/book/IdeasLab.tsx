'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lightbulb,
  ArrowLeft,
  Sparkles,
  Copy,
  Check,
  BookOpen,
  Image as ImageIcon,
  FileText,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/lib/store';
import { getUserEmail } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type RequestType = 'titles' | 'outline' | 'cover' | 'blurb';

interface TitleItem {
  title: string;
  tagline: string;
}

interface ChapterItem {
  number: number;
  title: string;
  synopsis: string;
}

interface CoverData {
  concept: string;
  primaryImage: string;
  mood: string;
  colorPalette: string;
  typography: string;
}

interface BlurbData {
  blurb: string;
  tagline: string;
  hook: string;
}

interface TabResults {
  titles: TitleItem[] | null;
  outline: ChapterItem[] | null;
  cover: CoverData | null;
  blurb: BlurbData | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GENRES = [
  { value: 'fiction', label: 'Fiction' },
  { value: 'fantasy', label: 'Fantasy' },
  { value: 'sci-fi', label: 'Science Fiction' },
  { value: 'mystery', label: 'Mystery' },
  { value: 'romance', label: 'Romance' },
  { value: 'horror', label: 'Horror' },
  { value: 'children', label: "Children's" },
  { value: 'poetry', label: 'Poetry' },
  { value: 'non-fiction', label: 'Non-Fiction' },
  { value: 'self-help', label: 'Self-Help' },
  { value: 'biography', label: 'Biography' },
  { value: 'thriller', label: 'Thriller' },
];

const AUDIENCES = [
  { value: 'adult', label: 'Adult (General)' },
  { value: 'young-adult', label: 'Young Adult (14-18)' },
  { value: '10-14', label: 'Middle Grade (10-14)' },
  { value: '6-9', label: 'Early Reader (6-9)' },
  { value: '0-5', label: 'Picture Book (0-5)' },
];

const TABS: { id: RequestType; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'titles', label: 'Title Ideas', icon: Sparkles, description: '5 compelling title options with taglines' },
  { id: 'outline', label: 'Chapter Outline', icon: BookOpen, description: '10-chapter story outline' },
  { id: 'cover', label: 'Cover Concept', icon: ImageIcon, description: 'Visual cover design concept' },
  { id: 'blurb', label: 'Back Cover Blurb', icon: FileText, description: 'Marketing copy for the back cover' },
];

// ─── Copy Button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', description: 'Could not copy to clipboard.', variant: 'destructive' });
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      className="h-7 w-7 text-gray-500 hover:text-white hover:bg-[#1e1e1e] shrink-0"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

// ─── Title Results ────────────────────────────────────────────────────────────

function TitlesResult({ titles }: { titles: TitleItem[] }) {
  return (
    <div className="space-y-3">
      {titles.map((item, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.07 }}
          className="flex items-start gap-3 p-3 rounded-lg bg-[#1e1e1e] border border-gray-800 group hover:border-purple-500/30 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-purple-500/15 text-purple-300 border-purple-500/20 text-[10px] shrink-0">
                #{i + 1}
              </Badge>
              <span className="text-sm font-semibold text-white">{item.title}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">{item.tagline}</p>
          </div>
          <CopyButton text={`${item.title}\n${item.tagline}`} />
        </motion.div>
      ))}
    </div>
  );
}

// ─── Outline Results ──────────────────────────────────────────────────────────

function OutlineResult({ chapters }: { chapters: ChapterItem[] }) {
  return (
    <div className="space-y-2">
      {chapters.map((ch, i) => (
        <motion.div
          key={ch.number}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="flex items-start gap-3 p-3 rounded-lg bg-[#1e1e1e] border border-gray-800 hover:border-gray-700 transition-colors group"
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-[11px] font-bold text-white shrink-0 mt-0.5">
            {ch.number}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{ch.title}</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{ch.synopsis}</p>
          </div>
          <CopyButton text={`Chapter ${ch.number}: ${ch.title}\n${ch.synopsis}`} />
        </motion.div>
      ))}
    </div>
  );
}

// ─── Cover Results ────────────────────────────────────────────────────────────

function CoverResult({ cover }: { cover: CoverData }) {
  const rows: { label: string; value: string; icon: string }[] = [
    { label: 'Primary Image', value: cover.primaryImage, icon: '🖼️' },
    { label: 'Mood', value: cover.mood, icon: '🎭' },
    { label: 'Color Palette', value: cover.colorPalette, icon: '🎨' },
    { label: 'Typography', value: cover.typography, icon: '✏️' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Concept */}
      <div className="p-4 rounded-xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 border border-purple-500/20">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-[11px] font-medium text-purple-300 uppercase tracking-wider mb-1">Overall Concept</p>
            <p className="text-sm text-white leading-relaxed">{cover.concept}</p>
          </div>
          <CopyButton text={cover.concept} />
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map((row) => (
          <div key={row.label} className="p-3 rounded-lg bg-[#1e1e1e] border border-gray-800 hover:border-gray-700 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
                  <span>{row.icon}</span>
                  {row.label}
                </p>
                <p className="text-sm text-gray-300 mt-1 leading-relaxed">{row.value}</p>
              </div>
              <CopyButton text={row.value} />
            </div>
          </div>
        ))}
      </div>

      {/* Copy all button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          const full = [
            `Concept: ${cover.concept}`,
            `Primary Image: ${cover.primaryImage}`,
            `Mood: ${cover.mood}`,
            `Color Palette: ${cover.colorPalette}`,
            `Typography: ${cover.typography}`,
          ].join('\n\n');
          navigator.clipboard.writeText(full);
          toast({ title: 'Copied!', description: 'Full cover concept copied.' });
        }}
        className="text-gray-500 hover:text-white hover:bg-[#1e1e1e] text-xs"
      >
        <Copy className="h-3 w-3 mr-1.5" />
        Copy All
      </Button>
    </motion.div>
  );
}

// ─── Blurb Results ────────────────────────────────────────────────────────────

function BlurbResult({ blurb }: { blurb: BlurbData }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Hook */}
      <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-[10px] font-medium text-cyan-400 uppercase tracking-wider mb-1">Opening Hook</p>
            <p className="text-sm text-white font-medium italic leading-relaxed">"{blurb.hook}"</p>
          </div>
          <CopyButton text={blurb.hook} />
        </div>
      </div>

      {/* Tagline */}
      <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-[10px] font-medium text-purple-400 uppercase tracking-wider mb-1">Tagline</p>
            <p className="text-sm text-white font-bold leading-relaxed">{blurb.tagline}</p>
          </div>
          <CopyButton text={blurb.tagline} />
        </div>
      </div>

      {/* Full blurb */}
      <div className="p-4 rounded-lg bg-[#1e1e1e] border border-gray-800">
        <div className="flex items-start justify-between gap-2 mb-3">
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Full Back-Cover Blurb</p>
          <CopyButton text={blurb.blurb} />
        </div>
        <div className="space-y-2">
          {blurb.blurb.split('\n\n').filter(Boolean).map((para, i) => (
            <p key={i} className="text-sm text-gray-300 leading-relaxed">{para}</p>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

function TabSkeleton({ type }: { type: RequestType }) {
  if (type === 'titles') {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-3 rounded-lg bg-[#1e1e1e] border border-gray-800 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full max-w-xs" />
          </div>
        ))}
      </div>
    );
  }
  if (type === 'outline') {
    return (
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex gap-3 p-3 rounded-lg bg-[#1e1e1e] border border-gray-800">
            <Skeleton className="h-7 w-7 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (type === 'cover') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function IdeasLab() {
  const { setCurrentView } = useAppStore();

  // Form state
  const [ideaText, setIdeaText] = useState('');
  const [genre, setGenre] = useState('');
  const [targetAudience, setTargetAudience] = useState('');

  // Per-tab result state
  const [results, setResults] = useState<TabResults>({ titles: null, outline: null, cover: null, blurb: null });
  const [loading, setLoading] = useState<Record<RequestType, boolean>>({ titles: false, outline: false, cover: false, blurb: false });

  // Expanded sections
  const [expanded, setExpanded] = useState<Record<RequestType, boolean>>({ titles: true, outline: true, cover: true, blurb: true });

  const ideaTooShort = ideaText.trim().length < 20;

  const handleGenerate = useCallback(async (requestType: RequestType) => {
    if (ideaTooShort) {
      toast({ title: 'Idea too short', description: 'Please write at least 20 characters describing your book idea.', variant: 'destructive' });
      return;
    }

    setLoading((prev) => ({ ...prev, [requestType]: true }));
    // Auto-expand the section being generated
    setExpanded((prev) => ({ ...prev, [requestType]: true }));

    try {
      const res = await fetch('/api/ideas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': (await getUserEmail()) || 'demo@hydraskript.com',
        },
        body: JSON.stringify({ ideaText: ideaText.trim(), genre, targetAudience, requestType }),
      });

      const json = await res.json();

      if (!json.success) {
        toast({ title: 'Generation failed', description: json.error || 'An error occurred.', variant: 'destructive' });
        return;
      }

      if (requestType === 'titles') {
        setResults((prev) => ({ ...prev, titles: json.data?.titles ?? [] }));
      } else if (requestType === 'outline') {
        setResults((prev) => ({ ...prev, outline: json.data?.chapters ?? [] }));
      } else if (requestType === 'cover') {
        setResults((prev) => ({ ...prev, cover: json.data ?? null }));
      } else if (requestType === 'blurb') {
        setResults((prev) => ({ ...prev, blurb: json.data ?? null }));
      }

      toast({ title: 'Generated!', description: `Your ${requestType} results are ready.` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setLoading((prev) => ({ ...prev, [requestType]: false }));
    }
  }, [ideaText, genre, targetAudience, ideaTooShort]);

  const toggleExpanded = (tab: RequestType) => {
    setExpanded((prev) => ({ ...prev, [tab]: !prev[tab] }));
  };

  const hasResult = (tab: RequestType) => {
    if (tab === 'titles') return results.titles !== null && results.titles.length > 0;
    if (tab === 'outline') return results.outline !== null && results.outline.length > 0;
    if (tab === 'cover') return results.cover !== null;
    if (tab === 'blurb') return results.blurb !== null;
    return false;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
            <Lightbulb className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Ideas Lab</h1>
            <p className="text-sm text-gray-500">Turn a rough idea into a structured creative blueprint</p>
          </div>
        </div>
      </div>

      {/* Input Panel */}
      <Card className="bg-[#2a2a2a] border-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            Your Book Idea
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-gray-300 text-sm">Describe your idea *</Label>
            <Textarea
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              placeholder="e.g. A retired detective in 1920s Paris discovers that the recent string of art gallery thefts is connected to her late husband's secret past as a spy..."
              className="bg-[#1e1e1e] border-gray-700 text-white placeholder:text-gray-600 focus:border-purple-500 min-h-[120px] resize-none leading-relaxed"
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-gray-600">Minimum 20 characters for best results</p>
              <span className={`text-[11px] ${ideaTooShort ? 'text-gray-600' : 'text-green-500'}`}>
                {ideaText.trim().length} chars
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-300 text-sm">Genre</Label>
              <Select value={genre} onValueChange={setGenre}>
                <SelectTrigger className="bg-[#1e1e1e] border-gray-700 text-white w-full">
                  <SelectValue placeholder="Select genre (optional)" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-gray-700">
                  {GENRES.map((g) => (
                    <SelectItem key={g.value} value={g.value} className="text-gray-300 focus:bg-[#252525] focus:text-white">
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300 text-sm">Target Audience</Label>
              <Select value={targetAudience} onValueChange={setTargetAudience}>
                <SelectTrigger className="bg-[#1e1e1e] border-gray-700 text-white w-full">
                  <SelectValue placeholder="Select audience (optional)" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-gray-700">
                  {AUDIENCES.map((a) => (
                    <SelectItem key={a.value} value={a.value} className="text-gray-300 focus:bg-[#252525] focus:text-white">
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Generation Sections */}
      <div className="space-y-4">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isLoading = loading[tab.id];
          const hasData = hasResult(tab.id);
          const isExpanded = expanded[tab.id];

          return (
            <Card key={tab.id} className="bg-[#2a2a2a] border-gray-800 overflow-hidden">
              {/* Section Header */}
              <div className="flex items-center justify-between px-5 py-4">
                <button
                  onClick={() => toggleExpanded(tab.id)}
                  className="flex items-center gap-3 flex-1 text-left"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    hasData
                      ? 'bg-gradient-to-br from-purple-500 to-cyan-500'
                      : 'bg-[#1e1e1e] border border-gray-700'
                  }`}>
                    <Icon className={`h-4 w-4 ${hasData ? 'text-white' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{tab.label}</span>
                      {hasData && (
                        <Badge className="bg-green-500/15 text-green-400 border-green-500/20 text-[10px]">
                          Ready
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{tab.description}</p>
                  </div>
                  {hasData && (
                    <div className="ml-auto mr-2 text-gray-600">
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  )}
                </button>

                <Button
                  onClick={() => handleGenerate(tab.id)}
                  disabled={isLoading || ideaTooShort}
                  size="sm"
                  className={hasData ? 'bg-[#1e1e1e] text-gray-300 hover:bg-[#252525] border border-gray-700' : 'btn-gradient'}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Generating...
                    </>
                  ) : hasData ? (
                    <>
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      Regenerate
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      Generate
                    </>
                  )}
                </Button>
              </div>

              {/* Results area */}
              <AnimatePresence>
                {(isLoading || (hasData && isExpanded)) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <Separator className="bg-gray-800" />
                    <div className="p-5">
                      {isLoading ? (
                        <TabSkeleton type={tab.id} />
                      ) : (
                        <>
                          {tab.id === 'titles' && results.titles && (
                            <TitlesResult titles={results.titles} />
                          )}
                          {tab.id === 'outline' && results.outline && (
                            <OutlineResult chapters={results.outline} />
                          )}
                          {tab.id === 'cover' && results.cover && (
                            <CoverResult cover={results.cover} />
                          )}
                          {tab.id === 'blurb' && results.blurb && (
                            <BlurbResult blurb={results.blurb} />
                          )}
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          );
        })}
      </div>

      {/* Generate All CTA */}
      {!ideaTooShort && (
        <Card className="bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border-purple-500/20">
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-white">Generate Everything at Once</p>
              <p className="text-xs text-gray-400 mt-0.5">Run all four generators simultaneously</p>
            </div>
            <Button
              onClick={() => {
                handleGenerate('titles');
                handleGenerate('outline');
                handleGenerate('cover');
                handleGenerate('blurb');
              }}
              disabled={Object.values(loading).some(Boolean) || ideaTooShort}
              className="btn-gradient shrink-0"
            >
              {Object.values(loading).some(Boolean) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate All
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
