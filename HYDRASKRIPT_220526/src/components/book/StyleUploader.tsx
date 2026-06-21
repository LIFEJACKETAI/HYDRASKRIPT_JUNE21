'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Palette, FileText, Save, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { listStyleProfiles, createStyleProfile, deleteStyleProfile } from '@/lib/api';
import type { StyleProfileData } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

export default function StyleUploader() {
  const [profiles, setProfiles] = useState<StyleProfileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StyleProfileData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [exemplarTexts, setExemplarTexts] = useState<string[]>(['']);

  const fetchProfiles = async () => {
    setLoading(true);
    const data = await listStyleProfiles();
    setProfiles(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleAddExemplar = () => {
    if (exemplarTexts.length < 5) {
      setExemplarTexts([...exemplarTexts, '']);
    }
  };

  const handleRemoveExemplar = (index: number) => {
    if (exemplarTexts.length > 1) {
      setExemplarTexts(exemplarTexts.filter((_, i) => i !== index));
    }
  };

  const handleExemplarChange = (index: number, value: string) => {
    const newTexts = [...exemplarTexts];
    newTexts[index] = value;
    setExemplarTexts(newTexts);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: 'Missing name', description: 'Please provide a name for the style profile.', variant: 'destructive' });
      return;
    }

    const validTexts = exemplarTexts.filter((t) => t.trim());
    if (validTexts.length === 0) {
      toast({ title: 'Missing exemplar', description: 'Please provide at least one exemplar text.', variant: 'destructive' });
      return;
    }

    setIsCreating(true);
    try {
      const result = await createStyleProfile({
        name: name.trim(),
        description: description.trim() || undefined,
        exemplarTexts: validTexts,
      });

      if (result.success) {
        toast({ title: 'Profile created!', description: `"${name}" is ready to use.` });
        resetForm();
        fetchProfiles();
      } else {
        toast({
          title: 'Failed to create profile',
          description: result.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to create style profile.', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const result = await deleteStyleProfile(deleteTarget.id);
      if (result.success) {
        toast({ title: 'Profile deleted', description: `"${deleteTarget.name}" has been removed.` });
        fetchProfiles();
      } else {
        toast({ title: 'Failed to delete', description: result.error || 'Unknown error', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to delete profile.', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setExemplarTexts(['']);
    setShowCreateForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Palette className="h-5 w-5 text-purple-400" />
            Style Training
          </h1>
          <p className="text-sm text-gray-500 mt-1">Create custom writing styles by providing exemplar texts</p>
        </div>
        <Button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className={showCreateForm ? 'bg-[#1e1e1e] text-gray-300 hover:bg-[#252525]' : 'btn-gradient'}
        >
          {showCreateForm ? (
            <>
              <X className="h-4 w-4 mr-2" /> Cancel
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" /> New Profile
            </>
          )}
        </Button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="bg-[#2a2a2a] border-purple-500/20">
            <CardHeader>
              <CardTitle className="text-white text-base">Create Style Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="profile-name" className="text-gray-300">Name *</Label>
                  <Input
                    id="profile-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Hemingway, Whimsical Children, etc."
                    className="bg-[#1e1e1e] border-gray-700 text-white placeholder:text-gray-600 focus:border-purple-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profile-desc" className="text-gray-300">Description</Label>
                  <Textarea
                    id="profile-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe this writing style..."
                    className="bg-[#1e1e1e] border-gray-700 text-white placeholder:text-gray-600 focus:border-purple-500 min-h-[80px]"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-gray-300">Exemplar Texts *</Label>
                    <span className="text-[10px] text-gray-600">{exemplarTexts.length}/5 samples</span>
                  </div>
                  {exemplarTexts.map((text, index) => (
                    <div key={index} className="flex gap-2">
                      <Textarea
                        value={text}
                        onChange={(e) => handleExemplarChange(index, e.target.value)}
                        placeholder={`Sample text ${index + 1}...`}
                        className="bg-[#1e1e1e] border-gray-700 text-white placeholder:text-gray-600 focus:border-purple-500 min-h-[80px]"
                      />
                      {exemplarTexts.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveExemplar(index)}
                          className="shrink-0 text-gray-500 hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {exemplarTexts.length < 5 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddExemplar}
                      className="border-gray-700 text-gray-400 hover:text-white hover:bg-[#1e1e1e]"
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add Sample
                    </Button>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={isCreating || !name.trim() || exemplarTexts.every((t) => !t.trim())}
                  className="btn-gradient"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" /> Create Profile
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Profile list */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))
        ) : profiles.length === 0 ? (
          <div className="text-center py-12">
            <Palette className="h-12 w-12 mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400">No style profiles yet.</p>
            <p className="text-sm text-gray-600 mt-1">Create one to customize your book&apos;s writing style.</p>
          </div>
        ) : (
          profiles.map((profile) => (
            <motion.div
              key={profile.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="bg-[#2a2a2a] border-gray-800 card-hover">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white text-sm">{profile.name}</h3>
                        {profile.exemplarTexts && (
                          <Badge variant="outline" className="text-[9px] border-purple-500/30 text-purple-300">
                            {profile.exemplarTexts.length} samples
                          </Badge>
                        )}
                      </div>
                      {profile.description && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{profile.description}</p>
                      )}
                      {profile.systemPrompt && (
                        <div className="mt-2 p-2 rounded bg-[#1e1e1e] border border-gray-800">
                          <p className="text-[10px] text-gray-500 mb-1 flex items-center gap-1">
                            <FileText className="h-3 w-3" /> System Prompt Preview
                          </p>
                          <p className="text-xs text-gray-400 line-clamp-3">{profile.systemPrompt}</p>
                        </div>
                      )}
                      <p className="text-[10px] text-gray-600 mt-2">
                        Created {new Date(profile.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(profile)}
                      className="shrink-0 text-gray-500 hover:text-red-400 hover:bg-[#1e1e1e]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="bg-[#1a1a1a] border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>Delete Style Profile</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} className="text-gray-400">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
