// HydraSkript - Global State Store (Zustand)
// Manages client-side state: current view, user profile, active book, etc.

import { create } from 'zustand';
import type { ProfileData, BookData } from '@/lib/api';

// ─── View Types ───────────────────────────────────────────────────────────────

export type AppView =
  | 'landing'
  | 'dashboard'
  | 'create-book'
  | 'book-detail'
  | 'style-training'
  | 'audiobook'
  | 'ideas-lab'
  | 'credits'
  | 'export-hub'
  | 'ui-gallery'
  | 'pricing'
  | 'admin';

// ─── Store Interface ──────────────────────────────────────────────────────────

interface AppState {
  // Navigation
  currentView: AppView;
  setCurrentView: (view: AppView) => void;

  // User profile
  profile: ProfileData | null;
  setProfile: (profile: ProfileData | null) => void;

  // Selected book
  selectedBookId: string | null;
  setSelectedBookId: (id: string | null) => void;

  // Active generation job
  activeJobId: string | null;
  setActiveJobId: (id: string | null) => void;

  // UI state
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  isGenerating: boolean;
  setIsGenerating: (generating: boolean) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set) => ({
  // Navigation
  currentView: 'landing',
  setCurrentView: (view) => set({ currentView: view }),

  // Profile
  profile: null,
  setProfile: (profile) => set({ profile }),

  // Selected book
  selectedBookId: null,
  setSelectedBookId: (id) => set({ selectedBookId: id, currentView: id ? 'book-detail' : 'dashboard' }),

  // Active job
  activeJobId: null,
  setActiveJobId: (id) => set({ activeJobId: id }),

  // UI
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  isGenerating: false,
  setIsGenerating: (generating) => set({ isGenerating: generating }),
}));
