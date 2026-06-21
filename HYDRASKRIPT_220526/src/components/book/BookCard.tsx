'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Trash2, BookOpen, Users, FileText, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BookData } from '@/lib/api';

const genreColors: Record<string, string> = {
  fiction: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  fantasy: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'sci-fi': 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  mystery: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  romance: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  horror: 'bg-red-500/20 text-red-300 border-red-500/30',
  children: 'bg-green-500/20 text-green-300 border-green-500/30',
  coloring: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  poetry: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  'non-fiction': 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  'self-help': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  biography: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
};

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
  generating: { label: 'Generating', className: 'bg-purple-500/20 text-purple-300 border-purple-500/30 pulse-glow' },
  completed: { label: 'Completed', className: 'bg-green-500/20 text-green-300 border-green-500/30' },
  failed: { label: 'Failed', className: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

const audienceLabels: Record<string, string> = {
  adult: 'Adult',
  '0-5': 'Ages 0-5',
  '6-9': 'Ages 6-9',
  '10-14': 'Ages 10-14',
};

interface BookCardProps {
  book: BookData;
  onDelete: (id: string) => void;
  onClick: (id: string) => void;
}

export default function BookCard({ book, onDelete, onClick }: BookCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const statusInfo = statusConfig[book.status] || statusConfig.draft;
  const genreColor = genreColors[book.genre] || 'bg-gray-500/20 text-gray-300 border-gray-500/30';

  const gradientSeed = book.id.charCodeAt(0) % 6;
  const gradients = [
    'from-purple-600/40 to-cyan-600/40',
    'from-pink-600/40 to-purple-600/40',
    'from-cyan-600/40 to-blue-600/40',
    'from-amber-600/40 to-red-600/40',
    'from-green-600/40 to-teal-600/40',
    'from-violet-600/40 to-indigo-600/40',
  ];

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(book.id);
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <>
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ duration: 0.2 }}
      >
        <Card
          className="bg-[#2a2a2a] border-gray-800 cursor-pointer card-hover group overflow-hidden"
          onClick={() => onClick(book.id)}
        >
          {/* Cover image or gradient placeholder */}
          <div className={`relative h-40 overflow-hidden ${book.coverImageUrl ? '' : `bg-gradient-to-br ${gradients[gradientSeed]}`}`}>
            {book.coverImageUrl ? (
              <img
                src={book.coverImageUrl}
                alt={book.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <BookOpen className="h-12 w-12 text-white/20" />
              </div>
            )}
            {/* Status badge overlay */}
            <div className="absolute top-2 right-2">
              <Badge className={`text-[10px] border ${statusInfo.className}`}>
                {statusInfo.label}
              </Badge>
            </div>
            {/* Delete button on hover */}
            <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="destructive"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteDialog(true);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-white text-sm line-clamp-1">
              {book.title}
            </h3>

            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className={`text-[10px] border ${genreColor}`}>
                {book.genre}
              </Badge>
              <Badge variant="outline" className="text-[10px] border-gray-600 text-gray-400">
                <Users className="h-3 w-3 mr-1" />
                {audienceLabels[book.targetAudience] || book.targetAudience}
              </Badge>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {book.chapters?.length || 0} chapters
              </span>
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {book.totalCreditsEstimated} credits
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-[#1a1a1a] border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>Delete Book</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to delete &quot;{book.title}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowDeleteDialog(false)}
              className="text-gray-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
