'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Plus, Sparkles, Zap, Library } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { listBooks, deleteBook, type BookData } from '@/lib/api';
import BookCard from '@/components/book/BookCard';
import { toast } from '@/hooks/use-toast';

export default function DashboardHome() {
  const { setCurrentView, setSelectedBookId, profile } = useAppStore();
  const [books, setBooks] = useState<BookData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const data = await listBooks();
    setBooks(data);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleDelete = async (id: string) => {
    const result = await deleteBook(id);
    if (result.success) {
      setBooks((prev) => prev.filter((b) => b.id !== id));
      toast({ title: 'Book deleted' });
    } else {
      toast({ title: 'Could not delete book', description: result.error, variant: 'destructive' });
    }
  };

  const completed = books.filter((b) => b.status === 'completed').length;
  const generating = books.filter((b) =>
    ['generating', 'writing', 'outlining', 'finalizing'].includes(b.status)
  ).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-2">Studio</p>
          <h1 className="text-3xl font-bold text-white">
            Welcome{profile?.name ? `, ${profile.name}` : ''}
          </h1>
          <p className="text-slate-400 mt-1">
            Create a book from an idea, or open Story Bible to upload a manuscript.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setCurrentView('story-bible')}
            className="border-[#312839] text-slate-200"
          >
            <Library className="h-4 w-4 mr-2" /> Upload manuscript
          </Button>
          <Button onClick={() => setCurrentView('create-book')} className="btn-gradient">
            <Plus className="h-4 w-4 mr-2" /> Create Book
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Books" value={books.length} icon={BookOpen} />
        <Stat label="Completed" value={completed} icon={Sparkles} />
        <Stat label="In progress" value={generating} icon={Library} />
        <Stat
          label="Credits"
          value={(profile?.credits ?? 0).toLocaleString()}
          icon={Zap}
          onClick={() => setCurrentView('credits')}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-64 rounded-2xl bg-[#0d0d10]/70 backdrop-blur-md border border-[#312839] animate-pulse" />
          ))}
        </div>
      ) : books.length === 0 ? (
        <div className="rounded-2xl border border-[#312839] bg-[#0d0d10]/75 backdrop-blur-md py-20 text-center">
          <BookOpen className="h-12 w-12 text-slate-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">No books yet</h2>
          <p className="text-slate-500 max-w-md mx-auto mb-6">
            Start from a blank idea, or bring a finished manuscript into Story Bible to polish and publish.
          </p>
          <div className="flex justify-center gap-3">
            <Button onClick={() => setCurrentView('create-book')} className="btn-gradient">
              <Sparkles className="h-4 w-4 mr-2" /> Start Creating
            </Button>
            <Button
              variant="outline"
              onClick={() => setCurrentView('story-bible')}
              className="border-[#312839] text-slate-200"
            >
              Upload manuscript
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onDelete={handleDelete}
              onClick={(id) => setSelectedBookId(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  onClick?: () => void;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className="rounded-2xl border border-[#312839] bg-[#0d0d10]/75 backdrop-blur-md p-4 text-left hover:border-purple-500/30 transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
        <Icon className="h-4 w-4 text-purple-400" />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </Comp>
  );
}
