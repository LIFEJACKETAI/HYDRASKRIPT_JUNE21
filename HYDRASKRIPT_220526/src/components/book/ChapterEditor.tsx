'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, FileText, ImageIcon, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ChapterData } from '@/lib/api';

const chapterStatusConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending: { label: 'Pending', icon: Clock, className: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
  writing: { label: 'Writing', icon: Loader2, className: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  reviewing: { label: 'Reviewing', icon: Loader2, className: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  completed: { label: 'Completed', icon: CheckCircle, className: 'bg-green-500/20 text-green-300 border-green-500/30' },
  failed: { label: 'Failed', icon: AlertCircle, className: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

interface ChapterEditorProps {
  chapters: ChapterData[];
}

export default function ChapterEditor({ chapters }: ChapterEditorProps) {
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);

  if (!chapters || chapters.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p>No chapters yet. Generate the book to create chapters.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[600px] custom-scrollbar">
      <div className="space-y-2 pr-2">
        {chapters
          .sort((a, b) => a.index - b.index)
          .map((chapter) => {
            const statusInfo = chapterStatusConfig[chapter.status] || chapterStatusConfig.pending;
            const StatusIcon = statusInfo.icon;
            const isExpanded = expandedChapter === chapter.id;

            return (
              <div
                key={chapter.id}
                className="rounded-lg border border-gray-800 bg-[#1e1e1e] overflow-hidden"
              >
                <button
                  onClick={() => setExpandedChapter(isExpanded ? null : chapter.id)}
                  className="w-full flex items-center justify-between p-3 hover:bg-[#252525] transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-purple-400 font-mono text-xs font-bold">
                      {String(chapter.index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-sm font-medium text-white truncate">
                        {chapter.title || `Chapter ${chapter.index + 1}`}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-500">
                          {chapter.wordCount?.toLocaleString() || 0} words
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {chapter.illustrationUrl && (
                      <ImageIcon className="h-3 w-3 text-cyan-400" />
                    )}
                    <Badge className={`text-[9px] border ${statusInfo.className}`}>
                      <StatusIcon className={`h-2.5 w-2.5 mr-1 ${chapter.status === 'writing' || chapter.status === 'reviewing' ? 'animate-spin' : ''}`} />
                      {statusInfo.label}
                    </Badge>
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    </motion.div>
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="border-t border-gray-800 p-4 space-y-3">
                        {chapter.synopsis && (
                          <div>
                            <h5 className="text-xs font-medium text-gray-400 mb-1">Synopsis</h5>
                            <p className="text-sm text-gray-300">{chapter.synopsis}</p>
                          </div>
                        )}

                        {chapter.illustrationUrl && (
                          <div>
                            <h5 className="text-xs font-medium text-gray-400 mb-1">Illustration</h5>
                            <img
                              src={chapter.illustrationUrl}
                              alt={`Illustration for ${chapter.title}`}
                              className="rounded-lg max-h-48 object-cover border border-gray-800"
                            />
                          </div>
                        )}

                        {chapter.content ? (
                          <div>
                            <h5 className="text-xs font-medium text-gray-400 mb-1">Content</h5>
                            <div className="prose prose-invert prose-sm max-w-none text-gray-300 whitespace-pre-wrap leading-relaxed">
                              {chapter.content}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 italic">
                            Content not yet generated.
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
      </div>
    </ScrollArea>
  );
}
