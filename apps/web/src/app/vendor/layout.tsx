'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { cn, initials } from '@/lib/utils';
import { ChangePasswordModal } from '@/components/ChangePasswordModal';
import {
  LayoutDashboard, BookOpen, Calendar, BarChart2,
  Star, MessageSquare, Settings, LogOut, Bell, Package, KeyRound
} from 'lucide-react';

const NAV = [
  { href: '/vendor', icon: LayoutDashboard, label: 'Overview' },
  { href: '/vendor/bookings', icon: BookOpen, label: 'Bookings' },
  { href: '/vendor/availability', icon: Calendar, label: 'Availability' },
  { href: '/vendor/packages', icon: Package, label: 'Packages' },
  { href: '/vendor/analytics', icon: BarChart2, label: 'Revenue' },
  { href: '/vendor/reviews', icon: Star, label: 'Reviews' },
  { href: '/vendor/messages', icon: MessageSquare, label: 'Messages' },
  { href: '/vendor/settings', icon: Settings, label: 'Settings' },
];

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout, _hasHydrated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [showChangePwd, setShowChangePwd] = useState(false);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated) router.replace('/login');
    else if (user?.role !== 'VENDOR') router.replace('/dashboard');
  }, [_hasHydrated, isAuthenticated, user, router]);

  // Show loading spinner while store hydrates (wait for _hasHydrated to prevent race condition)
  if (!_hasHydrated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
      <aside className="w-[200px] bg-[var(--dark)] flex flex-col flex-shrink-0">
        <div className="px-4 py-5 border-b border-white/[0.08]">
          <Link href="/vendor" className="flex flex-col gap-0.5">
            <img src="/owambe-logo-nav.png" alt="Owambe" className="h-14 w-auto" />
            <div className="text-[9px] text-white/30 uppercase tracking-[2px]">Vendor Portal</div>
          </Link>
        </div>
        <nav className="flex-1 px-2.5 py-3 space-y-0.5">
          {NAV.map((item) => {
            const active = pathname === item.href ||
              (item.href !== '/vendor' && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}
                className={cn('nav-item', active && 'active')}>
                <item.icon size={14} className="shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-2.5 py-3 border-t border-white/[0.08]">
          <div className="flex items-center gap-2.5 px-2.5 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent2)] to-[var(--accent3)] flex items-center justify-center text-[11px] font-bold text-white">
              {initials(user.firstName, user.lastName)}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-white/65 font-medium truncate">{user.firstName}</div>
              <div className="text-[9px] text-[var(--accent2)] font-semibold">VENDOR</div>
            </div>
          </div>
          <button
            onClick={() => setShowChangePwd(true)}
            className="flex items-center gap-2 px-2.5 py-2 w-full rounded-lg text-white/40 text-xs hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <KeyRound size={12} /> Change password
          </button>
          <button onClick={() => logout()}
            className="flex items-center gap-2 px-2.5 py-2 w-full rounded-lg text-white/40 text-xs hover:text-white hover:bg-white/[0.06] transition-colors">
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </aside>
      <ChangePasswordModal open={showChangePwd} onClose={() => setShowChangePwd(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-[var(--surface)] border-b border-[var(--border)] h-[52px] px-6 flex items-center gap-3 flex-shrink-0">
          <h1 className="font-bold text-[15px] text-[var(--dark)] flex-1">
            {NAV.find(n => pathname === n.href || (n.href !== '/vendor' && pathname.startsWith(n.href)))?.label || 'Vendor Portal'}
          </h1>
          <button className="relative text-[var(--muted)] hover:text-[var(--dark)]">
            <Bell size={18} />
          </button>
          <Link href="/vendor/settings"
            className="btn-primary text-xs px-3 py-1.5">
            ⚙ Settings
          </Link>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
