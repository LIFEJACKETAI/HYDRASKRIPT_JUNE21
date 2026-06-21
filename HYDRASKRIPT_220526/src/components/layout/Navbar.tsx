'use client';

import Image from 'next/image';
import { Menu, X, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { getUserEmail, setUserEmail } from '@/lib/api';

export default function Navbar() {
  const { currentView, setCurrentView, sidebarOpen, setSidebarOpen, profile } = useAppStore();
  const email = typeof window !== 'undefined' ? getUserEmail() : '';

  const handleSignOut = () => {
    setUserEmail('');
    setCurrentView('landing');
    useAppStore.getState().setProfile(null);
  };

  if (currentView === 'landing') return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-800 bg-black/80 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-400 hover:text-white hover:bg-[#1e1e1e]"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <button
            onClick={() => setCurrentView('dashboard')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <Image
              src="/logo-navbar.png"
              alt="HydraSkript Logo"
              width={71}
              height={40}
              className="h-8 w-auto"
              priority
            />
          </button>
        </div>

        <div className="flex items-center gap-3">
          {profile && (
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-400">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#1e1e1e] px-3 py-1 text-purple-300 text-xs font-medium border border-purple-500/20">
                {profile.credits} credits
              </span>
            </div>
          )}
          <span className="text-xs text-gray-500 hidden md:inline max-w-[150px] truncate">{email}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            className="text-gray-400 hover:text-red-400 hover:bg-[#1e1e1e]"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
