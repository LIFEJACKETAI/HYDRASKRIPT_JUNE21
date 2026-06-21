'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import {
  BookOpen,
  Sparkles,
  PenTool,
  Image as ImageIcon,
  Share2,
  ArrowRight,
  Mail,
  Zap,
  Globe,
  Clock,
  Coins,
  Shield,
  Activity,
  Users as UsersIcon,
  FileText,
  AlertCircle,
  Loader2,
  CheckCircle,
  XCircle,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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
  getUserEmail,
  setUserEmail,
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

// ─── Landing Page ────────────────────────────────────────────────────────────

function LandingPage() {
  const { setCurrentView, setProfile } = useAppStore();
  const [email, setEmail] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleGetStarted = async () => {
    if (!email.trim()) {
      toast({ title: 'Email required', description: 'Please enter your email to get started.', variant: 'destructive' });
      return;
    }
    setIsSigningIn(true);
    setUserEmail(email.trim());
    const profile = await getProfile();
    if (profile) {
      setProfile(profile);
      setCurrentView('dashboard');
    } else {
      toast({ title: 'Sign in failed', description: 'Could not create your account. Please try again.', variant: 'destructive' });
    }
    setIsSigningIn(false);
  };

  const features = [
    {
      icon: PenTool,
      title: 'Write Full Books',
      description: 'Generate complete books with chapters, characters, and cohesive narratives from a single prompt.',
      gradient: 'from-purple-500 to-violet-500',
    },
    {
      icon: ImageIcon,
      title: 'Generate Illustrations',
      description: 'AI-powered illustrations for every chapter, from Pixar-style to watercolor and line art.',
      gradient: 'from-cyan-500 to-blue-500',
    },
    {
      icon: Sparkles,
      title: 'Style Training',
      description: 'Train custom writing styles using your own exemplar texts for truly personalized output.',
      gradient: 'from-pink-500 to-rose-500',
    },
    {
      icon: Share2,
      title: 'Export & Share',
      description: 'Export to PDF with one click. Print-ready formatting for professional results.',
      gradient: 'from-amber-500 to-orange-500',
    },
  ];

  const stats = [
    { value: '10,000+', label: 'Books Generated', icon: BookOpen },
    { value: '50+', label: 'Genres', icon: Globe },
    { value: '99.9%', label: 'Uptime', icon: Clock },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-black">
      {/* Hero */}
      <header className="relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(6,182,212,0.1),transparent_50%)]" />

        {/* Nav */}
        <nav className="relative z-10 flex items-center justify-between px-4 md:px-8 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <Image
              src="/logo-navbar.png"
              alt="HydraSkript Logo"
              width={71}
              height={40}
              className="h-8 w-auto"
              priority
            />
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-48 md:w-64 bg-[#1e1e1e] border-gray-700 text-white text-sm placeholder:text-gray-600"
              onKeyDown={(e) => e.key === 'Enter' && handleGetStarted()}
            />
            <Button onClick={handleGetStarted} disabled={isSigningIn} className="btn-gradient text-sm">
              {isSigningIn ? '...' : 'Sign In'}
            </Button>
          </div>
        </nav>

        {/* Hero content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 pt-16 pb-24 md:pt-24 md:pb-32 text-center">
          {/* Floating elements */}
          <div className="absolute top-20 left-[10%] animate-float opacity-20">
            <BookOpen className="h-8 w-8 text-purple-400" />
          </div>
          <div className="absolute top-32 right-[15%] animate-float opacity-15" style={{ animationDelay: '1s' }}>
            <PenTool className="h-6 w-6 text-cyan-400" />
          </div>
          <div className="absolute bottom-32 left-[20%] animate-float opacity-20" style={{ animationDelay: '2s' }}>
            <Sparkles className="h-7 w-7 text-pink-400" />
          </div>
          <div className="absolute bottom-20 right-[10%] animate-float opacity-15" style={{ animationDelay: '0.5s' }}>
            <ImageIcon className="h-8 w-8 text-amber-400" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col items-center"
          >
            <Image
              src="/logo-landing.png"
              alt="HydraSkript Logo"
              width={284}
              height={160}
              className="h-28 md:h-36 lg:h-40 w-auto mb-4"
              priority
            />
            <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto">
              AI-Powered Book Generation Platform
            </p>
            <p className="mt-2 text-sm text-gray-600 max-w-xl mx-auto">
              Create full-length books with chapters, illustrations, and custom writing styles — all from a single prompt.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-8"
          >
            <Button
              onClick={handleGetStarted}
              disabled={isSigningIn}
              className="btn-gradient text-lg px-8 py-6 h-auto rounded-xl"
            >
              {isSigningIn ? 'Signing in...' : 'Get Started — 100 Free Credits'}
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </motion.div>
        </div>
      </header>

      {/* Features */}
      <section className="bg-[#0a0a0a] py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-12">
            Everything you need to <span className="gradient-text">create books</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                <Card className="bg-[#2a2a2a] border-gray-800 card-hover h-full">
                  <CardContent className="p-6">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4`}>
                      <feature.icon className="h-5 w-5 text-white" />
                    </div>
                    <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
                    <p className="text-sm text-gray-400">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-black py-16">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center p-6 rounded-xl bg-[#1e1e1e] border border-gray-800">
                <stat.icon className="h-6 w-6 text-purple-400 mx-auto mb-2" />
                <p className="text-3xl font-bold gradient-text">{stat.value}</p>
                <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0a0a0a] py-16">
        <div className="max-w-3xl mx-auto text-center px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Ready to write your book?
          </h2>
          <p className="text-gray-400 mb-8">
            Start with 100 free credits and generate your first AI-powered book in minutes.
          </p>
          <div className="flex items-center justify-center gap-2 max-w-md mx-auto">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="bg-[#1e1e1e] border-gray-700 text-white placeholder:text-gray-600"
              onKeyDown={(e) => e.key === 'Enter' && handleGetStarted()}
            />
            <Button onClick={handleGetStarted} disabled={isSigningIn} className="btn-gradient shrink-0">
              Get Started
            </Button>
          </div>
        </div>
      </section>

      <div className="mt-auto">
        <Footer />
      </div>
    </div>
  );
}

// ─── Dashboard View ──────────────────────────────────────────────────────────

function DashboardView() {
  const { setCurrentView, profile } = useAppStore();
  const [books, setBooks] = useState<BookData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const data = await listBooks();
      if (!cancelled) {
        setBooks(data);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleDelete = async (id: string) => {
    const result = await deleteBook(id);
    if (result.success) {
      toast({ title: 'Book deleted' });
      setLoading(true);
      const data = await listBooks();
      setBooks(data);
      setLoading(false);
    } else {
      toast({ title: 'Delete failed', description: result.error, variant: 'destructive' });
    }
  };

  const handleClick = (id: string) => {
    useAppStore.getState().setSelectedBookId(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">My Books</h1>
          <p className="text-sm text-gray-500">
            {books.length} book{books.length !== 1 ? 's' : ''} • {profile?.credits || 0} credits remaining
          </p>
        </div>
        <Button onClick={() => setCurrentView('create-book')} className="btn-gradient">
          <Sparkles className="h-4 w-4 mr-2" />
          Create New
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : books.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="h-16 w-16 mx-auto text-gray-700 mb-4" />
          <h3 className="text-lg font-medium text-gray-400">No books yet</h3>
          <p className="text-sm text-gray-600 mt-1">Create your first book to get started!</p>
          <Button onClick={() => setCurrentView('create-book')} className="btn-gradient mt-6">
            <Sparkles className="h-4 w-4 mr-2" />
            Create Your First Book
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onDelete={handleDelete}
                onClick={handleClick}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ─── Credits View ────────────────────────────────────────────────────────────

function CreditsView() {
  const { setProfile, profile } = useAppStore();
  const [creditsData, setCreditsData] = useState<CreditsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const data = await getCredits();
      if (!cancelled) {
        setCreditsData(data);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const tiers = [
    { key: 'author', label: 'Author', credits: 500, price: 9.99, desc: 'Perfect for writing your first book', icon: PenTool, gradient: 'from-purple-500 to-violet-500' },
    { key: 'publisher', label: 'Publisher', credits: 2000, price: 29.99, desc: 'For prolific writers and small teams', icon: BookOpen, gradient: 'from-cyan-500 to-blue-500', popular: true },
    { key: 'studio', label: 'Studio', credits: 10000, price: 99.99, desc: 'Unlimited creative potential', icon: Sparkles, gradient: 'from-amber-500 to-orange-500' },
  ];

  const handlePurchase = async (tier: string) => {
    setPurchasing(tier);
    try {
      const result = await purchaseCredits(tier);
      if (result.success) {
        toast({ title: 'Credits purchased!', description: `Your ${tier} credits have been added.` });
        // Refresh profile and credits
        const updatedProfile = await getProfile();
        if (updatedProfile) setProfile(updatedProfile);
        // Refresh credits data
        const creditsResult = await getCredits();
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Coins className="h-5 w-5 text-amber-400" />
          Credits
        </h1>
        <p className="text-sm text-gray-500 mt-1">Purchase credits to generate books and illustrations</p>
      </div>

      {/* Current balance */}
      {loading ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : (
        <Card className="bg-[#2a2a2a] border-gray-800">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-gray-400">Current Balance</p>
            <p className="text-5xl font-bold gradient-text mt-2">
              {creditsData?.credits?.toLocaleString() || profile?.credits || 0}
            </p>
            <p className="text-xs text-gray-600 mt-2">credits available</p>
          </CardContent>
        </Card>
      )}

      {/* Tier cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tiers.map((tier) => (
          <motion.div key={tier.key} whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
            <Card className={`bg-[#2a2a2a] border-gray-800 h-full flex flex-col ${tier.popular ? 'border-cyan-500/30' : ''}`}>
              {tier.popular && (
                <div className="bg-gradient-to-r from-cyan-500 to-purple-500 text-center py-1.5 text-xs font-bold text-white rounded-t-xl">
                  Most Popular
                </div>
              )}
              <CardContent className="p-6 flex-1 flex flex-col">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${tier.gradient} flex items-center justify-center mb-3`}>
                  <tier.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="font-bold text-white text-lg">{tier.label}</h3>
                <p className="text-sm text-gray-400 mt-1">{tier.desc}</p>
                <div className="mt-4">
                  <span className="text-3xl font-bold text-white">${tier.price}</span>
                  <span className="text-sm text-gray-500 ml-1">one-time</span>
                </div>
                <p className="text-xs text-purple-300 mt-1">{tier.credits.toLocaleString()} credits</p>
                <div className="mt-auto pt-4">
                  <Button
                    onClick={() => handlePurchase(tier.key)}
                    disabled={purchasing === tier.key}
                    className={`w-full ${tier.popular ? 'btn-gradient' : 'bg-[#1e1e1e] text-gray-300 hover:bg-[#252525] border border-gray-700'}`}
                  >
                    {purchasing === tier.key ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...
                      </>
                    ) : (
                      `Purchase ${tier.label}`
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Transaction history */}
      {creditsData?.recentTransactions && creditsData.recentTransactions.length > 0 && (
        <Card className="bg-[#2a2a2a] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-base">Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {creditsData.recentTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-[#1e1e1e] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.amount > 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                      {tx.amount > 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-400" />
                      ) : (
                        <Zap className="h-4 w-4 text-red-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-white">{tx.reason}</p>
                      <p className="text-[10px] text-gray-600">{new Date(tx.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-medium ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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
    getAdminData().then((data) => {
      setAdminData(data);
      setLoading(false);
    });
  }, [profile]);

  if (!profile?.isAdmin) {
    return (
      <div className="text-center py-12">
        <Shield className="h-12 w-12 mx-auto text-gray-600 mb-4" />
        <h3 className="text-lg font-medium text-gray-400">Access Denied</h3>
        <p className="text-sm text-gray-600 mt-1">You don&apos;t have admin privileges.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!adminData) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Failed to load admin data.</p>
      </div>
    );
  }

  const { analytics, jobs } = adminData;

  const statCards = [
    { label: 'Total Users', value: analytics.totalUsers, icon: UsersIcon, color: 'text-purple-400' },
    { label: 'Total Books', value: analytics.totalBooks, icon: BookOpen, color: 'text-cyan-400' },
    { label: 'Completed', value: analytics.completedBooks, icon: CheckCircle, color: 'text-green-400' },
    { label: 'Failed', value: analytics.failedBooks, icon: XCircle, color: 'text-red-400' },
    { label: 'Credits Consumed', value: analytics.totalCreditsConsumed, icon: Coins, color: 'text-amber-400' },
  ];

  const jobStatusConfig: Record<string, { icon: React.ElementType; className: string }> = {
    queued: { icon: Clock, className: 'text-gray-400' },
    active: { icon: Loader2, className: 'text-purple-400' },
    completed: { icon: CheckCircle, className: 'text-green-400' },
    failed: { icon: AlertCircle, className: 'text-red-400' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Shield className="h-5 w-5 text-purple-400" />
          Admin Dashboard
        </h1>
        <p className="text-sm text-gray-500 mt-1">Platform analytics and job management</p>
      </div>

      {/* Analytics cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statCards.map((stat) => (
          <Card key={stat.label} className="bg-[#2a2a2a] border-gray-800">
            <CardContent className="p-4 text-center">
              <stat.icon className={`h-5 w-5 mx-auto mb-2 ${stat.color}`} />
              <p className="text-2xl font-bold text-white">{stat.value.toLocaleString()}</p>
              <p className="text-[10px] text-gray-500">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Job queue */}
      <Card className="bg-[#2a2a2a] border-gray-800">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            Job Queue Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            {(['queued', 'active', 'completed', 'failed'] as const).map((status) => {
              const config = jobStatusConfig[status];
              const count = analytics.jobStats[status as keyof typeof analytics.jobStats] || 0;
              return (
                <div key={status} className="text-center p-3 rounded-lg bg-[#1e1e1e]">
                  <config.icon className={`h-4 w-4 mx-auto mb-1 ${config.className} ${status === 'active' ? 'animate-spin' : ''}`} />
                  <p className="text-lg font-bold text-white">{count}</p>
                  <p className="text-[10px] text-gray-500 capitalize">{status}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent jobs */}
      <Card className="bg-[#2a2a2a] border-gray-800">
        <CardHeader>
          <CardTitle className="text-white text-base">Recent Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No jobs found.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
              {jobs.map((job) => {
                const statusConfig = jobStatusConfig[job.status] || jobStatusConfig.queued;
                const StatusIcon = statusConfig.icon;
                return (
                  <div key={job.id} className="flex items-center justify-between p-3 rounded-lg bg-[#1e1e1e] hover:bg-[#252525] transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <StatusIcon className={`h-4 w-4 shrink-0 ${statusConfig.className} ${job.status === 'active' ? 'animate-spin' : ''}`} />
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">
                          {job.book?.title || 'Unknown Book'}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {job.owner.email} • {job.jobType.replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {job.progressPercent > 0 && (
                        <div className="w-20">
                          <Progress value={job.progressPercent} className="h-1.5" />
                        </div>
                      )}
                      <Badge className={`text-[9px] ${statusConfig.className} bg-transparent border-0`}>
                        {job.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main App Component ──────────────────────────────────────────────────────

export default function HomePage() {
  const { currentView, setCurrentView, setProfile, profile } = useAppStore();
  const [initialized, setInitialized] = useState(false);

  // Auto-login from localStorage
  useEffect(() => {
    const init = async () => {
      const email = getUserEmail();
      if (email && email !== 'demo@hydraskript.com') {
        const prof = await getProfile();
        if (prof) {
          setProfile(prof);
          setCurrentView('dashboard');
        }
      }
      setInitialized(true);
    };
    init();
  }, [setProfile, setCurrentView]);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Image
            src="/logo-landing.png"
            alt="HydraSkript Logo"
            width={284}
            height={160}
            className="h-20 w-auto mx-auto mb-4 animate-pulse"
            priority
          />
          <p className="text-gray-500">Loading HydraSkript...</p>
        </div>
      </div>
    );
  }

  // Landing page - full screen, no sidebar
  if (currentView === 'landing') {
    return <LandingPage />;
  }

  // App views - with sidebar layout
  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView />;
      case 'create-book':
        return <CreateBookForm />;
      case 'book-detail':
        return <BookDetail />;
      case 'style-training':
        return <StyleUploader />;
      case 'credits':
        return <CreditsView />;
      case 'admin':
        return <AdminView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-black">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
          <div className="max-w-6xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentView}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {renderView()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}
