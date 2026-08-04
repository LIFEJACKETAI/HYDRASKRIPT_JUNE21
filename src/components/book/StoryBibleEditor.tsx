'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  createStoryBibleEntity,
  updateStoryBibleEntity,
  type StoryBibleEntity,
  type StoryBibleKind,
} from '@/lib/api';
import { KIND_CONFIG } from '@/components/book/story-bible-config';
import { toast } from '@/hooks/use-toast';

interface StoryBibleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: string;
  kind: StoryBibleKind;
  entity: StoryBibleEntity | null;
  onSaved: () => void;
}

interface FormState {
  name: string;
  role: string;
  summary: string;
  portraitUrl: string;
  motivation: string;
  description: string;
  notes: string;
  confidential: string;
  isPrivate: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  role: '',
  summary: '',
  portraitUrl: '',
  motivation: '',
  description: '',
  notes: '',
  confidential: '',
  isPrivate: true,
};

export default function StoryBibleEditor({
  open,
  onOpenChange,
  bookId,
  kind,
  entity,
  onSaved,
}: StoryBibleEditorProps) {
  const cfg = KIND_CONFIG[kind];
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      entity
        ? {
            name: entity.name,
            role: entity.role,
            summary: entity.summary,
            portraitUrl: entity.portraitUrl ?? '',
            motivation: entity.motivation,
            description: entity.description,
            notes: entity.physicalTraits?.notes ?? '',
            confidential: entity.secrets?.confidential ?? '',
            isPrivate: entity.secrets?.isPrivate ?? true,
          }
        : EMPTY_FORM
    );
    setTags(entity?.physicalTraits?.tags ?? []);
    setTagInput('');
    setSaving(false);
  }, [open, entity]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const addTag = () => {
    const value = tagInput.trim();
    if (!value) return;
    if (!tags.includes(value)) setTags((prev) => [...prev, value]);
    setTagInput('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name required', description: 'Give this entity a name.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      kind,
      name: form.name.trim(),
      role: form.role.trim(),
      summary: form.summary.trim(),
      portraitUrl: form.portraitUrl.trim() || null,
      motivation: form.motivation.trim(),
      description: form.description.trim(),
      physicalTraits: { tags, notes: form.notes.trim() },
      secrets: { confidential: form.confidential.trim(), isPrivate: form.isPrivate },
    };

    const result = entity
      ? await updateStoryBibleEntity(entity.id, payload)
      : await createStoryBibleEntity(bookId, payload);

    setSaving(false);
    if (result.success) {
      toast({ title: entity ? 'Profile updated' : 'Profile created', description: form.name.trim() });
      onSaved();
    } else {
      toast({ title: 'Save failed', description: result.error || 'Unknown error', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d0d10] border-[#312839] text-white max-w-2xl max-h-[85vh] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${cfg.gradient} flex items-center justify-center`}>
              <cfg.icon className="h-4 w-4 text-white" />
            </span>
            {entity ? 'Edit' : 'Create'} {cfg.singular}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            This profile becomes part of the story bible the AI reads while writing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sb-name" className="text-white text-xs font-semibold uppercase tracking-wider">
                Name *
              </Label>
              <Input
                id="sb-name"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder={`${cfg.singular} name`}
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-600"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sb-role" className="text-white text-xs font-semibold uppercase tracking-wider">
                Role / Title
              </Label>
              <Input
                id="sb-role"
                value={form.role}
                onChange={(e) => set('role', e.target.value)}
                placeholder="e.g. Main Character, Capital City"
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-600"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sb-summary" className="text-white text-xs font-semibold uppercase tracking-wider">
              Summary
            </Label>
            <Textarea
              id="sb-summary"
              value={form.summary}
              onChange={(e) => set('summary', e.target.value)}
              placeholder="One-line blurb shown under the name"
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 min-h-16"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sb-portrait" className="text-white text-xs font-semibold uppercase tracking-wider">
              Portrait / Cover Image URL
            </Label>
            <Input
              id="sb-portrait"
              value={form.portraitUrl}
              onChange={(e) => set('portraitUrl', e.target.value)}
              placeholder="https://... (optional)"
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-600"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sb-motivation" className="text-white text-xs font-semibold uppercase tracking-wider">
              {cfg.motivationLabel}
            </Label>
            <Textarea
              id="sb-motivation"
              value={form.motivation}
              onChange={(e) => set('motivation', e.target.value)}
              placeholder={`Describe the ${cfg.singular.toLowerCase()}'s core drive...`}
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 min-h-24"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sb-description" className="text-white text-xs font-semibold uppercase tracking-wider">
              Long Description
            </Label>
            <Textarea
              id="sb-description"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Extended lore and background details"
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 min-h-24"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white text-xs font-semibold uppercase tracking-wider">
              {cfg.physicalLabel}
            </Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-3 py-1 rounded-full text-xs font-semibold"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                    className="hover:text-white transition-colors"
                    aria-label={`Remove ${tag}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add trait and press Enter"
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 flex-1"
              />
              <Button type="button" variant="outline" onClick={addTag} className="border-[#312839] text-slate-300">
                Add
              </Button>
            </div>
            <Textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Additional visual / physical details..."
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 min-h-16"
            />
          </div>

          <div className="space-y-3 rounded-xl border border-purple-500/30 bg-gradient-to-br from-[#101f22] to-[#1a1022] p-4">
            <Label htmlFor="sb-secrets" className="text-purple-300 text-xs font-bold uppercase tracking-widest">
              Confidential Information
            </Label>
            <Textarea
              id="sb-secrets"
              value={form.confidential}
              onChange={(e) => set('confidential', e.target.value)}
              placeholder="Hidden lore used by the AI to maintain tension, not disclosed to readers early"
              className="bg-black/40 border-purple-500/20 text-white placeholder:text-purple-300/40 focus:border-purple-500 min-h-20"
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="sb-private"
                checked={form.isPrivate}
                onCheckedChange={(checked) => set('isPrivate', checked === true)}
                className="border-purple-400/50 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500"
              />
              <Label htmlFor="sb-private" className="text-xs text-purple-200/70">
                Keep hidden from readers (AI-only)
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-[#312839] text-slate-300">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="btn-gradient">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {entity ? 'Save Changes' : `Create ${cfg.singular}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
