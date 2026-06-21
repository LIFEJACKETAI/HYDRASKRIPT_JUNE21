'use client';

import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  BookPlus,
  Palette,
  Coins,
  Shield,
  Lightbulb,
  Headphones,
  Download,
  Zap,
  ChevronLeft,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/lib/store';
import { getCredits } from '@/lib/api';
import type { AppView } from '@/lib/store';

interface NavItem {
  icon: React.ElementType;
  label: string;
  view: AppView;
  adminOnly?: boolean;
  color?: string;
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard',      view: 'dashboard' },
  { icon: BookPlus,        label: 'Create Book',    view: 'create-book' },
  { icon: Lightbulb,       label: 'Ideas Lab',      view: 'ideas-lab',       color: 'text-yellow-400' },
  { icon: Headphones,      label: 'Audiobook',      view: 'audiobook',       color: 'text-cyan-400' },
  { icon: Palette,         label: 'Style Training', view: 'style-training',  color: 'text-pink-400' },
  { icon: Download,        label: 'Export Hub',     view: 'export-hub',      color: 'text-blue-400' },
  { icon: Coins,           label: 'Credits',        view: 'credits',         color: 'text-amber-400' },
  { icon: Shield,          label: 'Admin',          view: 'admin', adminOnly: true, color: 'text-red-400' },
];

export default function Sidebar() {
  const { currentView, setCurrentView, sidebarOpen, setSidebarOpen, profile } = useAppStore();
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    if (profile) {
      getCredits().then((data) => {
        if (data) setCredits(data.credits);
      });
    }
  }, [profile]);

  if (currentView === 'landing') return null;

  const filteredItems = navItems.filter(
    (item) => !item.adminOnly || profile?.isAdmin
  );

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed md:relative z-40 top-16 left-0 h-[calc(100vh-4rem)] w-64 bg-[#0d0d10] border-r border-[#312839] transition-transform duration-300 ease-in-out flex flex-col shrink-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {filteredItems.map((item) => {
            const isActive = currentView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => {
                  setCurrentView(item.view);
                  if (typeof window !== 'undefined' && window.innerWidth < 768) setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                  isActive
                    ? 'gradient-multi-border text-white shadow-lg shadow-purple-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <item.icon
                  className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                    isActive
                      ? 'text-purple-400'
                      : item.color
                        ? `${item.color} opacity-70 group-hover:opacity-100`
                        : 'text-slate-500 group-hover:text-white'
                  }`}
                />
                <span className="font-semibold">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <Separator className="bg-[#312839]" />

        {/* Credits bar */}
        <div className="p-4">
          <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-cyan-500/10 border border-white/10">
            <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1">Credits</p>
            <p className="text-lg font-bold text-white mb-2">
              {credits !== null ? credits.toLocaleString() : profile?.credits?.toLocaleString() ?? '—'}
            </p>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="gradient-multi h-full" style={{ width: '60%' }} />
            </div>
          </div>

          {/* Collapse button desktop */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="hidden md:flex w-full items-center justify-center gap-2 mt-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Collapse
          </button>
        </div>
      </aside>
    </>
  );
}
