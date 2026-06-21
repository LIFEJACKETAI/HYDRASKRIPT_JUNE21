'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Save, X, Loader2, Zap, FileText,
  RefreshCw, Upload, Sparkles, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { listStyleProfiles, createStyleProfile, deleteStyleProfile } from '@/lib/api';
import type { StyleProfileData } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

// ─── Descriptor tags ──────────────────────────────────────────────────────────

const DESCRIPTOR_OPTIONS = [
  'Noir', 'Cinematic', 'Lyrical', 'Minimalist', 'Verbose', 'Cynical',
  'Hard-boiled', 'First Person', 'Metaphorical', 'Gothic', 'Whimsical',
  'Gritty', 'Poetic', 'Sparse', 'Dense', 'Epistolary',
];

const TONE_PRESETS = [
  { label: 'Action',    icon: Zap,       scene: 'She kicked the door. Splinters. She kept moving. No time for mercy.' },
  { label: 'Romantic',  icon: Sparkles,  scene: 'The world narrowed to the space between their hands. Warm. Electric. Inevitable.' },
  { label: 'Reveal',    icon: FileText,  scene: 'The letter had been written thirty years ago. The handwriting was his.' },
  { label: 'Emotional', icon: RefreshCw, scene: 'He didn\'t cry. He laughed — that broken kind that sounds like goodbye.' },
];

// ─── Directive Card ───────────────────────────────────────────────────────────

interface Directive {
  id: string;
  type: string;
  title: string;
  rule: string;
  example: string;
}

const DEFAULT_DIRECTIVES: Directive[] = [
  {
    id: '1',
    type: 'Logic: Behavioral',
    title: 'Actions as Inner Monologue',
    rule: 'Report events as internal reflection, not just action.',
    example: '"The lock clicked — luck, not skill. A nat 20 in a world of zeros."',
  },
  {
    id: '2',
    type: 'Style: Prose',
    title: 'Metaphorical Environment',
    rule: 'The setting must mirror the character\'s internal state.',
    example: '"The rain didn\'t wash away the filth; it turned the city into a wet tomb."',
  },
];

function DirectiveCard({ directive, onRemove }: { directive: Directive; onRemove: () => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="p-5 rounded-xl bg-[#0d0d10] border border-[#312839] flex flex-col gap-3 hover:border-purple-500/30 transition-colors"
    >
      <div className="flex justify-between items-start">
        <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">
          {directive.type}
        </span>
        <button
          onClick={onRemove}
          className="text-slate-600 hover:text-red-400 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <h4 className="text-sm font-bold text-white">{directive.title}</h4>
      <p className="text-xs text-slate-500">{directive.rule}</p>
      <div className="p-3 bg-black/40 rounded-lg italic text-xs text-slate-400">
        {directive.example}
      </div>
    </motion.div>
  );
}

// ─── Add Directive Modal ──────────────────────────────────────────────────────

function AddDirectiveModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (d: Directive) => void;
}) {
  const [type, setType] = useState('Style: Prose');
  const [title, setTitle] = useState('');
  const [rule, setRule] = useState('');
  const [example, setExample] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !rule.trim()) return;
    onAdd({ id: Date.now().toString(), type, title: title.trim(), rule: rule.trim(), example: example.trim() });
    setType('Style: Prose'); setTitle(''); setRule(''); setExample('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#0d0d10] border-[#312839] text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Add Prime Directive</DialogTitle>
          <DialogDescription className="text-slate-500">
            Define a behavioral or stylistic rule for this voice.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs uppercase tracking-wide">Type</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#312839] rounded-lg text-white text-sm px-3 py-2 focus:border-purple-500 outline-none"
            >
              {['Logic: Behavioral', 'Style: Prose', 'Style: Dialogue', 'Style: Pacing', 'Logic: Structural'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs uppercase tracking-wide">Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short directive name..."
              className="bg-[#1a1a1a] border-[#312839] text-white placeholder:text-slate-600 focus:border-purple-500"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs uppercase tracking-wide">Rule *</Label>
            <Textarea
              value={rule}
              onChange={(e) => setRule(e.target.value)}
              placeholder="Describe the rule..."
              className="bg-[#1a1a1a] border-[#312839] text-white placeholder:text-slate-600 focus:border-purple-500 min-h-[70px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs uppercase tracking-wide">Example (optional)</Label>
            <Textarea
              value={example}
              onChange={(e) => setExample(e.target.value)}
              placeholder='"Example prose demonstrating this rule..."'
              className="bg-[#1a1a1a] border-[#312839] text-white placeholder:text-slate-600 focus:border-purple-500 min-h-[60px] italic"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose} className="text-slate-400">Cancel</Button>
            <Button type="submit" className="btn-gradient" disabled={!title.trim() || !rule.trim()}>
              Add Directive
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StyleUploader() {
  const [profiles, setProfiles] = useState<StyleProfileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProfile, setActiveProfile] = useState<StyleProfileData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StyleProfileData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDirectiveModal, setShowDirectiveModal] = useState(false);

  // Config panel state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [exemplarTexts, setExemplarTexts] = useState<string[]>(['']);
  const [selectedDescriptors, setSelectedDescriptors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [toneValue, setToneValue] = useState(65);
  const [lengthValue, setLengthValue] = useState(50);
  const [pacingValue, setPacingValue] = useState(70);

  // Directives
  const [directives, setDirectives] = useState<Directive[]>(DEFAULT_DIRECTIVES);

  // Live test
  const [previewText, setPreviewText] = useState(
    '"The smoke from my cigarette curled like a question mark in the stagnant air. She stood in the doorway, a shadow against neon. I knew she was trouble before she even opened her mouth..."'
  );

  // Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const fetchProfiles = async () => {
    setLoading(true);
    const data = await listStyleProfiles();
    setProfiles(data);
    if (data.length > 0 && !activeProfile) setActiveProfile(data[0]);
    setLoading(false);
  };

  useEffect(() => { fetchProfiles(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDescriptor = (tag: string) => {
    setSelectedDescriptors(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' }); return;
    }
    const validTexts = exemplarTexts.filter(t => t.trim());
    if (validTexts.length === 0) {
      toast({ title: 'At least one exemplar required', variant: 'destructive' }); return;
    }
    setIsSaving(true);
    try {
      const result = await createStyleProfile({
        name: name.trim(),
        description: [description.trim(), selectedDescriptors.length > 0 ? `Tags: ${selectedDescriptors.join(', ')}` : ''].filter(Boolean).join(' — ') || undefined,
        exemplarTexts: validTexts,
      });
      if (result.success) {
        toast({ title: 'Style saved!', description: `"${name}" is ready to use.` });
        setName(''); setDescription(''); setExemplarTexts(['']); setSelectedDescriptors([]);
        setShowCreateModal(false);
        fetchProfiles();
      } else {
        toast({ title: 'Failed to save', description: result.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const result = await deleteStyleProfile(deleteTarget.id);
      if (result.success) {
        toast({ title: 'Profile deleted', description: `"${deleteTarget.name}" removed.` });
        if (activeProfile?.id === deleteTarget.id) setActiveProfile(null);
        fetchProfiles();
      } else {
        toast({ title: 'Failed', description: result.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    toast({ title: 'File uploaded', description: `${file.name} ready for training.` });
  };

  const previewToneScene = (scene: string) => {
    setPreviewText(`"${scene}"`);
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 180px)' }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Style Training Center</h1>
          <p className="text-sm text-slate-500 mt-1">Define the authorial voice that drives your AI.</p>
        </div>
        <div className="flex items-center gap-3">
          {activeProfile && (
            <span className="text-xs text-slate-500 px-3 py-1.5 rounded-lg border border-[#312839] bg-[#0d0d10]">
              Active: <span className="text-purple-400 font-semibold">{activeProfile.name}</span>
            </span>
          )}
          <Button onClick={() => setShowCreateModal(true)} className="btn-gradient">
            <Plus className="h-4 w-4 mr-2" /> New Style
          </Button>
        </div>
      </div>

      {/* ── 3-col layout ── */}
      <div className="flex flex-1 gap-0 rounded-2xl overflow-hidden border border-[#312839]" style={{ minHeight: 600 }}>

        {/* LEFT: Config Panel */}
        <aside className="w-72 shrink-0 border-r border-[#312839] bg-[#08080a] flex flex-col overflow-y-auto">
          <div className="p-5 border-b border-[#312839]">
            <h2 className="text-sm font-bold text-white">Style Configuration</h2>
            <p className="text-xs text-slate-500 mt-0.5">Define the soul of your narrator.</p>
          </div>

          <div className="p-5 flex flex-col gap-6 flex-1">
            {/* Identity */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Voice Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., The Noir Author"
                  className="bg-[#111] border-[#312839] text-white placeholder:text-slate-700 focus:border-purple-500 text-sm h-9"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Description</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Gritty, cynical, atmospheric..."
                  className="bg-[#111] border-[#312839] text-white placeholder:text-slate-700 focus:border-purple-500 text-sm resize-none h-20"
                />
              </div>
            </div>

            {/* Sliders */}
            <div className="flex flex-col gap-4 pt-4 border-t border-[#312839]">
              {[
                { label: 'Tone', left: 'Formal', right: 'Casual', value: toneValue, set: setToneValue },
                { label: 'Length', left: 'Short', right: 'Long', value: lengthValue, set: setLengthValue },
                { label: 'Pacing', left: 'Slow', right: 'Fast', value: pacingValue, set: setPacingValue },
              ].map((slider) => (
                <div key={slider.label} className="flex flex-col gap-2">
                  <div className="flex justify-between text-[10px] font-medium text-slate-500">
                    <span>{slider.label}: {slider.left}</span>
                    <span className="text-purple-400 font-bold">{slider.right}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={slider.value}
                    onChange={(e) => slider.set(Number(e.target.value))}
                    className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    style={{ background: `linear-gradient(to right, #a855f7 ${slider.value}%, #312839 ${slider.value}%)` }}
                  />
                </div>
              ))}
            </div>

            {/* Descriptors */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Descriptors</label>
              <div className="flex flex-wrap gap-1.5">
                {DESCRIPTOR_OPTIONS.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleDescriptor(tag)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                      selectedDescriptors.includes(tag)
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : 'bg-[#1a1a1a] text-slate-500 border border-[#312839] hover:text-white'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Saved profiles */}
            {profiles.length > 0 && (
              <div className="flex flex-col gap-2 pt-4 border-t border-[#312839]">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Saved Profiles</label>
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
                  </div>
                ) : (
                  profiles.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setActiveProfile(p)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all ${
                        activeProfile?.id === p.id
                          ? 'bg-purple-500/10 border border-purple-500/30 text-white'
                          : 'bg-[#111] border border-[#312839] text-slate-400 hover:text-white hover:border-white/10'
                      }`}
                    >
                      <span className="text-sm font-medium truncate">{p.name}</span>
                      <div className="flex items-center gap-1">
                        {activeProfile?.id === p.id && (
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                          className="text-slate-700 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </aside>

        {/* CENTER: Authorial Engine */}
        <main className="flex-1 bg-[#09090b] overflow-y-auto p-8 flex flex-col gap-8">
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-3xl font-black tracking-tight text-white">Authorial Engine</h2>
              <p className="text-slate-500 mt-1">Refine the core logic that drives this voice.</p>
            </div>
            {activeProfile && (
              <Badge className="bg-purple-500/10 text-purple-300 border-purple-500/30 text-xs">
                {activeProfile.name}
              </Badge>
            )}
          </div>

          {/* Upload Area */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-white">
              <Upload className="h-4 w-4 text-purple-400" />
              <h3 className="font-bold">Training Data</h3>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.epub,.txt"
              onChange={handleFileChange}
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-10 cursor-pointer transition-all ${
                uploadedFile
                  ? 'border-purple-500/40 bg-purple-500/5'
                  : 'border-[#312839] bg-white/[0.02] hover:border-purple-500/30 hover:bg-purple-500/5'
              }`}
            >
              <div className="text-center">
                <p className="text-white font-bold">Upload Source Material</p>
                <p className="text-slate-500 text-sm mt-1">
                  Supports <span className="text-purple-400 font-bold">.pdf</span>, <span className="text-purple-400 font-bold">.docx</span>, <span className="text-purple-400 font-bold">.epub</span>
                </p>
              </div>
              <Button className="btn-gradient h-10 px-6" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                Browse Files
              </Button>
            </div>

            {uploadedFile && (
              <div className="flex items-center justify-between p-3 bg-[#0d0d10] border border-[#312839] rounded-xl">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                    <FileText className="h-3 w-3 text-green-400" />
                  </div>
                  <span className="text-sm text-white font-medium">{uploadedFile.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-purple-400 font-bold">Processed</span>
                  <button onClick={() => setUploadedFile(null)} className="text-slate-600 hover:text-red-400">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Prime Directives */}
          <div className="flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-white">
                <Zap className="h-4 w-4 text-purple-400" />
                <h3 className="font-bold">Prime Directives</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDirectiveModal(true)}
                className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Directive
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence>
                {directives.map((d) => (
                  <DirectiveCard
                    key={d.id}
                    directive={d}
                    onRemove={() => setDirectives(prev => prev.filter(x => x.id !== d.id))}
                  />
                ))}
              </AnimatePresence>
              {directives.length === 0 && (
                <div className="col-span-2 py-10 text-center rounded-xl border-2 border-dashed border-[#312839] text-slate-600">
                  <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No directives yet. Add rules to shape the voice.</p>
                </div>
              )}
            </div>
          </div>

          {/* Exemplar Texts (create flow) */}
          <div className="flex flex-col gap-4 pt-4 border-t border-[#312839]">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-cyan-400" />
              <h3 className="font-bold text-white">Exemplar Texts</h3>
              <span className="text-[10px] text-slate-600 ml-auto">{exemplarTexts.length}/5 samples</span>
            </div>
            {exemplarTexts.map((text, i) => (
              <div key={i} className="flex gap-2">
                <Textarea
                  value={text}
                  onChange={(e) => {
                    const arr = [...exemplarTexts];
                    arr[i] = e.target.value;
                    setExemplarTexts(arr);
                  }}
                  placeholder={`Sample text ${i + 1} — paste prose that exemplifies this voice...`}
                  className="bg-[#0d0d10] border-[#312839] text-white placeholder:text-slate-700 focus:border-purple-500 min-h-[90px] text-sm"
                />
                {exemplarTexts.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setExemplarTexts(exemplarTexts.filter((_, idx) => idx !== i))}
                    className="shrink-0 text-slate-600 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {exemplarTexts.length < 5 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExemplarTexts([...exemplarTexts, ''])}
                className="border-[#312839] text-slate-500 hover:text-white hover:bg-[#1a1a1a] w-fit"
              >
                <Plus className="h-3 w-3 mr-1" /> Add Sample
              </Button>
            )}
            <Button
              onClick={handleSaveProfile}
              disabled={isSaving || !name.trim() || exemplarTexts.every(t => !t.trim())}
              className="btn-gradient w-fit"
            >
              {isSaving
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                : <><Save className="h-4 w-4 mr-2" />Save Style Profile</>
              }
            </Button>
          </div>
        </main>
      </div>

      {/* ── Live Test Generator Footer ── */}
      <div className="mt-4 rounded-2xl border border-[#312839] bg-[#08080a] p-5">
        <div className="flex items-center gap-4 mb-4">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Live Test Generator</p>
          <div className="h-px flex-1 bg-[#312839]" />
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            <span className="text-[10px] text-purple-400 font-bold uppercase">AI Preview</span>
          </div>
        </div>
        <div className="flex items-end gap-4">
          <div className="flex gap-2 flex-wrap">
            {TONE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => previewToneScene(preset.scene)}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#1a1a1a] hover:bg-purple-500/10 hover:text-purple-300 border border-[#312839] hover:border-purple-500/30 rounded-lg text-sm font-bold text-slate-400 transition-all"
              >
                <preset.icon className="h-3.5 w-3.5" /> {preset.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-[70px] bg-black/40 rounded-xl p-4 border border-[#312839] relative group">
            <p className="text-sm text-slate-400 italic line-clamp-3 pr-10">{previewText}</p>
            <button
              onClick={() => previewToneScene(TONE_PRESETS[Math.floor(Math.random() * TONE_PRESETS.length)].scene)}
              className="absolute bottom-2 right-3 text-[10px] font-bold text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" /> Regenerate
            </button>
          </div>
          {activeProfile && (
            <Button size="sm" className="btn-gradient shrink-0" onClick={() => toast({ title: 'Preview generated!', description: `Using voice: ${activeProfile.name}` })}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Create Modal ── */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="bg-[#0d0d10] border-[#312839] text-white">
          <DialogHeader>
            <DialogTitle>Create Style Profile</DialogTitle>
            <DialogDescription className="text-slate-500">
              Name your voice and provide exemplar texts below.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveProfile} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-xs">Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Hemingway" className="bg-[#1a1a1a] border-[#312839] text-white focus:border-purple-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400 text-xs">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short, declarative, masculine prose." className="bg-[#1a1a1a] border-[#312839] text-white focus:border-purple-500 min-h-[70px]" />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowCreateModal(false)} className="text-slate-400">Cancel</Button>
              <Button type="submit" className="btn-gradient" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue in Workspace'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Add Directive Modal ── */}
      <AddDirectiveModal
        open={showDirectiveModal}
        onClose={() => setShowDirectiveModal(false)}
        onAdd={(d) => setDirectives(prev => [...prev, d])}
      />

      {/* ── Delete Confirm ── */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="bg-[#0d0d10] border-[#312839] text-white">
          <DialogHeader>
            <DialogTitle>Delete Style Profile</DialogTitle>
            <DialogDescription className="text-slate-500">
              Delete &quot;{deleteTarget?.name}&quot;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} className="text-slate-400">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
