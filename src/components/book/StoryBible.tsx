'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2, Pencil, Library, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
  listBooks,
  listStoryBibleEntities,
  deleteStoryBibleEntity,
  type BookData,
  type StoryBibleEntity,
  type StoryBibleKind,
} from '@/lib/api';
import {
  KIND_CONFIG,
  KIND_ORDER,
  formatTimeAgo,
  computeConsistency,
} from '@/components/book/story-bible-config';
import StoryBibleDetail from '@/components/book/StoryBibleDetail';
import StoryBibleEditor from '@/components/book/StoryBibleEditor';
import { toast } from '@/hooks/use-toast';

type EntityMap = Record<StoryBibleKind, StoryBibleEntity[]>;

const EMPTY_MAP: EntityMap = {
  CHARACTER: [],
  LOCATION: [],
  OBJECT: [],
  THEME: [],
  HISTORY: [],
};

function groupByKind(entities: StoryBibleEntity[]): EntityMap {
  const map: EntityMap = { CHARACTER: [], LOCATION: [], OBJECT: [], THEME: [], HISTORY: [] };
  for (const entity of entities) {
    const kind = KIND_ORDER.includes(entity.kind) ? entity.kind : 'CHARACTER';
    map[kind].push(entity);
  }
  return map;
}

export default function StoryBible() {
  const { selectedBookId, setStoryBibleBookId, setCurrentView } = useAppStore();

  const [books, setBooks] = useState<BookData[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [byKind, setByKind] = useState<EntityMap>(EMPTY_MAP);
  const [loading, setLoading] = useState(true);

  const [activeKind, setActiveKind] = useState<StoryBibleKind>('CHARACTER');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<StoryBibleEntity | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StoryBibleEntity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const currentBook = books.find((b) => b.id === selectedBookId) ?? null;

  // Load user's books once (needed for the book switcher).
  useEffect(() => {
    let cancelled = false;
    listBooks().then((data) => {
      if (cancelled) return;
      setBooks(data);
      setBooksLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!selectedBookId) {
      setByKind(EMPTY_MAP);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await listStoryBibleEntities(selectedBookId);
    setByKind(result.data ? groupByKind(result.data) : EMPTY_MAP);
    setLoading(false);
  }, [selectedBookId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Clear selection when switching between kinds.
  const handleKindChange = (kind: StoryBibleKind) => {
    setActiveKind(kind);
    setSelectedId(null);
  };

  const handleSaved = () => {
    setEditorOpen(false);
    setEditingEntity(null);
    reload();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteStoryBibleEntity(deleteTarget.id);
    setDeleting(false);
    if (result.success) {
      toast({ title: 'Profile deleted', description: deleteTarget.name });
      setDeleteTarget(null);
      setSelectedId(null);
      reload();
    } else {
      toast({ title: 'Delete failed', description: result.error || 'Unknown error', variant: 'destructive' });
    }
  };

  const entities = byKind[activeKind];
  const cfg = KIND_CONFIG[activeKind];
  const selected = entities.find((e) => e.id === selectedId) ?? null;
  const totalEntities = KIND_ORDER.reduce((sum, kind) => sum + byKind[kind].length, 0);
  const consistency = computeConsistency(KIND_ORDER.flatMap((kind) => byKind[kind]));

  // ── No book selected → book picker ──────────────────────────────────────────
  if (!selectedBookId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Library className="h-6 w-6 text-cyan-400" /> Story Bible
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              The canonical lore store the AI reads while writing. Pick a book to manage its profiles.
            </p>
          </div>
        </div>

        {booksLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        ) : books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl bg-[#0d0d10] border border-[#312839]">
            <div className="w-20 h-20 rounded-2xl bg-[#151118] border border-[#312839] flex items-center justify-center mb-5">
              <BookOpen className="h-9 w-9 text-slate-600" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">No books yet</h3>
            <p className="text-sm text-slate-500 max-w-xs">
              Create a book first, then build its story bible.
            </p>
            <Button onClick={() => setCurrentView('create-book')} className="btn-gradient mt-6">
              <Plus className="h-4 w-4 mr-2" /> Create a Book
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Select a book</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {books.map((book) => (
                <button
                  key={book.id}
                  onClick={() => setStoryBibleBookId(book.id)}
                  className="group text-left rounded-2xl bg-[#0d0d10] border border-[#312839] p-5 hover:border-cyan-500/40 transition-all card-hover"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-16 rounded-lg bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center shrink-0">
                      <BookOpen className="h-5 w-5 text-purple-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white truncate group-hover:text-cyan-300 transition-colors">
                        {book.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 capitalize">
                        {book.genre} · {book.chapters?.length ?? 0} chapters
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Detail view ─────────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div>
        <StoryBibleDetail
          entity={selected}
          bookTitle={currentBook?.title ?? 'Book'}
          onBack={() => setSelectedId(null)}
          onEdit={(entity) => {
            setEditingEntity(entity);
            setEditorOpen(true);
          }}
          onDelete={(entity) => setDeleteTarget(entity)}
        />
        <StoryBibleEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          bookId={selectedBookId}
          kind={selected.kind}
          entity={editingEntity}
          onSaved={handleSaved}
        />
        <DeleteDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          entityName={deleteTarget?.name ?? ''}
          deleting={deleting}
          onConfirm={handleDelete}
        />
      </div>
    );
  }

  // ── List view ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Library className="h-6 w-6 text-cyan-400" /> Story Bible
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {currentBook ? (
              <>
                Building lore for{' '}
                <span className="text-cyan-300 font-medium">{currentBook.title}</span> · {totalEntities} entities
              </>
            ) : (
              'Select a book to manage its lore.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedBookId}
            onChange={(e) => setStoryBibleBookId(e.target.value || null)}
            className="bg-[#0d0d10] border border-[#312839] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50 max-w-[220px]"
            aria-label="Switch book"
          >
            {books.map((book) => (
              <option key={book.id} value={book.id} className="bg-[#0d0d10]">
                {book.title}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="icon"
            onClick={reload}
            title="Refresh"
            className="border-[#312839] text-slate-300 hover:bg-white/5"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => { setEditingEntity(null); setEditorOpen(true); }} className="btn-gradient">
            <Plus className="h-4 w-4 mr-2" /> Add {cfg.singular}
          </Button>
        </div>
      </div>

      {/* Consistency bar */}
      <div className="rounded-2xl bg-[#0d0d10] border border-[#312839] px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Lore Consistency</p>
          <p className="text-xs text-cyan-300 font-bold">{consistency}%</p>
        </div>
        <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-gradient-to-r from-purple-500 to-cyan-400 h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.max(consistency, 4)}%` }}
          />
        </div>
        <p className="text-[10px] mt-2 text-white/40">
          {totalEntities === 0
            ? 'Add profiles to start tracking lore consistency.'
            : 'Based on how complete each profile is across summary, motivation, description, traits, and secrets.'}
        </p>
      </div>

      {/* Kind tabs */}
      <div className="flex flex-wrap gap-2">
        {KIND_ORDER.map((kind) => {
          const kc = KIND_CONFIG[kind];
          const count = byKind[kind].length;
          const isActive = kind === activeKind;
          return (
            <button
              key={kind}
              onClick={() => handleKindChange(kind)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                isActive
                  ? 'bg-white/10 border border-cyan-500/40 text-white'
                  : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <kc.icon className={`h-4 w-4 ${isActive ? kc.accent : ''}`} />
              {kc.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/5 text-slate-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : entities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl bg-[#0d0d10] border border-[#312839]">
          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${cfg.gradient} opacity-60 flex items-center justify-center mb-5`}>
            <cfg.icon className="h-7 w-7 text-white" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">{cfg.emptyTitle}</h3>
          <p className="text-sm text-slate-500 max-w-xs mb-6">{cfg.emptyDesc}</p>
          <Button onClick={() => { setEditingEntity(null); setEditorOpen(true); }} className="btn-gradient">
            <Plus className="h-4 w-4 mr-2" /> Add {cfg.singular}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {entities.map((entity) => (
            <div
              key={entity.id}
              onClick={() => setSelectedId(entity.id)}
              className="group relative cursor-pointer rounded-2xl bg-[#0d0d10] border border-[#312839] p-5 hover:border-cyan-500/40 transition-all card-hover"
            >
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shrink-0`}>
                  {entity.portraitUrl ? (
                    <img src={entity.portraitUrl} alt={entity.name} className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <cfg.icon className="h-6 w-6 text-white" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white truncate">{entity.name}</p>
                  <p className={`text-xs ${cfg.accent} mt-0.5 truncate`}>{entity.role || cfg.singular}</p>
                  {entity.summary && (
                    <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">{entity.summary}</p>
                  )}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[10px] text-slate-600">Updated {formatTimeAgo(entity.updatedAt)}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingEntity(entity); setEditorOpen(true); }}
                    className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-cyan-300 hover:bg-white/10 transition-colors"
                    aria-label={`Edit ${entity.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(entity); }}
                    className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-red-400 hover:bg-white/10 transition-colors"
                    aria-label={`Delete ${entity.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <StoryBibleEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        bookId={selectedBookId}
        kind={editingEntity?.kind ?? activeKind}
        entity={editingEntity}
        onSaved={handleSaved}
      />
      <DeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        entityName={deleteTarget?.name ?? ''}
        deleting={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityName: string;
  deleting: boolean;
  onConfirm: () => void;
}

function DeleteDialog({ open, onOpenChange, entityName, deleting, onConfirm }: DeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d0d10] border-[#312839] text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Delete profile</DialogTitle>
          <DialogDescription className="text-slate-400">
            Delete <span className="text-white font-semibold">{entityName}</span>? This removes it from the story
            bible permanently.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-[#312839] text-slate-300">
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
