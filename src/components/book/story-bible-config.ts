// HydraSkript - Story Bible kind configuration
// Central place for per-kind labels, icons, and accents used across the
// Story Bible list/detail/editor views.

import {
  User,
  MapPin,
  Package,
  Sparkles,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import type { StoryBibleKind, StoryBibleEntity } from '@/lib/api';

export interface StoryBibleKindConfig {
  kind: StoryBibleKind;
  label: string; // nav label (plural)
  singular: string; // e.g. "Character"
  icon: LucideIcon;
  gradient: string; // placeholder card gradient
  accent: string; // accent text color
  motivationLabel: string;
  physicalLabel: string;
  emptyTitle: string;
  emptyDesc: string;
}

export const KIND_CONFIG: Record<StoryBibleKind, StoryBibleKindConfig> = {
  CHARACTER: {
    kind: 'CHARACTER',
    label: 'Characters',
    singular: 'Character',
    icon: User,
    gradient: 'from-purple-500 to-cyan-500',
    accent: 'text-cyan-400',
    motivationLabel: 'Motivation',
    physicalLabel: 'Physical Traits',
    emptyTitle: 'No characters yet',
    emptyDesc: 'Create character profiles to keep the cast consistent across every chapter.',
  },
  LOCATION: {
    kind: 'LOCATION',
    label: 'Locations',
    singular: 'Location',
    icon: MapPin,
    gradient: 'from-blue-500 to-teal-500',
    accent: 'text-blue-400',
    motivationLabel: 'Significance',
    physicalLabel: 'Geography & Features',
    emptyTitle: 'No locations yet',
    emptyDesc: 'Map the places your story lives in — cities, rooms, planets, or realms.',
  },
  OBJECT: {
    kind: 'OBJECT',
    label: 'Objects',
    singular: 'Object',
    icon: Package,
    gradient: 'from-amber-500 to-orange-500',
    accent: 'text-amber-400',
    motivationLabel: 'Purpose',
    physicalLabel: 'Attributes',
    emptyTitle: 'No objects yet',
    emptyDesc: 'Catalog artifacts, items, and props that matter to the plot.',
  },
  THEME: {
    kind: 'THEME',
    label: 'Themes',
    singular: 'Theme',
    icon: Sparkles,
    gradient: 'from-pink-500 to-rose-500',
    accent: 'text-pink-400',
    motivationLabel: 'Core Concept',
    physicalLabel: 'Manifestations',
    emptyTitle: 'No themes yet',
    emptyDesc: 'Define the ideas your story explores so the message stays consistent.',
  },
  HISTORY: {
    kind: 'HISTORY',
    label: 'History',
    singular: 'History Entry',
    icon: ScrollText,
    gradient: 'from-emerald-500 to-teal-500',
    accent: 'text-emerald-400',
    motivationLabel: 'Significance',
    physicalLabel: 'Timeline & Markers',
    emptyTitle: 'No history entries yet',
    emptyDesc: 'Record backstory and world events that shaped the present.',
  },
};

export const KIND_ORDER: StoryBibleKind[] = [
  'CHARACTER',
  'LOCATION',
  'OBJECT',
  'THEME',
  'HISTORY',
];

export function formatTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function computeConsistency(entities: StoryBibleEntity[]): number {
  if (entities.length === 0) return 0;
  const total = entities.reduce((score, e) => {
    let filled = 0;
    if (e.summary) filled++;
    if (e.motivation) filled++;
    if (e.description) filled++;
    if ((e.physicalTraits?.tags?.length ?? 0) > 0 || e.physicalTraits?.notes) filled++;
    if (e.secrets?.confidential) filled++;
    return score + filled;
  }, 0);
  return Math.min(100, Math.round((total / (entities.length * 5)) * 100));
}
