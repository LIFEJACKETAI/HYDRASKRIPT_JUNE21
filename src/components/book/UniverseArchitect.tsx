'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  Settings,
  Plus,
  RefreshCw,
  User,
  MapPin,
  Package,
  Sparkles,
  ScrollText,
  BookOpen,
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  AlertOctagon,
  FileText,
  Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAppStore } from '@/lib/store';
import { listBooks, listStoryBibleEntities } from '@/lib/api';
import type { BookData, StoryBibleEntity, StoryBibleKind } from '@/lib/api';
import { KIND_CONFIG } from '@/components/book/story-bible-config';
import EditorialReviewPanel from '@/components/book/EditorialReviewPanel';

type Severity = 'critical' | 'warning' | 'info';

interface UniverseOccurrence {
  book: BookData;
  entity: StoryBibleEntity;
}

interface UniverseEntry {
  key: string;
  name: string;
  kind: StoryBibleKind;
  occurrences: UniverseOccurrence[];
  volumes: number;
  universal: boolean;
}

interface Conflict {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  entityName: string;
  books: string[];
}

const SECTION_META: Record<StoryBibleKind, { label: string; icon: React.ElementType; accent: string }> = {
  CHARACTER: { label: 'Universal Characters', icon: User, accent: 'text-cyan-400' },
  LOCATION: { label: 'Persistent Locations', icon: MapPin, accent: 'text-blue-400' },
  OBJECT: { label: 'Shared Objects', icon: Package, accent: 'text-amber-400' },
  THEME: { label: 'Core Lore', icon: Sparkles, accent: 'text-pink-400' },
  HISTORY: { label: 'Core Lore', icon: ScrollText, accent: 'text-emerald-400' },
};

const KIND_PICKER: Record<StoryBibleKind, StoryBibleKind> = {
  CHARACTER: 'CHARACTER',
  LOCATION: 'LOCATION',
  OBJECT: 'OBJECT',
  THEME: 'THEME',
  HISTORY: 'THEME',
};

function normalizeText(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a: string, b: string): number {
  const wa = new Set(normalizeText(a).split(' ').filter((w) => w.length > 1));
  const wb = new Set(normalizeText(b).split(' ').filter((w) => w.length > 1));
  if (!wa.size && !wb.size) return 1;
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.max(1, Math.min(wa.size, wb.size));
}

function tagsEqual(a: string[], b: string[]): boolean {
  const sa = new Set(a.map((t) => t.toLowerCase()));
  const sb = new Set(b.map((t) => t.toLowerCase()));
  if (sa.size !== sb.size) return false;
  for (const t of sa) if (!sb.has(t)) return false;
  return true;
}

function buildUniverse(books: BookData[], entitiesByBook: Record<string, StoryBibleEntity[]>): UniverseEntry[] {
  const grouped = new Map<string, UniverseOccurrence[]>();
  for (const book of books) {
    const entities = entitiesByBook[book.id] ?? [];
    for (const entity of entities) {
      const key = normalizeText(entity.name);
      if (!key) continue;
      const list = grouped.get(key) ?? [];
      list.push({ book, entity });
      grouped.set(key, list);
    }
  }
  const entries: UniverseEntry[] = [];
  for (const [key, occurrences] of grouped) {
    const first = occurrences[0].entity;
    const volumes = new Set(occurrences.map((o) => o.book.id)).size;
    entries.push({
      key,
      name: first.name,
      kind: first.kind,
      occurrences,
      volumes,
      universal: volumes > 1,
    });
  }
  return entries.sort((a, b) => Number(b.universal) - Number(a.universal) || b.volumes - a.volumes || a.name.localeCompare(b.name));
}

function computeConflicts(entries: UniverseEntry[]): Conflict[] {
  const conflicts: Conflict[] = [];
  let seq = 0;
  for (const entry of entries) {
    const occ = entry.occurrences;
    let entryConflicts = 0;

    const roles = new Set(occ.map((o) => normalizeText(o.entity.role)).filter(Boolean));
    if (roles.size > 1) {
      entryConflicts++;
      conflicts.push({
        id: `role-${seq++}`,
        severity: 'warning',
        title: 'Role Inconsistency',
        description: `"${entry.name}" is described as "${occ[0].entity.role || '—'}" in ${occ[0].book.title}, but as "${occ[occ.length - 1].entity.role || '—'}" in ${occ[occ.length - 1].book.title}.`,
        entityName: entry.name,
        books: occ.map((o) => o.book.title),
      });
    }

    const descs = occ
      .filter((o) => (o.entity.description || o.entity.summary || '').trim().length > 20)
      .map((o) => ({ book: o.book, text: o.entity.description || o.entity.summary }));
    if (descs.length >= 2) {
      let minSim = 1;
      for (let i = 0; i < descs.length; i++) {
        for (let j = i + 1; j < descs.length; j++) {
          minSim = Math.min(minSim, similarity(descs[i].text, descs[j].text));
        }
      }
      if (minSim < 0.35) {
        entryConflicts++;
        conflicts.push({
          id: `desc-${seq++}`,
          severity: 'critical',
          title: 'Description Contradiction',
          description: `Profiles for "${entry.name}" differ significantly across ${descs.length} books. The canonical description has drifted between volumes.`,
          entityName: entry.name,
          books: descs.map((d) => d.book.title),
        });
      }
    }

    const traitGroups = occ
      .filter((o) => o.entity.physicalTraits?.tags?.length)
      .map((o) => ({ book: o.book, tags: o.entity.physicalTraits.tags }));
    if (traitGroups.length >= 2) {
      let mismatch = false;
      for (let i = 1; i < traitGroups.length && !mismatch; i++) {
        if (!tagsEqual(traitGroups[0].tags, traitGroups[i].tags)) mismatch = true;
      }
      if (mismatch) {
        entryConflicts++;
        conflicts.push({
          id: `traits-${seq++}`,
          severity: 'warning',
          title: 'Traits Mismatch',
          description: `Physical trait tags for "${entry.name}" are not identical across volumes (${traitGroups.map((t) => t.book.title).join(', ')}).`,
          entityName: entry.name,
          books: traitGroups.map((t) => t.book.title),
        });
      }
    }

    if (entryConflicts === 0 && entry.universal) {
      conflicts.push({
        id: `sync-${seq++}`,
        severity: 'info',
        title: 'Entity Synchronized',
        description: `"${entry.name}" is consistent across ${entry.volumes} volume${entry.volumes === 1 ? '' : 's'}.`,
        entityName: entry.name,
        books: occ.map((o) => o.book.title),
      });
    }
  }
  return conflicts;
}

function polar(cx: number, cy: number, radius: number, angle: number) {
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

export default function UniverseArchitect() {
  const { setCurrentView, setStoryBibleBookId } = useAppStore();

  const [books, setBooks] = useState<BookData[]>([]);
  const [entitiesByBook, setEntitiesByBook] = useState<Record<string, StoryBibleEntity[]>>({});
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const reload = useCallback(async () => {
    setScanning(true);
    try {
      const data = await listBooks();
      const results = await Promise.all(
        data.map(async (book) => {
          const res = await listStoryBibleEntities(book.id);
          return [book.id, res.data ?? []] as const;
        })
      );
      const map: Record<string, StoryBibleEntity[]> = {};
      for (const [id, entities] of results) map[id] = entities;
      setBooks(data);
      setEntitiesByBook(map);
      setSelectedKey(null);
    } finally {
      setScanning(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const universe = useMemo(() => buildUniverse(books, entitiesByBook), [books, entitiesByBook]);
  const conflicts = useMemo(() => computeConflicts(universe), [universe]);
  const activeConflicts = conflicts.filter((c) => c.severity !== 'info');
  const universalCount = universe.filter((e) => e.universal).length;
  const totalEntities = Object.values(entitiesByBook).reduce((sum, list) => sum + list.length, 0);

  const filtered = useMemo(() => {
    const q = normalizeText(searchTerm);
    if (!q) return universe;
    return universe.filter((e) => normalizeText(e.name).includes(q));
  }, [universe, searchTerm]);

  const sections = useMemo(() => {
    const order: StoryBibleKind[] = ['CHARACTER', 'LOCATION', 'THEME', 'OBJECT'];
    return order
      .map((kind) => ({
        kind,
        entries: filtered.filter((e) => KIND_PICKER[e.kind] === kind),
      }))
      .filter((s) => s.entries.length > 0);
  }, [filtered]);

  const graphBooks = useMemo(() => books.slice(0, 8), [books]);
  const graphEntities = useMemo(() => universe.slice(0, 12), [universe]);

  const nodePos = useMemo(() => {
    const cx = 50;
    const cy = 46;
    const bookPos: Record<string, { x: number; y: number }> = {};
    graphBooks.forEach((book, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, graphBooks.length) - Math.PI / 2;
      bookPos[book.id] = polar(cx, cy, 22, angle);
    });
    const entityPos: Record<string, { x: number; y: number }> = {};
    graphEntities.forEach((entry, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, graphEntities.length) - Math.PI / 2 + Math.PI / 6;
      entityPos[entry.key] = polar(cx, cy, 40, angle);
    });
    return { bookPos, entityPos };
  }, [graphBooks, graphEntities]);

  const consistency = activeConflicts.length === 0 ? 100 : Math.max(0, 100 - (activeConflicts.filter((c) => c.severity === 'critical').length * 20 + activeConflicts.filter((c) => c.severity === 'warning').length * 8));

  const selectedEntry = universe.find((e) => e.key === selectedKey) ?? null;

  const kindIcon = (kind: StoryBibleKind) => KIND_CONFIG[kind]?.icon ?? User;
  const kindAccent = (kind: StoryBibleKind) => SECTION_META[kind]?.accent ?? 'text-slate-400';

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Menu className="h-6 w-6 text-cyan-400" /> Universe & Series Architect
            </h1>
            <p className="text-sm text-slate-400 mt-1">Scanning your library for shared entities and conflicts...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-6">
          <Skeleton className="h-[480px] rounded-2xl" />
          <Skeleton className="h-[480px] rounded-2xl" />
          <Skeleton className="h-[480px] rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Menu className="h-6 w-6 text-cyan-400" /> Universe & Series Architect
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {books.length === 0
              ? 'Create books to start building a shared universe.'
              : `${books.length} volume${books.length === 1 ? '' : 's'} connected · ${totalEntities} lore record${totalEntities === 1 ? '' : 's'} · ${universalCount} universal`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search universe..."
              className="bg-[#0d0d10] border border-[#312839] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 w-56"
            />
          </div>
          <Button variant="outline" size="icon" onClick={reload} disabled={scanning} title="Sync Universe" className="border-[#312839] text-slate-300 hover:bg-white/5">
            <RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" size="icon" title="Settings" className="border-[#312839] text-slate-300 hover:bg-white/5">
            <Settings className="h-4 w-4" />
          </Button>
          <Button onClick={() => setCurrentView('create-book')} className="btn-gradient">
            <Plus className="h-4 w-4 mr-2" /> New Volume
          </Button>
        </div>
      </div>

      {/* 3-column workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-6">
        {/* ── Left: Shared Entities ─────────────────────────────────────── */}
        <div className="rounded-2xl bg-[#0d0d10] border border-[#312839] flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[#312839]">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Universe Entities</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Every character, place & lore entry across your volumes
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-5 min-h-[320px]">
            {books.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <BookOpen className="h-8 w-8 text-slate-700 mb-3" />
                <p className="text-sm text-slate-500">No books yet. Create a volume to begin building your universe.</p>
                <Button onClick={() => setCurrentView('create-book')} className="btn-gradient mt-4">
                  <Plus className="h-4 w-4 mr-2" /> Create a Book
                </Button>
              </div>
            ) : sections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <Sparkles className="h-8 w-8 text-slate-700 mb-3" />
                <p className="text-sm text-slate-500">
                  {universe.length === 0
                    ? 'No story bible entities yet. Upload a manuscript in the Story Bible to auto-populate the universe, or add profiles manually.'
                    : 'No entities match your search.'}
                </p>
              </div>
            ) : (
              sections.map((section) => {
                const Meta = SECTION_META[section.kind];
                const Icon = Meta.icon;
                return (
                  <div key={section.kind}>
                    <button className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-400/80">
                      <span>{Meta.label}</span>
                      <span className="text-slate-600">{section.entries.length}</span>
                    </button>
                    <div className="space-y-1 mt-1">
                      {section.entries.map((entry) => {
                        const isSelected = selectedKey === entry.key;
                        return (
                          <button
                            key={entry.key}
                            onClick={() => setSelectedKey(isSelected ? null : entry.key)}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg w-full text-left transition-all ${
                              isSelected
                                ? 'bg-cyan-500/10 border border-cyan-500/40'
                                : 'bg-white/5 border border-white/5 hover:border-cyan-500/30'
                            }`}
                          >
                            <Icon className={`h-4 w-4 ${kindAccent(entry.kind)} shrink-0`} />
                            <span className="flex-1 min-w-0">
                              <span className="flex items-center gap-1.5">
                                <span className="block text-sm font-medium text-white truncate">{entry.name}</span>
                                {entry.universal && (
                                  <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-teal-500/15 border border-teal-500/40 text-teal-300">
                                    Universal
                                  </span>
                                )}
                              </span>
                              <span className="block text-[10px] text-slate-500 truncate">
                                {entry.occurrences[0].entity.role || KIND_CONFIG[entry.kind]?.singular || 'Entity'} · {entry.volumes} Volume{entry.volumes === 1 ? '' : 's'}
                              </span>
                            </span>
                            {entry.universal ? (
                              <CheckCircle className="h-3.5 w-3.5 text-green-400 opacity-60 shrink-0" />
                            ) : (
                              <span className="w-3.5 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="p-3 border-t border-[#312839]">
            <Button onClick={reload} disabled={scanning} className="w-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20">
              <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? 'animate-spin' : ''}`} /> Sync Universe
            </Button>
          </div>
        </div>

        {/* ── Center: Knowledge Graph ───────────────────────────────────── */}
        <div className="rounded-2xl bg-[#0d0d10] border border-[#312839] overflow-hidden flex flex-col">
          <div className="relative h-[420px] bg-[radial-gradient(circle_at_center,#1a2d31_0%,#0a0a0d_100%)]">
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#13c8ec 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }} />
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 92" preserveAspectRatio="none">
              {graphEntities.map((entry) => {
                const pos = nodePos.entityPos[entry.key];
                if (!pos) return null;
                return (
                  <line
                    key={`c-${entry.key}`}
                    x1="50" y1="46" x2={pos.x} y2={pos.y}
                    stroke="#13c8ec" strokeOpacity="0.35" strokeWidth="0.6" strokeDasharray="2 2"
                  />
                );
              })}
              {graphBooks.map((book) => {
                const pos = nodePos.bookPos[book.id];
                if (!pos) return null;
                return (
                  <line key={`c-b-${book.id}`} x1="50" y1="46" x2={pos.x} y2={pos.y} stroke="#13c8ec" strokeOpacity="0.6" strokeWidth="0.8" />
                );
              })}
              {graphBooks.map((book) => {
                const pos = nodePos.bookPos[book.id];
                if (!pos) return null;
                return universe
                  .filter((entry) => entry.occurrences.some((o) => o.book.id === book.id))
                  .map((entry) => {
                    const epos = nodePos.entityPos[entry.key];
                    if (!epos) return null;
                    return (
                      <line
                        key={`link-${book.id}-${entry.key}`}
                        x1={pos.x} y1={pos.y} x2={epos.x} y2={epos.y}
                        stroke="#13c8ec" strokeOpacity="0.18" strokeWidth="0.5"
                      />
                    );
                  });
              })}
            </svg>

            {/* Central node */}
            <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center pointer-events-none">
              <div className="w-20 h-20 rounded-full bg-[#13c8ec] flex items-center justify-center shadow-[0_0_24px_rgba(19,200,236,0.5)] border-4 border-[#0a0a0d]">
                <BookOpen className="h-8 w-8 text-[#101f22]" />
              </div>
              <div className="mt-2 bg-black/70 backdrop-blur px-4 py-1.5 rounded-full border border-cyan-500/40">
                <span className="text-xs font-bold text-white tracking-wide">GLOBAL STORY BIBLE</span>
              </div>
            </div>

            {/* Book nodes */}
            {graphBooks.map((book, i) => {
              const pos = nodePos.bookPos[book.id];
              if (!pos) return null;
              return (
                <button
                  key={book.id}
                  onClick={() => {
                    setStoryBibleBookId(book.id);
                    setCurrentView('story-bible');
                  }}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center group cursor-pointer"
                >
                  <span className={`w-14 h-14 rounded-xl bg-white/5 backdrop-blur flex items-center justify-center border transition-all group-hover:scale-110 ${i === 1 ? 'border-cyan-500/60 shadow-[0_0_16px_rgba(19,200,236,0.35)]' : 'border-white/15 hover:border-cyan-500'}`}>
                    <BookOpen className={`h-6 w-6 ${i === 1 ? 'text-cyan-300' : 'text-slate-400 group-hover:text-cyan-300'}`} />
                  </span>
                  <span className="mt-1.5 max-w-[120px] text-[10px] font-medium text-slate-400 group-hover:text-white uppercase tracking-tighter text-center leading-tight">
                    {book.title}
                  </span>
                </button>
              );
            })}

            {/* Entity nodes */}
            {graphEntities.map((entry) => {
              const pos = nodePos.entityPos[entry.key];
              if (!pos) return null;
              const Icon = kindIcon(entry.kind);
              return (
                <button
                  key={entry.key}
                  onClick={() => setSelectedKey(selectedKey === entry.key ? null : entry.key)}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center group cursor-pointer"
                >
                  <span className={`w-10 h-10 rounded-full bg-white/5 backdrop-blur flex items-center justify-center border transition-all group-hover:scale-110 ${selectedKey === entry.key ? 'border-cyan-400 bg-cyan-500/15' : 'border-white/15 hover:border-cyan-500'}`}>
                    <Icon className={`h-4 w-4 ${kindAccent(entry.kind)}`} />
                  </span>
                  <span className="mt-1 max-w-[110px] text-[9px] font-medium text-slate-500 group-hover:text-white uppercase tracking-tighter text-center leading-tight">
                    {entry.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Selected entity detail */}
          {selectedEntry && (
            <div className="border-t border-[#312839] p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Character Arc Link</h4>
                <span className="text-[10px] text-slate-500">{selectedEntry.volumes} volume{selectedEntry.volumes === 1 ? '' : 's'}</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-400">
                <span className="text-white font-medium">{selectedEntry.name}</span>
                {' '}appears in {selectedEntry.occurrences.map((o) => o.book.title).join(', ')}.
                {selectedEntry.occurrences[0].entity.summary && (
                  <> {selectedEntry.occurrences[0].entity.summary}</>
                )}
              </p>
              {selectedEntry.occurrences.length > 1 && (
                <div className="mt-3 h-1 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-400" style={{ width: `${Math.min(100, selectedEntry.volumes * 33)}%` }} />
                </div>
              )}
              <p className="mt-1 text-[9px] text-slate-500 uppercase tracking-wider">
                Arc Completion: {Math.min(100, selectedEntry.volumes * 33)}%
              </p>
            </div>
          )}
        </div>

        {/* ── Right: Continuity Conflicts ───────────────────────────────── */}
        <div className="rounded-2xl bg-[#0d0d10] border border-[#312839] flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[#312839]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Continuity Conflicts</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${activeConflicts.length > 0 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/15 text-green-400'}`}>
                {activeConflicts.length} Alert{activeConflicts.length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Real-time universe scan active</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[320px]">
            {books.length === 0 ? (
              <div className="text-center py-16">
                <FileText className="h-8 w-8 text-slate-700 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Nothing to scan yet.</p>
              </div>
            ) : activeConflicts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <CheckCircle className="h-10 w-10 text-green-400 mb-3" />
                <p className="text-sm font-semibold text-white">No conflicts detected</p>
                <p className="text-xs text-slate-500 mt-1 max-w-[220px]">Shared entities are consistent across all volumes.</p>
              </div>
            ) : (
              activeConflicts.map((conflict) => {
                const styles =
                  conflict.severity === 'critical'
                    ? { border: 'border-red-500/20', bg: 'bg-red-500/5 hover:bg-red-500/10', icon: AlertOctagon, color: 'text-red-400' }
                    : { border: 'border-amber-500/20', bg: 'bg-amber-500/5 hover:bg-amber-500/10', icon: AlertTriangle, color: 'text-amber-400' };
                const Icon = styles.icon;
                return (
                  <div key={conflict.id} className={`${styles.border} ${styles.bg} rounded-xl p-3 flex flex-col gap-2 transition-all`}>
                    <div className="flex items-start gap-3">
                      <Icon className={`h-4 w-4 ${styles.color} mt-0.5 shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xs font-bold text-white leading-tight">{conflict.title}</h3>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{conflict.description}</p>
                        {conflict.books.length > 0 && (
                          <p className="text-[9px] text-slate-600 mt-1.5 uppercase tracking-wider">
                            {conflict.books.join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <button className="text-[9px] font-bold uppercase bg-red-400/20 text-red-400 px-2 py-1 rounded hover:bg-red-400/30">Fix Now</button>
                      <button className="text-[9px] font-bold uppercase text-slate-500 px-2 py-1 rounded hover:text-white transition-colors">Ignore</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-4 border-t border-[#312839] bg-black/20">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all duration-500" style={{ width: `${Math.max(consistency, 4)}%` }} />
              </div>
              <span className="text-[10px] text-slate-400 font-bold">{consistency}% CONSISTENT</span>
            </div>
            <button
              onClick={() => setReportOpen(true)}
              className="w-full text-xs text-slate-400 font-medium py-2 hover:text-white transition-colors border border-[#312839] rounded-lg"
            >
              View Full Report
            </button>
          </div>
        </div>
      </div>

      {/* AI Editorial Review — LLM publishing-house editor pass */}
      <EditorialReviewPanel books={books} />

      {/* Full report dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="bg-[#0d0d10] border-[#312839] text-white max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-cyan-400" /> Universe Consistency Report
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {totalEntities} lore entit{totalEntities === 1 ? 'y' : 'ies'} · {universalCount} universal across {books.length} volume{books.length === 1 ? '' : 's'} · {consistency}% consistent
            </DialogDescription>
          </DialogHeader>
          {universe.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No entities to report on yet.</p>
          ) : (
            <div className="space-y-4">
              {universe.map((entry) => {
                const entryConflicts = conflicts.filter((c) => c.entityName === entry.name && c.severity !== 'info');
                return (
                  <div key={entry.key} className="rounded-xl bg-white/5 border border-white/10 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">{entry.name}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${entryConflicts.length === 0 ? 'bg-green-500/15 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {entryConflicts.length === 0 ? 'Consistent' : `${entryConflicts.length} issue${entryConflicts.length === 1 ? '' : 's'}`}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {KIND_CONFIG[entry.kind]?.label ?? entry.kind} · {entry.volumes} volume{entry.volumes === 1 ? '' : 's'} ·{' '}
                      {entry.occurrences.map((o) => o.book.title).join(', ')}
                    </p>
                    {entryConflicts.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {entryConflicts.map((c) => (
                          <li key={c.id} className="text-[11px] text-slate-400 flex items-start gap-1.5">
                            {c.severity === 'critical' ? (
                              <AlertOctagon className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />
                            ) : (
                              <AlertTriangle className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                            )}
                            {c.title}: {c.description}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
