'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Sparkles, BookOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppStore } from '@/lib/store';
import { createBook, startGeneration, listStyleProfiles } from '@/lib/api';
import type { StyleProfileData } from '@/lib/api';
import type { TargetAudience, Genre, ColoringTheme } from '@/types';
import { CREDIT_COSTS, AUDIENCE_CONFIG, COLORING_THEMES } from '@/types';
import { toast } from '@/hooks/use-toast';
import GenerationProgress from '@/components/book/GenerationProgress';

const GENRES: { value: Genre; label: string }[] = [
  { value: 'fiction', label: 'Fiction' },
  { value: 'fantasy', label: 'Fantasy' },
  { value: 'sci-fi', label: 'Science Fiction' },
  { value: 'mystery', label: 'Mystery' },
  { value: 'romance', label: 'Romance' },
  { value: 'horror', label: 'Horror' },
  { value: 'children', label: "Children's" },
  { value: 'coloring', label: 'Coloring Book' },
  { value: 'poetry', label: 'Poetry' },
  { value: 'non-fiction', label: 'Non-Fiction' },
  { value: 'self-help', label: 'Self-Help' },
  { value: 'biography', label: 'Biography' },
];

const AUDIENCES: { value: TargetAudience; label: string; description: string; defaultChapters: number }[] = [
  { value: 'adult', label: 'Adult', description: 'Full-length books, complex themes (5 chapters, ~1500 words each)', defaultChapters: 5 },
  { value: '10-14', label: 'Ages 10-14', description: 'Middle grade, shorter chapters with illustrations (5 chapters)', defaultChapters: 5 },
  { value: '6-9', label: 'Ages 6-9', description: 'Early reader, simple language with pictures (5 chapters)', defaultChapters: 5 },
  { value: '0-5', label: 'Ages 0-5', description: 'Picture books, minimal text, large illustrations (5 chapters)', defaultChapters: 5 },
];

export default function CreateBookForm() {
  const { setCurrentView, setSelectedBookId, setIsGenerating, setActiveJobId, profile } = useAppStore();
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState<string>('');
  const [targetAudience, setTargetAudience] = useState<string>('');
  const [styleProfileId, setStyleProfileId] = useState<string>('');
  const [chapterCount, setChapterCount] = useState<number>(0);
  const [coloringTheme, setColoringTheme] = useState<string>('');
  const [styleProfiles, setStyleProfiles] = useState<StyleProfileData[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [activeGenerationJobId, setActiveGenerationJobId] = useState<string | null>(null);
  const [generationGenre, setGenerationGenre] = useState<string>('');

  // Reset coloring theme when genre changes away from coloring
  const handleGenreChange = (value: string) => {
    setGenre(value);
    if (value !== 'coloring') {
      setColoringTheme('');
    }
  };

  useEffect(() => {
    listStyleProfiles().then(setStyleProfiles);
  }, []);

  // Auto-fill chapter count based on audience
  useEffect(() => {
    const audience = AUDIENCES.find((a) => a.value === targetAudience);
    if (audience) {
      setChapterCount(audience.defaultChapters);
    }
  }, [targetAudience]);

  // Estimate credits using the same logic as the backend
  const estimateCredits = (): number => {
    if (!targetAudience || !chapterCount) return 0;
    
    // Coloring books have different credit calculation
    if (genre === 'coloring') {
      const imageCount = chapterCount + 1; // +1 for cover
      return CREDIT_COSTS.outlineGeneration + (CREDIT_COSTS.chapterPerThousandWords * chapterCount) + (CREDIT_COSTS.image * imageCount);
    }
    
    const config = AUDIENCE_CONFIG[targetAudience as TargetAudience];
    if (!config) return 0;

    // Use wordsPerChapter directly from config
    const wordsPerChapter = config.wordsPerChapter;
    const chapterCredits = Math.ceil((wordsPerChapter / 1000) * CREDIT_COSTS.chapterPerThousandWords) * chapterCount;
    const outlineCredits = CREDIT_COSTS.outlineGeneration;
    const hasIllustrations = config.illustrationStyle !== 'none';
    const imageCredits = hasIllustrations ? CREDIT_COSTS.image * (chapterCount + 1) : 0; // +1 for cover

    return chapterCredits + outlineCredits + imageCredits;
  };

  const estimatedCredits = estimateCredits();
  const hasEnoughCredits = profile ? profile.credits >= estimatedCredits : false;

  const handleGenerationComplete = () => {
    setIsGenerating(false);
    setActiveJobId(null);
    setActiveGenerationJobId(null);
    toast({ title: 'Generation complete!', description: 'Your book has been generated.' });
    // Navigate to the book detail page to see the result
    // selectedBookId is already set, so just make sure view is correct
    setCurrentView('book-detail');
  };

  const handleGenerationError = (error: string) => {
    setIsGenerating(false);
    setActiveJobId(null);
    setActiveGenerationJobId(null);
    toast({ title: 'Generation failed', description: error, variant: 'destructive' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !genre || !targetAudience) {
      toast({ title: 'Missing fields', description: 'Please fill in all required fields.', variant: 'destructive' });
      return;
    }

    if (genre === 'coloring' && !coloringTheme) {
      toast({ title: 'Theme required', description: 'Please select a coloring theme for your coloring book.', variant: 'destructive' });
      return;
    }

    setIsCreating(true);
    try {
      // Step 1: Create the book
      const result = await createBook({
        title: title.trim(),
        genre,
        targetAudience,
        coloringTheme: genre === 'coloring' && coloringTheme ? coloringTheme : undefined,
        styleProfileId: styleProfileId || undefined,
        chapterCount: chapterCount || undefined,
      });

      if (!result.success || !result.data) {
        toast({
          title: 'Failed to create book',
          description: result.error || 'An unknown error occurred.',
          variant: 'destructive',
        });
        setIsCreating(false);
        return;
      }

      const bookData = result.data as { id: string };
      toast({ title: 'Book created!', description: 'Starting generation...' });
      
      // Step 2: Automatically start generation
      setSelectedBookId(bookData.id);
      setIsGenerating(true);
      setGenerationGenre(genre);

      try {
        const genResult = await startGeneration(bookData.id);
        
        if (genResult.success && genResult.data) {
          const data = genResult.data as { jobId: string; estimatedCredits: number };
          setActiveJobId(data.jobId);
          setActiveGenerationJobId(data.jobId);
          toast({
            title: 'Generation started!',
            description: `Estimated ${data.estimatedCredits} credits`,
          });
        } else {
          setIsGenerating(false);
          toast({
            title: 'Failed to start generation',
            description: genResult.error || 'Unknown error. Try clicking Generate on the book detail page.',
            variant: 'destructive',
          });
          // Navigate to book detail so user can retry
          setCurrentView('book-detail');
        }
      } catch (genError) {
        setIsGenerating(false);
        toast({
          title: 'Generation error',
          description: 'Book was created but generation failed to start. Try clicking Generate on the book detail page.',
          variant: 'destructive',
        });
        setCurrentView('book-detail');
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to create book. Please try again.', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentView('dashboard')}
          className="text-gray-400 hover:text-white hover:bg-[#1e1e1e]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-white">Create New Book</h1>
          <p className="text-sm text-gray-500">Set up your AI-generated book</p>
        </div>
      </div>

      {/* Show generation progress if active */}
      {activeGenerationJobId ? (
        <div className="space-y-6">
          <Card className="bg-[#2a2a2a] border-purple-500/30">
            <CardContent className="p-6">
              <div className="text-center mb-4">
                <h2 className="text-lg font-bold text-white">{title.trim()}</h2>
                <p className="text-sm text-gray-400 mt-1">Your book is being generated...</p>
              </div>
              <GenerationProgress
                jobId={activeGenerationJobId}
                genre={generationGenre}
                onComplete={handleGenerationComplete}
                onError={handleGenerationError}
              />
            </CardContent>
          </Card>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <Card className="bg-[#2a2a2a] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-purple-400" />
              Book Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-gray-300">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter your book title..."
                className="bg-[#1e1e1e] border-gray-700 text-white placeholder:text-gray-600 focus:border-purple-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Genre *</Label>
              <Select value={genre} onValueChange={handleGenreChange}>
                <SelectTrigger className="bg-[#1e1e1e] border-gray-700 text-white w-full">
                  <SelectValue placeholder="Select a genre" />
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

            {/* Coloring Book Theme */}
            {genre === 'coloring' && (
              <div className="space-y-2">
                <Label className="text-gray-300">Coloring Theme *</Label>
                <Select value={coloringTheme} onValueChange={setColoringTheme}>
                  <SelectTrigger className="bg-[#1e1e1e] border-gray-700 text-white w-full">
                    <SelectValue placeholder="Choose a theme for your coloring book..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-gray-700 max-h-80">
                    {Object.entries(COLORING_THEMES).map(([key, theme]) => (
                      <SelectItem key={key} value={key} className="text-gray-300 focus:bg-[#252525] focus:text-white">
                        <span className="flex items-center gap-2">
                          <span>{theme.icon}</span>
                          <span>{theme.label}</span>
                          <span className="text-gray-500 text-xs ml-1">— {theme.description}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {coloringTheme && COLORING_THEMES[coloringTheme as ColoringTheme] && (
                  <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                    <p className="text-sm text-purple-300 font-medium">
                      {COLORING_THEMES[coloringTheme as ColoringTheme].icon} {COLORING_THEMES[coloringTheme as ColoringTheme].label}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {COLORING_THEMES[coloringTheme as ColoringTheme].description}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Target Audience */}
        <Card className="bg-[#2a2a2a] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-base">Target Audience *</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup value={targetAudience} onValueChange={setTargetAudience} className="space-y-3">
              {AUDIENCES.map((audience) => (
                <label
                  key={audience.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    targetAudience === audience.value
                      ? 'border-purple-500/50 bg-purple-500/5'
                      : 'border-gray-700 bg-[#1e1e1e] hover:border-gray-600'
                  }`}
                >
                  <RadioGroupItem value={audience.value} className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-white">{audience.label}</p>
                    <p className="text-xs text-gray-500">{audience.description}</p>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Style Profile (optional) */}
        <Card className="bg-[#2a2a2a] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-base">Style Profile (Optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={styleProfileId} onValueChange={(val) => setStyleProfileId(val === '_none' ? '' : val)}>
              <SelectTrigger className="bg-[#1e1e1e] border-gray-700 text-white w-full">
                <SelectValue placeholder="No style profile" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a1a] border-gray-700">
                <SelectItem value="_none" className="text-gray-300 focus:bg-[#252525] focus:text-white">
                  None (default style)
                </SelectItem>
                {styleProfiles.map((sp) => (
                  <SelectItem key={sp.id} value={sp.id} className="text-gray-300 focus:bg-[#252525] focus:text-white">
                    {sp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="space-y-2">
              <Label htmlFor="chapters" className="text-gray-300">Chapter Count</Label>
              <Input
                id="chapters"
                type="number"
                min={1}
                max={50}
                value={chapterCount || ''}
                onChange={(e) => setChapterCount(parseInt(e.target.value) || 0)}
                placeholder="Auto-filled based on audience"
                className="bg-[#1e1e1e] border-gray-700 text-white placeholder:text-gray-600 focus:border-purple-500"
              />
              <p className="text-[10px] text-gray-600">
                Recommended based on audience selection. You can override.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Credit estimate & Submit */}
        <Card className="bg-[#2a2a2a] border-gray-800">
          <CardContent className="pt-6 space-y-4">
            {estimatedCredits > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#1e1e1e] border border-gray-700">
                <div>
                  <p className="text-xs text-gray-400">Estimated Credits</p>
                  <p className={`text-lg font-bold ${hasEnoughCredits ? 'text-white' : 'text-red-400'}`}>
                    {estimatedCredits}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Your Balance</p>
                  <p className="text-lg font-bold text-white">{profile?.credits || 0}</p>
                </div>
              </div>
            )}

            {!hasEnoughCredits && estimatedCredits > 0 && (
              <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-3">
                <p className="text-xs text-red-300">
                  Insufficient credits. You need {estimatedCredits - (profile?.credits || 0)} more credits.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentView('credits')}
                  className="text-red-300 hover:text-red-200 mt-1 p-0 h-auto"
                >
                  Purchase credits →
                </Button>
              </div>
            )}

            {genre === 'coloring' && !coloringTheme && (
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                <p className="text-xs text-amber-300">
                  Please select a coloring theme above to continue.
                </p>
              </div>
            )}

            <Button
              type="submit"
              disabled={isCreating || !title.trim() || !genre || !targetAudience || (genre === 'coloring' && !coloringTheme)}
              className="w-full btn-gradient h-11"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating & starting generation...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Book
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </form>
      )}
    </div>
  );
}
