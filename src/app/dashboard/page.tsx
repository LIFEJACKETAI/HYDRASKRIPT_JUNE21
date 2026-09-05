'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import { useAppStore } from '@/lib/store';
import type { AppView } from '@/lib/store';
import { listBooks, type BookData, type ProfileData } from '@/lib/api';
import DashboardHome from '@/components/app/DashboardHome';
import CreateBookForm from '@/components/book/CreateBookForm';
import BookDetail from '@/components/book/BookDetail';
import StyleUploader from '@/components/book/StyleUploader';
import AudiobookGenerator from '@/components/book/AudiobookGenerator';
import IdeasLab from '@/components/book/IdeasLab';
import StoryBible from '@/components/book/StoryBible';
import UniverseArchitect from '@/components/book/UniverseArchitect';
import AICoverDesigner from '@/components/book/AICoverDesigner';
import EditorialReviewPanel from '@/components/book/EditorialReviewPanel';
import { AdminView, BookstoreView, CreditsView, ExportHubView } from '@/components/app/StudioViews';
import { toast } from '@/hooks/use-toast';

const INTENT_VIEWS: Record<string, AppView> = {
  manuscript: 'story-bible',
  create: 'create-book',
  credits: 'credits',
  audiobook: 'audiobook',
  export: 'export-hub',
};

function DashboardShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentView, setCurrentView, setProfile, sidebarOpen } = useAppStore();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [books, setBooks] = useState<BookData[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/profile');
        if (response.status === 401) {
          const next = `/dashboard${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
          return;
        }

        const payload = await response.json();
        if (!payload.success || !payload.data) {
          setError(payload.error || 'Could not load your profile. Check that DATABASE_URL points at a reachable Postgres.');
          setBootstrapping(false);
          return;
        }

        if (cancelled) return;
        const nextProfile = payload.data as ProfileData;
        setProfile(nextProfile);

        const intent = searchParams.get('intent');
        const viewFromIntent = intent ? INTENT_VIEWS[intent] : undefined;
        if (viewFromIntent) {
          setCurrentView(viewFromIntent);
        } else if (useAppStore.getState().currentView === 'landing') {
          setCurrentView('dashboard');
        }

        const checkout = searchParams.get('checkout');
        if (checkout === 'success') {
          toast({ title: 'Payment received', description: 'Your credits and plan will update in a moment.' });
        } else if (checkout === 'cancelled') {
          toast({ title: 'Checkout cancelled', description: 'No charge was made.' });
        }

        const library = await listBooks();
        if (!cancelled) setBooks(library);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load the studio.');
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-6">
        <div className="max-w-lg rounded-2xl border border-red-500/30 bg-[#0d0d10] p-8 text-center">
          <h1 className="text-xl font-bold text-white mb-2">Studio unavailable</h1>
          <p className="text-sm text-slate-400 mb-6">{error}</p>
          <p className="text-xs text-slate-600">
            If you just pulled the repo, confirm <code className="text-slate-400">DATABASE_URL</code> in{' '}
            <code className="text-slate-400">.env.local</code> uses a valid Postgres user and password.
          </p>
        </div>
      </div>
    );
  }

  const view = currentView === 'landing' ? 'dashboard' : currentView;

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <Navbar />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-w-0 p-4 md:p-8 overflow-y-auto min-h-[calc(100vh-4rem)]">
          {view === 'dashboard' && <DashboardHome />}
          {view === 'create-book' && <CreateBookForm />}
          {view === 'book-detail' && <BookDetail />}
          {view === 'style-training' && <StyleUploader />}
          {view === 'audiobook' && <AudiobookGenerator />}
          {view === 'ideas-lab' && <IdeasLab />}
          {view === 'credits' && <CreditsView />}
          {view === 'pricing' && <CreditsView />}
          {view === 'export-hub' && <ExportHubView />}
          {view === 'admin' && <AdminView />}
          {view === 'story-bible' && <StoryBible />}
          {view === 'universe' && (
            <div className="space-y-10">
              <UniverseArchitect />
              <EditorialReviewPanel books={books} />
            </div>
          )}
          {view === 'ai-cover-designer' && <AICoverDesigner />}
          {view === 'bookstore' && <BookstoreView />}
        </main>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
        </div>
      }
    >
      <DashboardShell />
    </Suspense>
  );
}
