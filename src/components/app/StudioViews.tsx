'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2, Shield, Store, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore } from '@/lib/store';
import {
  listBooks,
  exportBook,
  getCredits,
  getAdminData,
  type BookData,
  type CreditsData,
  type AdminData,
} from '@/lib/api';
import { PRICING_CONFIG, type PricingKey } from '@/types';
import { FounderPackCTA } from '@/components/pricing/FounderPackCTA';
import { startPlanCheckout } from '@/lib/checkout-client';
import { toast } from '@/hooks/use-toast';

export function CreditsView() {
  const { profile, setCurrentView } = useAppStore();
  const [data, setData] = useState<CreditsData | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    getCredits().then(setData);
  }, []);

  const handlePack = async (pricingKey: PricingKey) => {
    setBusyKey(pricingKey);
    const error = await startPlanCheckout(pricingKey);
    if (error) toast({ title: 'Checkout failed', description: error, variant: 'destructive' });
    setBusyKey(null);
  };

  const packs = (['pack_100', 'pack_500', 'pack_1000'] as const).map((key) => PRICING_CONFIG[key]);
  const plans = (['starter', 'author', 'publisher', 'studio'] as const).map((key) => PRICING_CONFIG[key]);

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Coins className="h-6 w-6 text-amber-400" /> Credits & Plans
        </h1>
        <p className="text-slate-400 mt-1">Monthly Founder credits refresh and do not roll over. Purchased packs never expire.</p>
      </div>

      <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 backdrop-blur-md p-6">
        <p className="text-xs uppercase tracking-wider text-cyan-300 mb-1">Available credits</p>
        <p className="text-4xl font-bold text-white">
          {(data?.credits ?? profile?.credits ?? 0).toLocaleString()}
        </p>
        <p className="text-sm text-slate-400 mt-2 capitalize">
          Plan: {data?.tier ?? profile?.tier ?? 'free'}
          {profile?.tier === 'founder' ? ' · Founder Lifetime' : ''}
        </p>
      </div>

      <FounderPackCTA soldCount={data?.founderCount ?? 0} />

      <div>
        <h2 className="text-lg font-bold text-white mb-4">Monthly plans</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => (
            <div key={plan.key} className="rounded-2xl border border-[#312839] bg-[#0d0d10]/75 backdrop-blur-md p-5">
              <p className="font-bold text-white">{plan.label}</p>
              <p className="text-2xl font-bold text-white mt-2">${plan.price}<span className="text-sm text-slate-500">/mo</span></p>
              <p className="text-sm text-purple-300 mt-1">{plan.credits.toLocaleString()} credits/mo</p>
              <Button
                className="btn-gradient w-full mt-4"
                disabled={busyKey === plan.key}
                onClick={() => handlePack(plan.key)}
              >
                {busyKey === plan.key ? <Loader2 className="h-4 w-4 animate-spin" /> : `Subscribe ${plan.label}`}
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-white mb-4">À la carte credit packs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {packs.map((pack) => (
            <div key={pack.key} className="rounded-2xl border border-[#312839] bg-[#0d0d10]/75 backdrop-blur-md p-5">
              <p className="font-bold text-white">{pack.label}</p>
              <p className="text-2xl font-bold text-white mt-2">${pack.price}</p>
              <Button
                className="btn-gradient w-full mt-4"
                disabled={busyKey === pack.key}
                onClick={() => handlePack(pack.key)}
              >
                {busyKey === pack.key ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buy pack'}
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-white mb-4">Recent activity</h2>
        <div className="rounded-2xl border border-[#312839] bg-[#0d0d10]/75 backdrop-blur-md divide-y divide-white/5">
          {(data?.recentTransactions ?? []).length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No credit activity yet.</p>
          ) : (
            data!.recentTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="text-white">{tx.reason}</p>
                  <p className="text-xs text-slate-500">{new Date(tx.createdAt).toLocaleString()}</p>
                </div>
                <span className={tx.amount >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                  {tx.amount >= 0 ? '+' : ''}{tx.amount}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <Button variant="ghost" className="text-slate-400" onClick={() => setCurrentView('dashboard')}>
        ← Back to dashboard
      </Button>
    </div>
  );
}

export function ExportHubView() {
  const { setSelectedBookId } = useAppStore();
  const [books, setBooks] = useState<BookData[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    listBooks().then(setBooks);
  }, []);

  const handleExport = async (bookId: string, format: string) => {
    const key = `${bookId}:${format}`;
    setBusy(key);
    const result = await exportBook(bookId, format);
    if (result.success && result.data?.downloadUrl) {
      window.open(result.data.downloadUrl, '_blank');
    } else {
      toast({ title: 'Export failed', description: result.error || 'Try again from the book page.', variant: 'destructive' });
    }
    setBusy(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Download className="h-6 w-6 text-blue-400" /> Export Hub
        </h1>
        <p className="text-slate-400 mt-1">Download PDF, EPUB, or DOCX for any book in your library.</p>
      </div>
      {books.length === 0 ? (
        <p className="text-slate-500">Create a book first, then export it here.</p>
      ) : (
        <div className="space-y-3">
          {books.map((book) => (
            <div key={book.id} className="rounded-2xl border border-[#312839] bg-[#0d0d10]/75 backdrop-blur-md p-5 flex flex-col md:flex-row md:items-center gap-4">
              <button className="flex-1 text-left" onClick={() => setSelectedBookId(book.id)}>
                <p className="font-semibold text-white">{book.title}</p>
                <p className="text-xs text-slate-500 capitalize">{book.genre} · {book.status}</p>
              </button>
              <div className="flex gap-2">
                {(['pdf', 'epub', 'docx'] as const).map((format) => (
                  <Button
                    key={format}
                    variant="outline"
                    className="border-[#312839] text-slate-200 uppercase"
                    disabled={busy === `${book.id}:${format}`}
                    onClick={() => handleExport(book.id, format)}
                  >
                    {busy === `${book.id}:${format}` ? <Loader2 className="h-4 w-4 animate-spin" /> : format}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminView() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminData().then((result) => {
      if (!result) setError('Admin access required.');
      else setData(result);
    });
  }, []);

  if (error) {
    return <p className="text-red-400">{error}</p>;
  }
  if (!data) {
    return <Loader2 className="h-6 w-6 animate-spin text-purple-400" />;
  }

  const { analytics, jobs } = data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2">
        <Shield className="h-6 w-6 text-red-400" /> Admin
      </h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStat label="Users" value={analytics.totalUsers} />
        <AdminStat label="Books" value={analytics.totalBooks} />
        <AdminStat label="Completed" value={analytics.completedBooks} />
        <AdminStat label="Credits used" value={analytics.totalCreditsConsumed} />
      </div>
      <div className="grid grid-cols-4 gap-3 text-center">
        {Object.entries(analytics.jobStats).map(([k, v]) => (
          <div key={k} className="rounded-xl border border-[#312839] bg-[#0d0d10]/75 backdrop-blur-md p-3">
            <p className="text-xs text-slate-500 uppercase">{k}</p>
            <p className="text-xl font-bold text-white">{v}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-[#312839] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0d0d10]/75 backdrop-blur-md text-slate-400">
            <tr>
              <th className="text-left p-3">Job</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Owner</th>
              <th className="text-left p-3">Progress</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-t border-white/5">
                <td className="p-3 text-white">{job.jobType}{job.book ? ` · ${job.book.title}` : ''}</td>
                <td className="p-3 text-slate-300">{job.status}</td>
                <td className="p-3 text-slate-400">{job.owner?.email}</td>
                <td className="p-3 text-slate-400">{job.progressPercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#312839] bg-[#0d0d10]/75 backdrop-blur-md p-4">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value.toLocaleString()}</p>
    </div>
  );
}

type Listing = {
  id: string;
  title: string;
  author: string;
  description: string;
  price: number;
  format: string;
  fileUrl?: string | null;
};

export function BookstoreView() {
  const [mine, setMine] = useState<Listing[]>([]);
  const [market, setMarket] = useState<Listing[]>([]);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [price, setPrice] = useState('9.99');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [a, b] = await Promise.all([
      fetch('/api/bookstore/listings?scope=mine').then((r) => r.json()),
      fetch('/api/bookstore/listings?scope=market').then((r) => r.json()),
    ]);
    if (a.success) setMine(a.data);
    if (b.success) setMarket(b.data);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) {
      toast({ title: 'Title and file are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const form = new FormData();
    form.append('title', title.trim());
    form.append('author', author.trim());
    form.append('price', price);
    form.append('format', 'ebook');
    form.append('file', file);
    const response = await fetch('/api/bookstore/listings', { method: 'POST', body: form });
    const result = await response.json();
    if (result.success) {
      toast({ title: 'Listed in the bookstore' });
      setTitle('');
      setAuthor('');
      setFile(null);
      await load();
    } else {
      toast({ title: 'Listing failed', description: result.error, variant: 'destructive' });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Store className="h-6 w-6 text-emerald-400" /> Bookstore
        </h1>
        <p className="text-slate-400 mt-1">List a finished book for sale, or browse community titles.</p>
      </div>

      <form onSubmit={handleCreate} className="rounded-2xl border border-[#312839] bg-[#0d0d10]/75 backdrop-blur-md p-6 space-y-4 max-w-xl">
        <h2 className="font-bold text-white">New listing</h2>
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-black border-[#312839] text-white" />
        </div>
        <div className="space-y-1.5">
          <Label>Author</Label>
          <Input value={author} onChange={(e) => setAuthor(e.target.value)} className="bg-black border-[#312839] text-white" />
        </div>
        <div className="space-y-1.5">
          <Label>Price (USD)</Label>
          <Input value={price} onChange={(e) => setPrice(e.target.value)} className="bg-black border-[#312839] text-white" />
        </div>
        <div className="space-y-1.5">
          <Label>File (PDF, EPUB, DOCX…)</Label>
          <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="bg-black border-[#312839] text-white" />
        </div>
        <Button type="submit" className="btn-gradient" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Publish listing'}
        </Button>
      </form>

      <ListingGrid title="Your listings" items={mine} />
      <ListingGrid title="Marketplace" items={market} />
    </div>
  );
}

function ListingGrid({ title, items }: { title: string; items: Listing[] }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-white mb-3">{title}</h2>
      {items.length === 0 ? (
        <p className="text-slate-500 text-sm">Nothing here yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-[#312839] bg-[#0d0d10]/75 backdrop-blur-md p-5">
              <p className="font-semibold text-white">{item.title}</p>
              <p className="text-xs text-slate-500 mt-1">{item.author || 'Unknown author'} · {item.format}</p>
              <p className="text-purple-300 font-bold mt-3">${item.price.toFixed(2)}</p>
              {item.fileUrl && (
                <a href={item.fileUrl} className="text-xs text-cyan-400 mt-2 inline-block" target="_blank" rel="noreferrer">
                  Open file
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


