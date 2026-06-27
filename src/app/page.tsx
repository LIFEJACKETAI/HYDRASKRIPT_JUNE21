'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Sparkles,
  PenTool,
  Image as ImageIcon,
  Share2,
  ArrowRight,
  Zap,
  Clock,
  Coins,
  Shield,
  Activity,
  Users as UsersIcon,
  AlertCircle,
  Loader2,
  CheckCircle,
  XCircle,
  TrendingUp,
  Download,
  Headphones,
  Plus,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAppStore } from '@/lib/store';
import {
  getProfile,
  listBooks,
  deleteBook,
  getCredits,
  purchaseCredits,
  getAdminData,
  exportBook,
  getUserEmail,
} from '@/lib/api';
import type { BookData, CreditsData, AdminData } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import Footer from '@/components/layout/Footer';
import BookCard from '@/components/book/BookCard';
import CreateBookForm from '@/components/book/CreateBookForm';
import BookDetail from '@/components/book/BookDetail';
import StyleUploader from '@/components/book/StyleUploader';
import IdeasLab from '@/components/book/IdeasLab';
import AudiobookGenerator from '@/components/book/AudiobookGenerator';

// ─── Landing Page ────────────────────────────────────────────────────────────

// ... (previous imports)
import AuthForm from '@/components/auth/AuthForm';
// ... (other imports)

function LandingPage() {
  const { setCurrentView, setProfile } = useAppStore();
  const [showAuth, setShowAuth] = useState(false);
  const [email, setEmail] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const profile = await getProfile();
      if (profile) {
        setProfile(profile);
        setCurrentView('dashboard');
      }
    }
    checkAuth();
  }, [setCurrentView, setProfile]);

  const handleGetStarted = async () => {
    if (!email.trim()) {
      toast({ title: 'Email required', description: 'Please enter your email.', variant: 'destructive' });
      return;
    }
    setShowAuth(true);
  };

    const features = [
    { icon: PenTool,   title: 'Write Full Books',      desc: 'Generate complete books with chapters, characters, and cohesive narratives from a single prompt.', gradient: 'from-purple-500 to-violet-600' },
    { icon: ImageIcon, title: 'Generate Illustrations', desc: 'AI-powered illustrations for every chapter — Pixar-style, watercolor, line art and more.',           gradient: 'from-cyan-500 to-blue-600' },
    { icon: Sparkles,  title: 'Style Training',         desc: 'Train custom writing styles using your own exemplar texts for truly personalized output.',           gradient: 'from-pink-500 to-rose-600' },
    { icon: Share2,    title: 'Export & Share',         desc: 'Export to PDF with one click. Print-ready formatting for professional results.',                    gradient: 'from-amber-500 to-orange-600' },
  ];

  const stats = [
    { value: '50K+', label: 'Books Generated' },
    { value: '12K+', label: 'Active Authors' },
    { value: '99.9%', label: 'Uptime' },
    { value: '4.9★', label: 'User Rating' },
  ];

  return (<>
    <div className="min-h-screen flex flex-col bg-black">
      {/* Sticky nav */}
      <nav className="sticky top-0 z-50 w-full border-b border-white/5 bg-black/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 gradient-multi rounded-lg flex items-center justify-center shrink-0">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div className="leading-none">
              <span className="text-white text-xl font-bold tracking-tight">HydraSkript</span>
              <p className="text-[9px] text-slate-400 font-medium uppercase tracking-widest hidden sm:block">AI Book Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-44 md:w-60 bg-white/5 border-white/10 text-white text-sm placeholder:text-gray-600"
              onKeyDown={(e) => e.key === 'Enter' && handleGetStarted()}
            />
            <Button onClick={() => setShowAuth(true)} disabled={isSigningIn} className="btn-gradient text-sm shrink-0">
              {isSigningIn ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign In'}
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-20 pb-32">
        {/* BG blobs */}
        <div className="absolute top-0 right-0 -z-10 w-[700px] h-[700px] bg-purple-500/10 blur-[140px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 -z-10 w-[500px] h-[500px] bg-cyan-500/8 blur-[120px] rounded-full pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 items-center gap-16">
          {/* Copy */}
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-semibold">
              <Sparkles className="h-3 w-3" />
              AI-Powered Book Publishing
            </div>

            <h1 className="text-5xl lg:text-7xl font-bold leading-[1.08] tracking-tight text-white">
              Create, Edit &amp; Publish{' '}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400">
                E-Books &amp; Audiobooks
              </span>{' '}
              with AI
            </h1>

            <p className="text-lg text-gray-400 max-w-xl leading-relaxed">
              The premium all-in-one AI publishing platform. Reimagined for modern creators who demand high-tech precision and creative freedom.
            </p>

            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 w-full max-w-sm">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 h-12"
                  onKeyDown={(e) => e.key === 'Enter' && handleGetStarted()}
                />
                <Button onClick={handleGetStarted} disabled={isSigningIn} className="btn-gradient h-12 px-6 shrink-0">
                  {isSigningIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Start Free <ArrowRight className="h-4 w-4 ml-1" /></>}
                </Button>
              </div>
              <p className="text-xs text-gray-600 w-full">100 free credits on signup. No credit card required.</p>
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap gap-6">
              {stats.map((s) => (
                <div key={s.label}>
                  <p className="text-2xl font-bold text-white">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Mockup terminal */}
          <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.15 }} className="hidden lg:block">
            <div className="gradient-multi-border rounded-2xl overflow-hidden shadow-2xl shadow-purple-500/20">
              <div className="bg-[#09090b] p-6 font-mono text-sm">
                {/* Window bar */}
                <div className="flex items-center gap-2 mb-5">
                  <div className="h-3 w-3 rounded-full bg-red-500/70" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
                  <div className="h-3 w-3 rounded-full bg-green-500/70" />
                  <span className="ml-3 text-xs text-gray-500">HydraSkript AI Engine v2.4</span>
                </div>
                {/* Fake prompt lines */}
                {[
                  { label: '>', text: 'Generate book: "The Last Algorithm"', color: 'text-cyan-400' },
                  { label: '✓', text: 'Planning 12 chapters...', color: 'text-green-400' },
                  { label: '✓', text: 'Writing Chapter 1: The Awakening (2,840 words)', color: 'text-green-400' },
                  { label: '✓', text: 'Generating illustration: cyber-noir style', color: 'text-green-400' },
                  { label: '⚡', text: 'Training custom style: "noir_tech_v3"', color: 'text-purple-400' },
                  { label: '✓', text: 'Exporting PDF — 247 pages ready', color: 'text-green-400' },
                ].map((line, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.15 }}
                    className={`flex gap-3 mb-2 ${line.color}`}
                  >
                    <span className="shrink-0">{line.label}</span>
                    <span className="text-gray-300">{line.text}</span>
                  </motion.div>
                ))}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }} className="mt-4 flex gap-2">
                  <div className="h-5 w-5 rounded bg-purple-500/20 border border-purple-500/30 animate-pulse" />
                  <span className="text-gray-500">Processing next chapter...</span>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-[#050505] border-t border-white/5 py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              Everything you need to{' '}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">create books</span>
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto">One platform. Unlimited creativity.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.1 }}>
                <div className="h-full p-6 rounded-2xl bg-[#0d0d10] border border-white/8 hover:border-purple-500/30 transition-all group">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                    <f.icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="font-bold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-black border-t border-white/5 py-24">
        <div className="max-w-2xl mx-auto text-center px-6">
          <h2 className="text-4xl font-bold text-white mb-4">Ready to write your book?</h2>
          <p className="text-gray-500 mb-8">Start with 100 free credits — no card needed.</p>
          <div className="flex items-center justify-center gap-3 max-w-md mx-auto">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 h-11"
              onKeyDown={(e) => e.key === 'Enter' && handleGetStarted()}
            />
            <Button onClick={handleGetStarted} disabled={isSigningIn} className="btn-gradient h-11 px-6 shrink-0">
              Get Started
            </Button>
          </div>
        </div>
      </section>

      <Footer />

      {/* Auth Modal */}
      <Dialog open={showAuth} onOpenChange={setShowAuth}>
        <DialogContent className="bg-[#0d0d10] border-white/10 text-white max-w-md">
          <DialogTitle>Sign in to HydraSkript</DialogTitle>
          <DialogDescription>
            Enter your email below to create your account or sign in.
          </DialogDescription>
          <AuthForm />
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
function DashboardView() {
  const { setCurrentView, profile } = useAppStore();
  const [books, setBooks] = useState<BookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const data = await listBooks();
      if (!cancelled) { setBooks(data); setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleDelete = async (id: string) => {
    const result = await deleteBook(id);
    if (result.success) {
      toast({ title: 'Book deleted' });
      setBooks((prev) => prev.filter((b) => b.id !== id));
    } else {
      toast({ title: 'Delete failed', description: result.error, variant: 'destructive' });
    }
    setDeleteDialogOpen(false);
    setBookToDelete(null);
  };

  const handleClick = (id: string) => useAppStore.getState().setSelectedBookId(id);

  const completedBooks = books.filter((b) => b.status === 'completed').length;
  const inProgressBooks = books.filter((b) => b.status === 'generating').length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Welcome back{profile ? `, ${profile.email?.split('@')[0]}` : ''} 👋
          </p>
        </div>
        <Button onClick={() => setCurrentView('create-book')} className="btn-gradient">
          <Plus className="h-4 w-4 mr-2" />
          New Book
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Books',    value: books.length,      icon: BookOpen,   color: 'text-purple-400', bg: 'bg-purple-500/10' },
          { label: 'Completed',      value: completedBooks,    icon: CheckCircle,color: 'text-green-400',  bg: 'bg-green-500/10' },
          { label: 'In Progress',    value: inProgressBooks,   icon: Loader2,    color: 'text-cyan-400',   bg: 'bg-cyan-500/10' },
          { label: 'Credits Left',   value: profile?.credits ?? 0, icon: Zap,    color: 'text-amber-400', bg: 'bg-amber-500/10' },
        ].map((stat) => (
          <div key={stat.label} className="p-4 rounded-2xl bg-[#0d0d10] border border-[#312839]">
            <div className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}>
              <stat.icon className={`h-4.5 w-4.5 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-white">{stat.value.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Book grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : books.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-2xl bg-[#151118] border border-[#312839] flex items-center justify-center mb-5">
            <BookOpen className="h-9 w-9 text-slate-600" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No books yet</h3>
          <p className="text-sm text-slate-500 max-w-xs">Create your first AI-powered book and bring your story to life.</p>
          <Button onClick={() => setCurrentView('create-book')} className="btn-gradient mt-6">
            <Sparkles className="h-4 w-4 mr-2" />
            Create Your First Book
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              My Library
              <span className="ml-2 text-slate-600 font-normal normal-case">{books.length} books</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {books.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  onDelete={(id) => { setBookToDelete(id); setDeleteDialogOpen(true); }}
                  onClick={handleClick}
                />
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Audiobook Studio',  icon: Headphones, view: 'audiobook'      as const, color: 'text-cyan-400',   bg: 'hover:bg-cyan-500/5   hover:border-cyan-500/20' },
          { label: 'Style Training',    icon: Sparkles,   view: 'style-training' as const, color: 'text-pink-400',   bg: 'hover:bg-pink-500/5   hover:border-pink-500/20' },
          { label: 'Export Hub',        icon: Download,   view: 'export-hub'     as const, color: 'text-blue-400',   bg: 'hover:bg-blue-500/5   hover:border-blue-500/20' },
          { label: 'Ideas Lab',         icon: Zap,        view: 'ideas-lab'      as const, color: 'text-yellow-400', bg: 'hover:bg-yellow-500/5 hover:border-yellow-500/20' },
        ].map((a) => (
          <button
            key={a.label}
            onClick={() => setCurrentView(a.view)}
            className={`p-4 rounded-2xl bg-[#0d0d10] border border-[#312839] text-left transition-all ${a.bg} group`}
          >
            <a.icon className={`h-5 w-5 ${a.color} mb-2 group-hover:scale-110 transition-transform`} />
            <p className="text-sm font-medium text-white">{a.label}</p>
          </button>
        ))}
      </div>

      {/* Delete dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-[#0d0d10] border-[#312839] text-white">
          <DialogHeader>
            <DialogTitle>Delete Book</DialogTitle>
            <DialogDescription className="text-slate-400">
              This action cannot be undone. The book and all its content will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} className="border-[#312839] text-slate-300 hover:bg-white/5">
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => bookToDelete && handleDelete(bookToDelete)}>
              Delete Book
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Credits / Pricing View ──────────────────────────────────────────────────

function CreditsView() {
  const { setProfile, profile } = useAppStore();
  const [creditsData, setCreditsData] = useState<CreditsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const data = await getCredits();
      if (!cancelled) { setCreditsData(data); setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── 4-tier subscription plans ──────────────────────────────────────────────
  const plans = [
    {
      key: 'starter',
      label: 'Starter',
      price: 29,
      period: '/mo',
      credits: 300,
      desc: 'Ideal for hobby writers & experiments',
      icon: PenTool,
      gradient: 'from-slate-500 to-slate-600',
      iconBg: 'bg-slate-500/15',
      iconColor: 'text-slate-300',
      features: ['300 credits / month', '3 active books', 'Standard AI models', 'PDF export', 'Email support'],
      featured: false,
    },
    {
      key: 'author',
      label: 'Author',
      price: 79,
      period: '/mo',
      credits: 1000,
      desc: 'For serious writers publishing regularly',
      icon: BookOpen,
      gradient: 'from-purple-500 to-violet-600',
      iconBg: 'bg-purple-500/15',
      iconColor: 'text-purple-300',
      features: ['1 000 credits / month', '10 active books', 'Advanced AI models', 'PDF + EPUB + DOCX', 'Style profiles', 'Priority support'],
      featured: true,
    },
    {
      key: 'publisher',
      label: 'Publisher',
      price: 149,
      period: '/mo',
      credits: 3000,
      desc: 'Teams & small publishing houses',
      icon: Sparkles,
      gradient: 'from-cyan-500 to-blue-600',
      iconBg: 'bg-cyan-500/15',
      iconColor: 'text-cyan-300',
      features: ['3 000 credits / month', 'Unlimited books', 'All AI models', 'All export formats', 'Audiobook generation', 'API access', 'Dedicated support'],
      featured: false,
    },
    {
      key: 'studio',
      label: 'Studio',
      price: 299,
      period: '/mo',
      credits: 10000,
      desc: 'Enterprise & high-volume production',
      icon: Zap,
      gradient: 'from-amber-500 to-orange-600',
      iconBg: 'bg-amber-500/15',
      iconColor: 'text-amber-300',
      features: ['10 000 credits / month', 'Unlimited everything', 'Custom fine-tuning', 'White-label exports', 'SLA guarantee', '24/7 dedicated support'],
      featured: false,
    },
  ];

  // ── A-la-carte credit packs ────────────────────────────────────────────────
  const packs = [
    { key: 'pack_100',  label: '100 Credits',   credits: 100,  price: 15,  per: '$0.15 / credit', icon: Coins,    color: 'text-slate-300',  bg: 'bg-slate-500/10',  border: 'border-slate-700/40' },
    { key: 'pack_500',  label: '500 Credits',   credits: 500,  price: 60,  per: '$0.12 / credit', icon: Coins,    color: 'text-purple-300', bg: 'bg-purple-500/10', border: 'border-purple-700/40', badge: 'Popular' },
    { key: 'pack_1000', label: '1 000 Credits', credits: 1000, price: 100, per: '$0.10 / credit', icon: Coins,    color: 'text-cyan-300',   bg: 'bg-cyan-500/10',   border: 'border-cyan-700/40',   badge: 'Best Value' },
  ];

  const handlePurchase = async (tier: string) => {
    setPurchasing(tier);
    try {
      const result = await purchaseCredits(tier);
      if (result.success) {
        toast({ title: 'Credits purchased!', description: 'Your balance has been updated.' });
        const [updatedProfile, creditsResult] = await Promise.all([getProfile(), getCredits()]);
        if (updatedProfile) setProfile(updatedProfile);
        setCreditsData(creditsResult);
      } else {
        toast({ title: 'Purchase failed', description: result.error || 'Unknown error', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to purchase credits.', variant: 'destructive' });
    } finally {
      setPurchasing(null);
    }
  };

  const currentBalance = creditsData?.credits ?? profile?.credits ?? 0;

  return (
    <div className="space-y-10">
      {/* Header + balance */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Coins className="h-6 w-6 text-amber-400" /> Pricing &amp; Credits
          </h1>
          <p className="text-sm text-slate-400 mt-1">Choose a plan or top up with one-time credit packs</p>
        </div>
        {loading ? (
          <Skeleton className="h-16 w-48 rounded-2xl" />
        ) : (
          <div className="px-6 py-3 rounded-2xl gradient-multi-border text-right shrink-0">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">Balance</p>
            <p className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400 leading-none mt-0.5">
              {currentBalance.toLocaleString()}
            </p>
            <p className="text-[10px] text-slate-500">credits</p>
          </div>
        )}
      </div>

      {/* ── Plans grid ── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Subscription Plans</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {plans.map((plan) => (
            <motion.div
              key={plan.key}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.18 }}
              className={`relative h-full rounded-2xl bg-[#0d0d10] border flex flex-col overflow-hidden ${
                plan.featured
                  ? 'border-purple-500/50 ring-1 ring-purple-500/20 scale-[1.02]'
                  : 'border-[#312839]'
              }`}
            >
              {plan.featured && (
                <div className="bg-gradient-to-r from-purple-600 to-violet-600 text-center py-1.5 text-[11px] font-bold text-white tracking-wide">
                  ★ MOST POPULAR
                </div>
              )}
              <div className="p-5 flex-1 flex flex-col">
                {/* icon */}
                <div className={`w-10 h-10 rounded-xl ${plan.iconBg} flex items-center justify-center mb-4`}>
                  <plan.icon className={`h-5 w-5 ${plan.iconColor}`} />
                </div>
                {/* name + desc */}
                <h3 className="font-bold text-white text-base">{plan.label}</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug">{plan.desc}</p>
                {/* price */}
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-3xl font-bold text-white">${plan.price}</span>
                  <span className="text-xs text-slate-500 mb-1">{plan.period}</span>
                </div>
                <p className="text-[11px] text-purple-300 mt-0.5">{plan.credits.toLocaleString()} credits / mo</p>
                {/* features */}
                <ul className="mt-4 space-y-1.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-slate-400">
                      <CheckCircle className="h-3.5 w-3.5 text-purple-400 shrink-0 mt-px" />
                      {f}
                    </li>
                  ))}
                </ul>
                {/* CTA */}
                <div className="mt-5">
                  <Button
                    onClick={() => handlePurchase(plan.key)}
                    disabled={!!purchasing}
                    className={`w-full text-sm ${
                      plan.featured
                        ? 'btn-gradient'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-[#312839]'
                    }`}
                  >
                    {purchasing === plan.key
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : `Get ${plan.label}`}
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── A-la-carte packs ── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">One-Time Credit Packs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {packs.map((pack) => (
            <motion.div key={pack.key} whileHover={{ y: -3 }} transition={{ duration: 0.15 }}>
              <div className={`relative p-5 rounded-2xl bg-[#0d0d10] border ${pack.border} flex flex-col gap-3`}>
                {pack.badge && (
                  <span className={`absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full ${pack.bg} ${pack.color} border ${pack.border}`}>
                    {pack.badge}
                  </span>
                )}
                <div className={`w-10 h-10 rounded-xl ${pack.bg} flex items-center justify-center`}>
                  <pack.icon className={`h-5 w-5 ${pack.color}`} />
                </div>
                <div>
                  <p className="font-bold text-white">{pack.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{pack.per}</p>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-2xl font-bold text-white">${pack.price}</span>
                  <Button
                    size="sm"
                    onClick={() => handlePurchase(pack.key)}
                    disabled={!!purchasing}
                    className="bg-white/5 text-slate-300 hover:bg-white/10 border border-[#312839] text-xs"
                  >
                    {purchasing === pack.key ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Buy'}
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Transaction history ── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">Transaction History</h2>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : !creditsData?.recentTransactions?.length ? (
          <div className="rounded-2xl bg-[#0d0d10] border border-[#312839] p-10 text-center">
            <BarChart3 className="h-8 w-8 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No transactions yet</p>
            <p className="text-slate-600 text-xs mt-1">Your purchase and usage history will appear here</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-[#0d0d10] border border-[#312839] overflow-hidden">
            <div className="px-6 py-3 border-b border-[#312839] flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-cyan-400" />
              <span className="text-sm font-semibold text-white">Recent Activity</span>
            </div>
            <div className="divide-y divide-[#312839]">
              {creditsData.recentTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between px-6 py-3 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${tx.amount > 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                      {tx.amount > 0
                        ? <TrendingUp className="h-3.5 w-3.5 text-green-400" />
                        : <Zap className="h-3.5 w-3.5 text-red-400" />}
                    </div>
                    <div>
                      <p className="text-sm text-white">{tx.reason}</p>
                      <p className="text-[10px] text-slate-500">{new Date(tx.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Export Hub View ─────────────────────────────────────────────────────────

function ExportHubView() {
  const [books, setBooks] = useState<BookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    listBooks().then((data) => { setBooks(data.filter(b => b.status === 'completed')); setLoading(false); });
  }, []);

  const formats = [
    { key: 'pdf',   label: 'PDF',         icon: Download, desc: 'Print-ready PDF with full layout',    color: 'text-red-400',  bg: 'bg-red-500/10' },
    { key: 'epub',  label: 'EPUB',        icon: BookOpen, desc: 'For e-readers and Kindle devices',    color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { key: 'docx',  label: 'DOCX',        icon: PenTool,  desc: 'Editable Word document format',       color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { key: 'audio', label: 'Audiobook',   icon: Headphones,desc: 'MP3 audiobook files by chapter',    color: 'text-green-400',bg: 'bg-green-500/10' },
  ];

  const handleExport = async (bookId: string, format: string) => {
    setExporting(`${bookId}-${format}`);
    try {
      const result = await exportBook(bookId);
      if (result.success && result.data?.downloadUrl) {
        window.open(result.data.downloadUrl, '_blank');
        toast({ title: `Export ready`, description: `Your ${format.toUpperCase()} download has started.` });
      } else {
        toast({ title: 'Export failed', description: result.error || 'Could not generate export.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Export request failed.', variant: 'destructive' });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Download className="h-6 w-6 text-blue-400" /> Export Hub
        </h1>
        <p className="text-sm text-slate-400 mt-1">Export your books in multiple formats</p>
      </div>

      {/* Format cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {formats.map((f) => (
          <div key={f.key} className="p-4 rounded-2xl bg-[#0d0d10] border border-[#312839]">
            <div className={`w-10 h-10 rounded-xl ${f.bg} flex items-center justify-center mb-3`}>
              <f.icon className={`h-5 w-5 ${f.color}`} />
            </div>
            <p className="font-bold text-white">{f.label}</p>
            <p className="text-xs text-slate-500 mt-1">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Books to export */}
      <div className="rounded-2xl bg-[#0d0d10] border border-[#312839] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#312839]">
          <h3 className="font-bold text-white">Completed Books</h3>
        </div>
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : books.length === 0 ? (
          <div className="p-12 text-center">
            <BookOpen className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No completed books yet</p>
            <p className="text-xs text-slate-600 mt-1">Books appear here once generation is complete</p>
          </div>
        ) : (
          <div className="divide-y divide-[#312839]">
            {books.map((book) => (
              <div key={book.id} className="px-6 py-4 flex items-center justify-between hover:bg-white/2 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-14 rounded-lg bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center shrink-0">
                    <BookOpen className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">{book.title}</p>
                    <p className="text-xs text-slate-500">{book.genre} • {book.chapters?.length ?? 0} chapters</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {['pdf', 'epub', 'docx'].map((fmt) => (
                    <Button
                      key={fmt}
                      size="sm"
                      variant="outline"
                      disabled={exporting === `${book.id}-${fmt}`}
                      onClick={() => handleExport(book.id, fmt)}
                      className="border-[#312839] text-slate-300 hover:bg-white/5 text-xs"
                    >
                      {exporting === `${book.id}-${fmt}` ? <Loader2 className="h-3 w-3 animate-spin" /> : fmt.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── UI Gallery View ─────────────────────────────────────────────────────────

const STITCH_FILES = Array.from({ length: 60 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return { id: i + 1, name: `Stitch ${i + 1}`, file: `/stitch/stitch_${n}.html` };
});

function UIGalleryView() {
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  const filtered = STITCH_FILES.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">UI Component Gallery</h1>
        <p className="text-slate-400 text-sm mt-1">60 stitch UI templates — click any to preview fullscreen.</p>
      </div>

      <input
        type="text"
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-xs px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {filtered.map((f) => (
          <button
            key={f.id}
            onClick={() => setPreview(f.file)}
            className="group relative rounded-xl border border-white/10 overflow-hidden bg-[#0d0d10] hover:border-purple-500/50 transition-all aspect-[4/3]"
          >
            <iframe
              src={f.file}
              title={f.name}
              className="w-full h-full pointer-events-none"
              style={{ transform: 'scale(0.35)', transformOrigin: 'top left', width: '285%', height: '285%' }}
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-end">
              <span className="w-full text-center text-xs text-white/0 group-hover:text-white/90 pb-2 transition-all font-medium">
                {f.name}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Fullscreen preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-sm text-slate-300 font-medium">{preview}</span>
            <div className="flex gap-3">
              <a
                href={preview}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-cyan-400 hover:underline"
              >
                Open in new tab ↗
              </a>
              <button
                onClick={() => setPreview(null)}
                className="text-slate-400 hover:text-white text-xs px-3 py-1 rounded-lg border border-white/10 hover:border-white/30 transition-all"
              >
                Close ✕
              </button>
            </div>
          </div>
          <iframe src={preview} title="Preview" className="flex-1 w-full" />
        </div>
      )}
    </div>
  );
}

// ─── Admin View ──────────────────────────────────────────────────────────────

function AdminView() {
  const { profile } = useAppStore();
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.isAdmin) return;
    getAdminData().then((data) => { setAdminData(data); setLoading(false); });
  }, [profile]);

  if (!profile?.isAdmin) {
    return (
      <div className="text-center py-16">
        <Shield className="h-12 w-12 mx-auto text-slate-600 mb-4" />
        <h3 className="text-lg font-bold text-white">Access Denied</h3>
        <p className="text-sm text-slate-500 mt-1">You don&apos;t have admin privileges.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
    );
  }

  if (!adminData) {
    return <div className="text-center py-12"><p className="text-slate-400">Failed to load admin data.</p></div>;
  }

  const { analytics, jobs } = adminData;

  const statCards = [
    { label: 'Total Users',      value: analytics.totalUsers,            icon: UsersIcon,   color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Total Books',      value: analytics.totalBooks,            icon: BookOpen,    color: 'text-cyan-400',   bg: 'bg-cyan-500/10' },
    { label: 'Completed',        value: analytics.completedBooks,        icon: CheckCircle, color: 'text-green-400',  bg: 'bg-green-500/10' },
    { label: 'Failed',           value: analytics.failedBooks,           icon: XCircle,     color: 'text-red-400',    bg: 'bg-red-500/10' },
    { label: 'Credits Consumed', value: analytics.totalCreditsConsumed,  icon: Coins,       color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  ];

  const jobStatusConfig: Record<string, { icon: React.ElementType; className: string }> = {
    queued:    { icon: Clock,      className: 'text-slate-400' },
    active:    { icon: Loader2,    className: 'text-purple-400' },
    completed: { icon: CheckCircle,className: 'text-green-400' },
    failed:    { icon: AlertCircle,className: 'text-red-400' },
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield className="h-6 w-6 text-red-400" /> Admin Dashboard
        </h1>
        <p className="text-sm text-slate-400 mt-1">Platform analytics and job management</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statCards.map((stat) => (
          <div key={stat.label} className="p-4 rounded-2xl bg-[#0d0d10] border border-[#312839] text-center">
            <div className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center mx-auto mb-2`}>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-white">{stat.value.toLocaleString()}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Job queue */}
      <div className="rounded-2xl bg-[#0d0d10] border border-[#312839] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#312839] flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          <h3 className="font-bold text-white">Job Queue</h3>
        </div>
        <div className="grid grid-cols-4 gap-3 p-6">
          {(['queued', 'active', 'completed', 'failed'] as const).map((status) => {
            const config = jobStatusConfig[status];
            const count = analytics.jobStats[status as keyof typeof analytics.jobStats] || 0;
            return (
              <div key={status} className="text-center p-3 rounded-xl bg-[#151118]">
                <config.icon className={`h-4 w-4 mx-auto mb-1.5 ${config.className} ${status === 'active' ? 'animate-spin' : ''}`} />
                <p className="text-xl font-bold text-white">{count}</p>
                <p className="text-[10px] text-slate-500 capitalize">{status}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent jobs */}
      <div className="rounded-2xl bg-[#0d0d10] border border-[#312839] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#312839]">
          <h3 className="font-bold text-white">Recent Jobs</h3>
        </div>
        {jobs.length === 0 ? (
          <p className="text-sm text-slate-500 text-center p-8">No jobs found.</p>
        ) : (
          <div className="divide-y divide-[#312839] max-h-96 overflow-y-auto">
            {jobs.map((job) => {
              const statusConfig = jobStatusConfig[job.status] || jobStatusConfig.queued;
              const StatusIcon = statusConfig.icon;
              return (
                <div key={job.id} className="flex items-center justify-between px-6 py-3 hover:bg-white/2 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusIcon className={`h-4 w-4 shrink-0 ${statusConfig.className} ${job.status === 'active' ? 'animate-spin' : ''}`} />
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{job.book?.title || 'Unknown Book'}</p>
                      <p className="text-[10px] text-slate-500">{job.owner.email} • {job.jobType.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    {job.progressPercent > 0 && <Progress value={job.progressPercent} className="w-20 h-1.5" />}
                    <Badge className={`text-[9px] ${statusConfig.className} bg-transparent border-0 capitalize`}>{job.status}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App Component ──────────────────────────────────────────────────────

export default function HomePage() {
  const { currentView, setCurrentView, setProfile, setSidebarOpen } = useAppStore();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const email = await getUserEmail();
        if (email && email !== 'demo@hydraskript.com') {
          const prof = await getProfile();
          if (prof) {
            setProfile(prof);
            setCurrentView('dashboard');
            setSidebarOpen(true);
          }
        }
      } catch (error) {
        console.log('User not authenticated, staying on landing page.');
      } finally {
        setInitialized(true);
      }
    };
    init();
  }, [setProfile, setCurrentView, setSidebarOpen]);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="size-16 gradient-multi rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Zap className="h-8 w-8 text-white" />
          </div>
          <p className="text-slate-500 text-sm">Loading HydraSkript...</p>
        </div>
      </div>
    );
  }

  if (currentView === 'landing') return <LandingPage />;

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':     return <DashboardView />;
      case 'create-book':   return <CreateBookForm />;
      case 'book-detail':   return <BookDetail />;
      case 'style-training':return <StyleUploader />;
      case 'ideas-lab':     return <IdeasLab />;
      case 'audiobook':     return <AudiobookGenerator />;
      case 'credits':       return <CreditsView />;
      case 'pricing':       return <CreditsView />;
      case 'export-hub':    return <ExportHubView />;
      case 'ui-gallery':    return <UIGalleryView />;
      case 'admin':         return <AdminView />;
      default:              return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b]">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentView}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                {renderView()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
