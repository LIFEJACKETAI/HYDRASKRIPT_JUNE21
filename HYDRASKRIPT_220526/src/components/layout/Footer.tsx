'use client';

import Image from 'next/image';
import { Github, Twitter } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-gray-800 bg-[#0a0a0a] mt-auto">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Image
              src="/logo-navbar.png"
              alt="HydraSkript Logo"
              width={71}
              height={40}
              className="h-6 w-auto"
            />
            <span className="text-gray-500 text-sm ml-2">
              AI-Powered Book Generation
            </span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="#"
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              Documentation
            </a>
            <a
              href="#"
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              Support
            </a>
            <a
              href="#"
              className="text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="GitHub"
            >
              <Github className="h-4 w-4" />
            </a>
            <a
              href="#"
              className="text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Twitter"
            >
              <Twitter className="h-4 w-4" />
            </a>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-800/50 text-center">
          <p className="text-gray-600 text-xs">
            &copy; {new Date().getFullYear()} HydraSkript. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
