'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { initials } from '@/lib/utils';
import { Sparkles, Search, Heart, Bell, Menu } from 'lucide-react';

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Top nav */}
      <nav className="bg-white border-b border-[var(--border)] sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-4">
          <Link href="/" className="shrink-0">
            <img src="/owambe-logo-nav.png" alt="Owambe" className="h-14 w-auto" />
          </Link>
          <div className="flex-1" />
          <nav className="hidden md:flex items-center gap-1">
            <Link href="/vendors" className="px-3 py-1.5 text-sm text-[var(--mid)] hover:text-[var(--dark)] rounded-lg hover:bg-[var(--bg)] transition-colors">
              Browse Vendors
            </Link>
            <Link href="/plan" className="px-3 py-1.5 text-sm font-semibold text-[var(--accent)] rounded-lg hover:bg-[var(--pill)] transition-colors flex items-center gap-1">
              <Sparkles size={13} /> Plan with AI
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            {isAuthenticated && user ? (
              <div className="flex items-center gap-2">
                <Link href="/plan/saved" className="text-[var(--muted)] hover:text-[var(--dark)]">
                  <Heart size={18} />
                </Link>
                <Link href="/dashboard" className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent2)] to-[var(--accent3)] flex items-center justify-center text-[11px] font-bold text-white">
                  {initials(user.firstName, user.lastName)}
                </Link>
              </div>
            ) : (
              <div className="flex gap-2">
                <Link href="/login" className="btn-secondary text-xs px-3 py-1.5">Sign in</Link>
                <Link href="/register" className="btn-primary text-xs px-3 py-1.5">Get started</Link>
              </div>
            )}
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
