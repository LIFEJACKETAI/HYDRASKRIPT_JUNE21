/**
 * Shared layout for public marketing routes.
 * Does not wrap <html>/<body> — the root layout already does that.
 */

import { NavBar } from '@/components/marketing/NavBar';
import { Footer } from '@/components/marketing/Footer';

export const metadata = {
  title: 'HydraSkript - Your Book. All the Way Through.',
  description:
    'AI-powered book publishing from idea to bookshelf — Story Intelligence, Editorial Review, Formatting, Audiobook, and more.',
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black text-white">
      <NavBar />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
