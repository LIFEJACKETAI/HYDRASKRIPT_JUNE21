'use client';

import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  BookPlus,
  Palette,
  Coins,
  Shield,
  ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/lib/store';
import { getCredits } from '@/lib/api';
import type { AppView } from '@/lib/store';
import CreditDisplay from '@/components/book/CreditDisplay';

interface NavItem {
  icon: React.ElementType;
  label: string;
  view: AppView;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', view: 'dashboard' },
  { icon: BookPlus, label: 'Create Book', view: 'create-book' },
  { icon: Palette, label: 'Style Training', view: 'style-training' },
  { icon: Coins, label: 'Credits', view: 'credits' },
  { icon: Shield, label: 'Admin', view: 'admin', adminOnly: true },
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
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed md:relative z-40 top-14 left-0 h-[calc(100vh-3.5rem)] w-64 bg-[#111111] border-r border-gray-800 transition-transform duration-300 ease-in-out flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:-translate-x-full'
        }`}
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
          {filteredItems.map((item) => {
            const isActive = currentView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => {
                  setCurrentView(item.view);
                  if (window.innerWidth < 768) setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-[#1e1e1e]'
                }`}
              >
                <item.icon className={`h-5 w-5 ${isActive ? 'text-purple-400' : ''}`} />
                {item.label}
              </button>
            );
          })}
        </div>

        <Separator className="bg-gray-800" />

        {/* Credits section */}
        <div className="p-4">
          <CreditDisplay credits={credits} />
        </div>

        {/* Collapse button */}
        <div className="p-2 hidden md:block">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(false)}
            className="w-full text-gray-500 hover:text-gray-300 hover:bg-[#1e1e1e]"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Collapse
          </Button>
        </div>
      </aside>
    </>
  );
}
