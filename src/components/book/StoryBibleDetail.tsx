'use client';

import {
  ArrowLeft,
  Database,
  Edit,
  Info,
  Lock,
  Clock,
  Target,
  Trash2,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StoryBibleEntity } from '@/lib/api';
import { KIND_CONFIG, formatTimeAgo } from '@/components/book/story-bible-config';
import { toast } from '@/hooks/use-toast';

interface StoryBibleDetailProps {
  entity: StoryBibleEntity;
  bookTitle: string;
  onBack: () => void;
  onEdit: (entity: StoryBibleEntity) => void;
  onDelete: (entity: StoryBibleEntity) => void;
}

export default function StoryBibleDetail({
  entity,
  bookTitle,
  onBack,
  onEdit,
  onDelete,
}: StoryBibleDetailProps) {
  const cfg = KIND_CONFIG[entity.kind];
  const traits = entity.physicalTraits ?? { tags: [], notes: '' };
  const secrets = entity.secrets ?? { confidential: '', isPrivate: true };

  const handleExportLore = () => {
    try {
      const blob = new Blob([JSON.stringify(entity, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${entity.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.lore.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Lore exported', description: `${entity.name} saved as JSON.` });
    } catch {
      toast({ title: 'Export failed', description: 'Could not export lore.', variant: 'destructive' });
    }
  };

  return (
    <div>
      {/* Breadcrumb / back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300 transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Story Bible / {cfg.label} / <span className="text-white">{entity.name}</span>
      </button>

      {/* Profile header */}
      <div className="rounded-2xl border border-white/10 bg-[#0d0d10] p-6 md:p-8">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
          <div className="relative shrink-0">
            <div className="w-36 h-36 rounded-2xl border-2 border-cyan-500 shadow-[0_0_20px_rgba(34,211,238,0.4)] bg-gradient-to-br from-[#101f22] to-[#0a1416] overflow-hidden flex items-center justify-center">
              {entity.portraitUrl ? (
                <img src={entity.portraitUrl} alt={entity.name} className="w-full h-full object-cover" />
              ) : (
                <cfg.icon className="h-14 w-14 text-cyan-500/50" />
              )}
            </div>
            <span className="absolute -bottom-2 right-2 bg-cyan-500 text-black px-2 py-0.5 rounded text-[10px] font-bold tracking-tighter uppercase">
              Verified AI
            </span>
          </div>

          <div className="flex-1 text-center md:text-left min-w-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
              <div>
                <h2 className="text-3xl font-bold tracking-tight text-white mb-1">{entity.name}</h2>
                <div className="flex items-center gap-3 justify-center md:justify-start flex-wrap">
                  <span className="px-2 py-0.5 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded text-xs font-bold uppercase tracking-widest">
                    {entity.role || cfg.singular}
                  </span>
                  <span className="text-white/40 text-sm flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Updated {formatTimeAgo(entity.updatedAt)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 justify-center flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => onEdit(entity)}
                  className="border-[#312839] text-slate-300 hover:bg-white/5"
                >
                  <Edit className="h-4 w-4 mr-2" /> Edit Profile
                </Button>
                <Button onClick={handleExportLore} className="btn-gradient">
                  <Database className="h-4 w-4 mr-2" /> Export Lore
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(entity)}
                  className="text-slate-500 hover:text-red-400 hover:bg-white/5"
                  title="Delete profile"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {entity.summary && (
              <p className="text-white/60 max-w-2xl text-base md:text-lg leading-relaxed">{entity.summary}</p>
            )}
          </div>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Motivation */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">{cfg.motivationLabel}</h3>
          </div>
          <div className="bg-[#101f22] border border-white/10 p-5 rounded-xl">
            <textarea
              readOnly
              value={entity.motivation || 'No details recorded yet.'}
              className="w-full bg-transparent border-none p-0 text-white/80 focus:ring-0 resize-none min-h-[120px] leading-relaxed text-sm"
            />
          </div>
        </div>

        {/* Physical traits */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">{cfg.physicalLabel}</h3>
          </div>
          <div className="bg-[#101f22] border border-white/10 p-5 rounded-xl">
            {traits.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-4">
                {traits.tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-cyan-500/15 text-cyan-300 px-3 py-1 rounded-full text-xs font-semibold border border-cyan-500/30"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-white/30 text-xs mb-4 italic">No traits tagged yet.</p>
            )}
            <textarea
              readOnly
              value={traits.notes || 'No additional details recorded.'}
              className="w-full bg-transparent border-none p-0 text-white/80 focus:ring-0 resize-none min-h-[60px] text-sm leading-relaxed"
            />
          </div>
        </div>

        {/* Long description */}
        {entity.description && (
          <div className="md:col-span-2 space-y-2">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">About</h3>
            </div>
            <div className="bg-[#101f22] border border-white/10 p-5 rounded-xl">
              <p className="text-white/80 leading-relaxed text-sm whitespace-pre-wrap">{entity.description}</p>
            </div>
          </div>
        )}

        {/* Secrets (special accent) */}
        <div className="md:col-span-2 space-y-2">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Secrets &amp; Hidden Lore</h3>
          </div>
          <div className="relative overflow-hidden rounded-xl border border-purple-500/30 bg-gradient-to-br from-[#101f22] to-[#1a1022] p-6">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
              <Lock className="h-28 w-28 text-purple-500" />
            </div>
            <textarea
              readOnly
              value={secrets.confidential || 'No confidential lore recorded.'}
              className="relative w-full bg-black/40 border border-purple-500/20 rounded-lg p-4 text-white/80 focus:ring-0 resize-none min-h-[100px] leading-relaxed text-sm"
            />
            <p className="relative mt-2 text-[10px] text-purple-400/60 italic font-medium flex items-center gap-1">
              <Info className="h-3 w-3" />
              {secrets.isPrivate
                ? 'Used by the AI to maintain narrative tension — not disclosed to readers early.'
                : 'Not marked as private — readers may eventually see this.'}
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-600 mt-6">
        {bookTitle} · Story Bible entity · Last updated {new Date(entity.updatedAt).toLocaleString()}
      </p>
    </div>
  );
}
