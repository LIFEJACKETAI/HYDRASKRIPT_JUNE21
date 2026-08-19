'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Palette,
  Sparkles,
  Download,
  Zap,
  ChevronRight,
  Loader2,
  ChevronDown,
  Image as ImageIcon,
  Settings,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { useAppStore } from '@/lib/store';

// Style presets from the HTML
const STYLE_PRESETS = [
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    icon: Zap,
    gradient: 'from-purple-600 to-cyan-600',
    bgImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBKjD45C2o1ZTGaNA2ur0UWqulgRa6iIoi2TMVM4RyK5W3UH2_pDosR2z90OmdMhfz9FPRhY21I6jgbHBL4GqmGXAEanBhuK_3MW2CFbpWXCJdKmOiaTrxVXuQnSBfrV8YIuQseYrMpX3HSV1DjxSfdhgAuQpEWwHV4bRfFlAQOZEufLEp1Qg2YnbiSaiJRVPcB0E9HjmJ_rEw9fJ9S80G1vfho3VbgaPPaBNwsxBOkT7kKRLlbW24V7aw1SRcszhDgn9QByg5aAVGg',
  },
  {
    id: 'noir',
    label: 'Noir',
    icon: ImageIcon,
    gradient: 'from-slate-800 to-black',
    bgImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCnnOmlMmVEm7-WRLkDWrPjEWgREBTnOEGNw1AEUVGE0KqEfnWfsWj6DzRbzYkPQmPYuPAx8vWEuYrr9vyeuRWh4K4J4VMbuojtc1Q0MooSSn308F2mONCa5K1ON5xwojya4DAXdJFwKqHlbYwSyax5AwMaegJml40UknHwE2RJcKlN_IipfzMrHqIpF8ImbrpdBN_k9gWYQ8SgYWUUP8scTlsAjLmvJvTTAioe31CXAAQtJG9YsITBaPvN5S7VPCcm9Ce_HQ9pOqwH',
  },
  {
    id: 'watercolor',
    label: 'Watercolor',
    icon: Sparkles,
    gradient: 'from-pink-400 to-blue-400',
    bgImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD7zQx7sOXARo2Fxl6kMw-e27un57rswid8QPrvoDcxiEtaAc5sh1PzARvbo-q5MNBrrFMMv_UER3kVV-AkTRKN87VnYWQRcMd7nby1M6ZG-9Pi04-fjNhXHLvDFxxOvfGvtdnci2tp7xi-Z1ju5XQuNjlKiFrvZCeusSH7cXExY39Q2qZrUOXmGquGLY7Gn45iVdIJXRtmJAgVDd_EnKb_Db6__U6XhR2LXoy0khfcmdrjCxB8W9FPLuGkiN6xByZv-3QRyMLqFnEu',
  },
  {
    id: 'minimalist',
    label: 'Minimalist',
    icon: Settings,
    gradient: 'from-gray-400 to-gray-800',
    bgImage: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDHgH4fJSIULwz3PlJFqekCZI_YAtII75qyznMcAeY213zYABWZgmQ8v9WQCHMTT4rGBsXh3-7Up8UJH8TDLCLhsVw6PWd8yvg2c7OeuuxuaHjs6En2hWiCE3NEHHSWQC9IZJEJTIzZeH6mNVUeVQ6Tl1EwivNzgmtxuw6JlslPgd9fsv9dku1qb0leFVijcrbOHWsIUDDc63NnJB0Yx0OVwCO2-4pUFlJnhNloo4Om8Jpxule0kwCD41B0DrvbrzU3UdUN9-huWX19',
  },
];

const ASPECT_RATIOS = [
  { value: '6x9', label: '6 x 9 (Hardcover)' },
  { value: '5x8', label: '5 x 8 (Paperback)' },
  { value: '1x1', label: '1 x 1 (Digital)' },
];

export default function AICoverDesigner() {
  const { setCurrentView } = useAppStore();
  const [selectedPreset, setSelectedPreset] = useState<string>('cyberpunk');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('6x9');
  const [bookTitle, setBookTitle] = useState('');
  const [genre, setGenre] = useState('fiction');
  const [targetAudience, setTargetAudience] = useState<'adult' | '0-5' | '6-9' | '10-14'>('adult');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState('Describe the atmosphere, characters, and key elements... e.g., A lone detective standing in the neon rain of a futuristic Tokyo alleyway, cinematic lighting, hyper-realistic.');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle prompt change with character count
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setPrompt(value);
    if (value.trim() === '') {
      setPreviewText(value);
    }
  };

  const handleBlur = () => {
    if (prompt.trim() === '') {
      setPreviewText('Describe the atmosphere, characters, and key elements... e.g., A lone detective standing in the neon rain of a futuristic Tokyo alleyway, cinematic lighting, hyper-realistic.');
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({ title: 'Prompt required', description: 'Please enter a description for your cover.', variant: 'destructive' });
      return;
    }
    if (!bookTitle.trim()) {
      toast({ title: 'Book title required', description: 'Please enter a book title.', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);
    setProgress(0);

    // Real progress simulation with smoother increments
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + Math.random() * 8;
      });
    }, 400);

    try {
      const response = await fetch('/api/cover/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookTitle,
          genre,
          targetAudience,
          style: selectedPreset,
          prompt: prompt.trim(),
          aspectRatio,
          coloringTheme: genre === 'coloring' ? selectedPreset : undefined,
        }),
      });

      const data = await response.json();

      clearInterval(progressInterval);

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate cover');
      }

      setProgress(100);
      setGeneratedImage(data.data.imageUrl);
      
      toast({ title: 'Cover generated!', description: 'Your AI book cover is ready.' });
    } catch (error) {
      clearInterval(progressInterval);
      const message = error instanceof Error ? error.message : 'Generation failed';
      toast({ title: 'Generation failed', description: message, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const handleApply = () => {
    if (!generatedImage) {
      toast({ title: 'No cover to apply', variant: 'destructive' });
      return;
    }
    toast({ title: 'Applied to project', description: 'Cover has been added to your book project.' });
    // In production, this would save the cover to the selected book
  };

  const handleRandomize = () => {
    const randomPrompts = [
      'A lone detective standing in the neon rain of a futuristic Tokyo alleyway, cinematic lighting, hyper-realistic.',
      'An ancient castle shrouded in mist, moonlight breaking through clouds, gothic atmosphere.',
      'A cybernetic samurai in a post-apocalyptic wasteland, neon armor, dramatic shadows.',
      'A magical library with floating books and glowing orbs, ethereal light, fantasy realism.',
      'A vintage travel poster for Mars colony, retro-futuristic style, bold colors.',
      'A mysterious portal opening in a dense forest, bioluminescent plants, magical realism.',
    ];
    const randomPrompt = randomPrompts[Math.floor(Math.random() * randomPrompts.length)];
    setPrompt(randomPrompt);
    setPreviewText(randomPrompt);
  };

  const getAspectRatioClass = (ratio: string) => {
    switch (ratio) {
      case '6x9': return 'aspect-[2/3]';
      case '5x8': return 'aspect-[5/8]';
      case '1x1': return 'aspect-square';
      default: return 'aspect-[2/3]';
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-4 bg-black/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-4">
          <div className="size-8 text-[#13c8ec]">
            <svg fill="currentColor" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.8261 30.5736C16.7203 29.8826 20.2244 29.4783 24 29.4783C27.7756 29.4783 31.2797 29.8826 34.1739 30.5736C36.9144 31.2278 39.9967 32.7669 41.3563 33.8352L24.8486 7.36089C24.4571 6.73303 23.5429 6.73303 23.1514 7.36089L6.64374 33.8352C8.00331 32.7669 11.0856 31.2278 13.8261 30.5736Z" />
              <path d="M39.998 35.764C39.9944 35.7463 39.9875 35.7155 39.9748 35.6706C39.9436 35.5601 39.8949 35.4259 39.8346 35.2825C39.8168 35.2403 39.7989 35.1993 39.7813 35.1602C38.5103 34.2887 35.9788 33.0607 33.7095 32.5189C30.9875 31.8691 27.6413 31.4783 24 31.4783C20.3587 31.4783 17.0125 31.8691 14.2905 32.5189C12.0012 33.0654 9.44505 34.3104 8.18538 35.1832C8.17384 35.2075 8.16216 35.233 8.15052 35.2592C8.09919 35.3751 8.05721 35.4886 8.02977 35.589C8.00356 35.6848 8.00039 35.7333 8.00004 35.7388C8.00004 35.739 8 35.7393 8.00004 35.7388C8.00004 35.7641 8.0104 36.0767 8.68485 36.6314C9.34546 37.1746 10.4222 37.7531 11.9291 38.2772C14.9242 39.319 19.1919 40 24 40C28.8081 40 33.0758 39.319 36.0709 38.2772C37.5778 37.7531 38.6545 37.1746 39.3151 36.6314C39.9006 36.1499 39.9857 35.8511 39.998 35.764ZM4.95178 32.7688L21.4543 6.30267C22.6288 4.4191 25.3712 4.41909 26.5457 6.30267L43.0534 32.777C43.0709 32.8052 43.0878 32.8338 43.104 32.8629L41.3563 33.8352C43.104 32.8629 43.1038 32.8626 43.104 32.8629L43.1051 32.865L43.1065 32.8675L43.1101 32.8739L43.1199 32.8918C43.1276 32.906 43.1377 32.9246 43.1497 32.9473C43.1738 32.9925 43.2062 33.0545 43.244 33.1299C43.319 33.2792 43.4196 33.489 43.5217 33.7317C43.6901 34.1321 44 34.9311 44 35.7391C44 37.4427 43.003 38.7775 41.8558 39.7209C40.6947 40.6757 39.1354 41.4464 37.385 42.0552C33.8654 43.2794 29.133 44 24 44C18.867 44 14.1346 43.2794 10.615 42.0552C8.86463 41.4464 7.30529 40.6757 6.14419 39.7209C4.99695 38.7775 3.99999 37.4427 3.99999 35.7391C3.99999 34.8725 4.29264 34.0922 4.49321 33.6393C4.60375 33.3898 4.71348 33.1804 4.79687 33.0311C4.83898 32.9556 4.87547 32.8935 4.9035 32.8471C4.91754 32.8238 4.92954 32.8043 4.93916 32.7889L4.94662 32.777L4.95178 32.7688ZM35.9868 29.004L24 9.77997L12.0131 29.004C12.4661 28.8609 12.9179 28.7342 13.3617 28.6282C16.4281 27.8961 20.0901 27.4783 24 27.4783C27.9099 27.4783 31.5719 27.8961 34.6383 28.6282C35.082 28.7342 35.5339 28.8609 35.9868 29.004Z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold tracking-tight">HydraSkript</h2>
        </div>
        <nav className="flex items-center gap-8">
          <Button variant="ghost" size="sm" onClick={() => setCurrentView('dashboard')}>Dashboard</Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentView('style-training')}>Style Training</Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentView('create-book')}>Create Book</Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentView('credits')}>Credits</Button>
        </nav>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="text-white/50 hover:text-white">
            <span className="material-symbols-outlined text-[20px]">notifications</span>
          </Button>
          <div className="size-10 rounded-full border border-[#13c8ec]/30 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDNo6YHfH9QQ7O1Ip7cVxp6G2T-YMd8H1BblIIj-ysbVfSdPfIdXTQ8gOWp8QvaC30V4MIzmaTu0_UEMk9ielXuIoifocPdhTgvw2f9TGUK8uauNUcQxf0oNgF1IhUWxpK9rFl27Oym9gRhoNtA5i4POkN5O7V1mzwG67lX1gEHL-AB-KTYHLfZVegdHu3XRo3JIWo3l3HCnAlzLem54i9WLrZHhh9mzWcK2cMShNC62L0OC-Drv_uCRSwN1PCvuCM2MjexLBgeWepZ")' }} />
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden min-w-0">
        {/* Sidebar */}
        <aside className="w-64 border-r border-white/10 p-6 flex flex-col justify-between hidden lg:flex bg-black overflow-hidden">
          <div className="flex flex-col gap-8">
            <div className="flex items-center gap-3 p-2">
              <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-lg size-12" style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAyndQVV_CjBbPSDd8wcmk4aQA-eL1brBqhf0l82Zk6Oq1blUjsqUWAu33nLJud-WZF4CyBiVfJE6fYQ73OCAQLo-OfltKrHPX4eQVgv49l71f2mmVoZYPda6kok7IbNSz-PZ2fhiBF5zhoPg-J-ysceoynNmv7Wi698QpHBXrdI8wc1tWTrjQKMfK-Kdiq22RWHYHqt_OmoLB1c7JIj5JcFVM4haVpvTis9dp7eIcJlD_ta-G0jX112wqliA3Z180mnwjm3j3CDoXX")' }} />
              <div className="flex flex-col overflow-hidden">
                <h1 className="text-base font-semibold truncate">Neon Shadows</h1>
                <p className="text-[#13c8ec] text-xs font-medium uppercase tracking-wider">Draft v2.0</p>
              </div>
            </div>
            <div className="flex flex-col gap-1">
<Button variant="ghost" size="sm" className="w-full justify-start gap-3 text-slate-400 hover:text-white transition-colors" onClick={() => setCurrentView('dashboard')}>
  <span className="material-symbols-outlined text-[20px]">auto_stories</span>
  <span className="text-sm font-medium">Book Info</span>
</Button>
<Button variant="ghost" size="sm" className="w-full justify-start gap-3 text-slate-400 hover:text-white transition-colors" onClick={() => setCurrentView('create-book')}>
  <span className="material-symbols-outlined text-[20px]">format_list_bulleted</span>
  <span className="text-sm font-medium">Chapters</span>
</Button>
<Button variant="default" size="sm" className="w-full justify-start gap-3 bg-[#13c8ec]/10 text-[#13c8ec] border border-[#13c8ec]/20">
  <Palette className="h-4 w-4 fill-current" />
  <span className="text-sm font-medium">AI Cover</span>
</Button>
<Button variant="ghost" size="sm" className="w-full justify-start gap-3 text-slate-400 hover:text-white transition-colors" onClick={() => setCurrentView('export-hub')}>
  <span className="material-symbols-outlined text-[20px]">format_shapes</span>
  <span className="text-sm font-medium">Formatting</span>
</Button>
            </div>
          </div>
          <div className="bg-[#161b1d] rounded-xl p-4 border border-white/5">
            <p className="text-xs text-slate-400 mb-2">AI Credits</p>
            <div className="w-full bg-white/10 h-1.5 rounded-full mb-3">
              <div className="bg-[#13c8ec] h-full rounded-full w-3/4 shadow-[0_0_8px_rgba(19,200,236,0.6)]" />
            </div>
            <Button className="w-full py-2 bg-white/5 text-xs font-bold rounded-lg hover:bg-white/10 transition-all" onClick={() => setCurrentView('credits')}>
              UPGRADE PLAN
            </Button>
          </div>
        </aside>

        {/* Main Workspace - Column on mobile, Row on desktop */}
        <section className="flex-1 flex flex-col lg:flex-row overflow-hidden min-w-0">
          {/* Left Panel: Input & Styles - Full width on mobile, 40% on desktop (with sidebar) */}
          <div className="w-full lg:w-[40%] flex flex-col p-8 overflow-y-auto border-r lg:border-white/10 lg:border-b-0 min-w-0">
            <div className="mb-8">
              <h2 className="text-3xl font-black tracking-tight mb-2">AI Cover Designer</h2>
              <p className="text-slate-400 text-sm">Craft high-fidelity book covers using generative art presets.</p>
            </div>

            {/* Style Presets */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#13c8ec]">Style Presets</h3>
                <span className="text-xs text-slate-500">4 Styles Available</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {STYLE_PRESETS.map((preset) => (
                  <motion.button
                    key={preset.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedPreset(preset.id)}
                    className={`relative group aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                      selectedPreset === preset.id
                        ? 'border-[#13c8ec] shadow-[0_0_15px_rgba(19,200,236,0.3)]'
                        : 'border-white/10 hover:border-[#13c8ec]/50'
                    }`}
                  >
                    <div className="absolute inset-0 bg-cover bg-center" style={{
                      backgroundImage: `linear-gradient(0deg, rgba(0, 0, 0, 0.8) 0%, transparent 100%), url("${preset.bgImage}")`
                    }} />
                    <div className="absolute bottom-3 left-3 text-left">
                      <p className="text-sm font-bold">{preset.label}</p>
                    </div>
                    {selectedPreset === preset.id && (
                      <div className="absolute top-2 right-2 bg-[#13c8ec] rounded-full p-1">
                        <span className="material-symbols-outlined text-[14px] text-[#0a0a0a] font-bold">check</span>
                      </div>
                    )}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Book Details */}
            <div className="mb-8">
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#13c8ec] mb-4">Book Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Book Title</label>
                  <input
                    type="text"
                    value={bookTitle}
                    onChange={(e) => setBookTitle(e.target.value)}
                    placeholder="Enter your book title"
                    className="w-full bg-[#161b1d] border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-[#13c8ec] focus:ring-1 focus:ring-[#13c8ec] transition-all placeholder:text-slate-600"
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Genre</label>
                  <Select value={genre} onValueChange={(v) => setGenre(v)}>
                    <SelectTrigger className="bg-[#161b1d] border-white/10 text-sm focus:border-[#13c8ec] focus:ring-1 focus:ring-[#13c8ec]">
                      <SelectValue placeholder="Select genre" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0a0a0a] border-white/10">
                      {['fiction', 'non-fiction', 'fantasy', 'sci-fi', 'mystery', 'romance', 'horror', 'children', 'coloring', 'poetry', 'self-help', 'biography'].map((g) => (
                        <SelectItem key={g} value={g} className="text-slate-400 focus:bg-[#161b1d] focus:text-white">{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Target Audience</label>
                <Select value={targetAudience} onValueChange={(v) => setTargetAudience(v as 'adult' | '0-5' | '6-9' | '10-14')}>
                  <SelectTrigger className="bg-[#161b1d] border-white/10 text-sm focus:border-[#13c8ec] focus:ring-1 focus:ring-[#13c8ec]">
                    <SelectValue placeholder="Select audience" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a0a0a] border-white/10">
                    <SelectItem value="adult" className="text-slate-400 focus:bg-[#161b1d] focus:text-white">Adult</SelectItem>
                    <SelectItem value="10-14" className="text-slate-400 focus:bg-[#161b1d] focus:text-white">Ages 10-14</SelectItem>
                    <SelectItem value="6-9" className="text-slate-400 focus:bg-[#161b1d] focus:text-white">Ages 6-9</SelectItem>
                    <SelectItem value="0-5" className="text-slate-400 focus:bg-[#161b1d] focus:text-white">Ages 0-5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Prompt Input */}
            <div className="mb-8 flex-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#13c8ec]">Detailed Prompt</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                  onClick={handleRandomize}
                >
                  <RefreshCw className="h-[16px]" />
                  Randomize
                </Button>
              </div>
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={handlePromptChange}
                  onBlur={handleBlur}
                  placeholder="Describe the atmosphere, characters, and key elements... e.g., A lone detective standing in the neon rain of a futuristic Tokyo alleyway, cinematic lighting, hyper-realistic."
                  className="w-full h-40 bg-[#161b1d] border border-white/10 rounded-xl p-4 text-sm focus:border-[#13c8ec] focus:ring-1 focus:ring-[#13c8ec] transition-all resize-none placeholder:text-slate-600"
                  maxLength={500}
                />
                <div className="absolute bottom-3 right-3 text-[10px] text-slate-500 font-medium">
                  {prompt.length} / 500 characters
                </div>
              </div>
              <div className="mt-6 flex flex-col gap-4">
                <div className="flex items-center justify-between p-4 bg-[#161b1d]/50 border border-white/5 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[#13c8ec]">aspect_ratio</span>
                    <span className="text-sm font-medium">Aspect Ratio</span>
                  </div>
                  <Select value={aspectRatio} onValueChange={setAspectRatio}>
                    <SelectTrigger className="bg-transparent border-none text-xs text-[#13c8ec] font-bold focus:ring-0 cursor-pointer">
                      <SelectValue placeholder="Select ratio" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0a0a0a] border-white/10">
                      {ASPECT_RATIOS.map((ratio) => (
                        <SelectItem key={ratio.value} value={ratio.value} className="text-slate-400 focus:bg-[#161b1d] focus:text-white">
                          {ratio.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: Live Preview */}
          <div className="flex-1 bg-[#161b1d]/30 flex flex-col relative min-w-0">
            {/* Top Tools Overlay - Fixed at top */}
            <div className="flex justify-between items-center p-4 border-b border-white/5 bg-black/20 backdrop-blur-sm z-10">
              <div className="bg-black/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-xs font-medium flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#13c8ec] animate-pulse" />
                LIVE PREVIEW
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="bg-black/80 backdrop-blur-md p-2 rounded-lg border border-white/10 hover:text-[#13c8ec] transition-all">
                  <span className="material-symbols-outlined text-[20px]">zoom_in</span>
                </Button>
                <Button variant="ghost" size="icon" className="bg-black/80 backdrop-blur-md p-2 rounded-lg border border-white/10 hover:text-[#13c8ec] transition-all">
                  <Download className="h-[20px] w-[20px]" />
                </Button>
              </div>
            </div>

            {/* Book Preview Canvas - Flexible center area */}
            <div className="flex-1 flex items-center justify-center p-6 min-h-0 relative">
              {/* Book Preview Canvas */}
              <div className={`relative w-full max-w-[400px] ${getAspectRatioClass(aspectRatio)} group`}>
                {/* Progress Bar Overlay - Inside the canvas area */}
                <AnimatePresence mode="wait">
                  {(isGenerating || progress > 0) && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-4 left-4 right-4 z-10"
                    >
                      <div className="flex justify-between text-[10px] text-[#13c8ec] font-bold mb-1 tracking-widest">
                        <span>GENERATING TEXTURES...</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                        <motion.div
                          className="bg-[#13c8ec] h-full shadow-[0_0_10px_#13c8ec]"
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* The Cover Image */}
                <div className="w-full h-full rounded-lg shadow-2xl shadow-cyan-900/20 bg-cover bg-center border border-white/10 relative overflow-hidden" style={{
                  backgroundImage: generatedImage
                    ? `url("${generatedImage}")`
                    : 'none'
                }}>
                  {/* Overlay for "Empty" or "Processing" State */}
                  {!generatedImage && !isGenerating && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-8"
                    >
                      <Palette className="text-4xl text-[#13c8ec] mb-4" />
                      <h4 className="text-xl font-bold">Regenerate Frame</h4>
                      <p className="text-sm text-slate-300">Click the generate button to update this view with your current settings.</p>
                    </motion.div>
                  )}
                  {isGenerating && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-8"
                    >
                      <Loader2 className="h-8 w-8 text-[#13c8ec] animate-spin mb-4" />
                      <h4 className="text-xl font-bold">Generating Cover...</h4>
                      <p className="text-sm text-slate-300">AI is crafting your cover...</p>
                    </motion.div>
                  )}
                </div>

                {/* Spine & Back Shadow Visualizer */}
                <div className="absolute top-0 -right-4 bottom-0 w-4 bg-gradient-to-l from-transparent to-black/30 rounded-r-lg" />
              </div>
            </div>

            {/* Footer Action Bar - Fixed at bottom */}
            <div className="p-4 border-t border-white/5 bg-black/20 backdrop-blur-sm z-10">
              <div className="flex items-center gap-4 max-w-[400px] mx-auto">
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !prompt.trim()}
                  className="flex-1 py-4 bg-gradient-to-r from-purple-600 to-cyan-600 rounded-xl font-bold text-white uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(19,200,236,0.5)]"
                >
                  <Palette className="h-5 w-5" />
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-5" />
                      Generate Cover
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={!generatedImage}
                  className="px-8 py-4 bg-white/5 border border-white/10 rounded-xl font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-all uppercase tracking-widest whitespace-nowrap"
                >
                  Apply to Project
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}