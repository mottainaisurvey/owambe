'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore, PlatformMode } from '@/store/auth.store';
import { getDashboardShellMode, shouldSyncDashboardMode } from '@/lib/dashboardMode';
import { ModeSwitcher } from '@/components/ModeSwitcher';
import { ChangePasswordModal } from '@/components/ChangePasswordModal';
import { cn, initials } from '@/lib/utils';
import {
  Zap, Calendar, Plus, Globe, Scan, Clock, Mail,
  Mic, MapPin, Trophy, Smartphone, BarChart2, CreditCard,
  LogOut, Search, Bell, LayoutTemplate, FileSignature, Link2,
  Home, Bed, Compass, Star, Package, KeyRound
} from 'lucide-react';

// ─── Mode-aware navigation ────────────────────────────
type NavItem = {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: string | null;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const EVENTS_NAV: NavSection[] = [
  {
    label: 'Main',
    items: [
      { href: '/dashboard', icon: Zap, label: 'Dashboard' },
      { href: '/dashboard/events', icon: Calendar, label: 'My Events' },
      { href: '/dashboard/events/new', icon: Plus, label: 'Create Event' },
    ]
  },
  {
    label: 'Attendee Tools',
    items: [
      { href: '/dashboard/registration', icon: Globe, label: 'Reg. Page' },
      { href: '/dashboard/checkin', icon: Scan, label: 'Check-in Scanner' },
      { href: '/dashboard/waitlist', icon: Clock, label: 'Waitlist & Promos' },
    ]
  },
  {
    label: 'Marketing & Content',
    items: [
      { href: '/dashboard/emails', icon: Mail, label: 'Email Campaigns' },
      { href: '/dashboard/speakers', icon: Mic, label: 'Speaker Management' },
    ]
  },
  {
    label: 'Logistics',
    items: [
      { href: '/dashboard/venue', icon: MapPin, label: 'Venue & Map' },
      { href: '/dashboard/sponsors', icon: Trophy, label: 'Sponsors' },
    ]
  },
  {
    label: 'Tools',
    items: [
      { href: '/dashboard/mobile', icon: Smartphone, label: 'Attendee App' },
      { href: '/dashboard/analytics', icon: BarChart2, label: 'Analytics' },
      { href: '/dashboard/contracts', icon: FileSignature, label: 'Contracts & E-Sign' },
      { href: '/dashboard/crm', icon: Link2, label: 'CRM Sync', badge: 'Scale' },
      { href: '/dashboard/instalments', icon: CreditCard, label: 'Instalment Plans' },
      { href: '/dashboard/whitelabel', icon: LayoutTemplate, label: 'White-label Portal', badge: 'Scale' },
      { href: '/dashboard/pricing', icon: CreditCard, label: 'Pricing' },
    ]
  },
];

const STAYS_NAV: NavSection[] = [
  {
    label: 'Main',
    items: [
      { href: '/dashboard/stays', icon: Home, label: 'Dashboard' },
      { href: '/dashboard/stays/properties', icon: Bed, label: 'My Properties' },
      { href: '/dashboard/stays/properties/new', icon: Plus, label: 'Add Property' },
    ]
  },
  {
    label: 'Bookings',
    items: [
      { href: '/dashboard/stays/bookings', icon: Calendar, label: 'Bookings' },
      { href: '/dashboard/stays/calendar', icon: Clock, label: 'Availability Calendar' },
    ]
  },
  {
    label: 'Tools',
    items: [
      { href: '/dashboard/stays/analytics', icon: BarChart2, label: 'Analytics' },
      { href: '/dashboard/stays/reviews', icon: Star, label: 'Reviews' },
      { href: '/dashboard/pricing', icon: CreditCard, label: 'Pricing' },
    ]
  },
];

const EXPERIENCES_NAV: NavSection[] = [
  {
    label: 'Main',
    items: [
      { href: '/dashboard/experiences', icon: Compass, label: 'Dashboard' },
      { href: '/dashboard/experiences/list', icon: Package, label: 'My Experiences' },
      { href: '/dashboard/experiences/new', icon: Plus, label: 'Add Experience' },
    ]
  },
  {
    label: 'Bookings',
    items: [
      { href: '/dashboard/experiences/bookings', icon: Calendar, label: 'Bookings' },
      { href: '/dashboard/experiences/slots', icon: Clock, label: 'Manage Slots' },
    ]
  },
  {
    label: 'Tools',
    items: [
      { href: '/dashboard/experiences/analytics', icon: BarChart2, label: 'Analytics' },
      { href: '/dashboard/experiences/reviews', icon: Star, label: 'Reviews' },
      { href: '/dashboard/pricing', icon: CreditCard, label: 'Pricing' },
    ]
  },
];

const MODE_NAV: Record<PlatformMode, NavSection[]> = {
  EVENTS: EVENTS_NAV,
  STAYS: STAYS_NAV,
  EXPERIENCES: EXPERIENCES_NAV,
};

// ─── Mode-aware page titles ───────────────────────────
const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/events': 'My Events',
  '/dashboard/events/new': 'Create Event',
  '/dashboard/registration': 'Registration Page',
  '/dashboard/checkin': 'Check-in Scanner',
  '/dashboard/waitlist': 'Waitlist & Promos',
  '/dashboard/emails': 'Email Campaigns',
  '/dashboard/speakers': 'Speaker Management',
  '/dashboard/venue': 'Venue & Map',
  '/dashboard/sponsors': 'Sponsors',
  '/dashboard/mobile': 'Attendee App',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/pricing': 'Pricing',
  '/dashboard/contracts': 'Contracts & E-Sign',
  '/dashboard/crm': 'CRM Sync',
  '/dashboard/instalments': 'Instalment Plans',
  '/dashboard/whitelabel': 'White-label Portal',
  '/dashboard/stays': 'Stays Dashboard',
  '/dashboard/stays/properties': 'My Properties',
  '/dashboard/stays/bookings': 'Bookings',
  '/dashboard/stays/calendar': 'Availability Calendar',
  '/dashboard/stays/reviews': 'Reviews',
  '/dashboard/stays/analytics': 'Analytics',
  '/dashboard/experiences': 'Experiences Dashboard',
  '/dashboard/experiences/list': 'My Experiences',
  '/dashboard/experiences/bookings': 'Bookings',
  '/dashboard/experiences/slots': 'Manage Slots',
  '/dashboard/experiences/reviews': 'Reviews',
  '/dashboard/experiences/analytics': 'Analytics',
};

// ─── Layout ───────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // _hasHydrated is set to true inside onRehydrateStorage in the persist config,
  // which fires after localStorage data has been loaded into the store.
  // This reliably prevents the race condition where isAuthenticated is false
  // on first render before hydration has completed.
  const { user, isAuthenticated, logout, activeMode, setActiveMode, _hasHydrated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [showChangePwd, setShowChangePwd] = useState(false);

  useEffect(() => {
    if (_hasHydrated && !isAuthenticated) router.replace('/login');
  }, [_hasHydrated, isAuthenticated, router]);

  useEffect(() => {
    if (_hasHydrated && user && shouldSyncDashboardMode(pathname, activeMode)) {
      setActiveMode(getDashboardShellMode(pathname, activeMode));
    }
  }, [_hasHydrated, user, pathname, activeMode, setActiveMode]);

  if (!_hasHydrated || !user) return null;

  const shellMode = getDashboardShellMode(pathname, activeMode);
  const navSections = MODE_NAV[shellMode] ?? EVENTS_NAV;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
      {/* SIDEBAR */}
      <aside className="w-[212px] bg-[var(--dark)] flex flex-col flex-shrink-0 overflow-y-auto no-scrollbar">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-white/[0.08] flex-shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <img src="/owambe-logo-nav.png" alt="Owambe" className="h-14 w-auto" />
          </Link>
        </div>

        {/* Mode Switcher */}
        <div className="px-2.5 pt-3 pb-1 flex-shrink-0">
          <ModeSwitcher />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-2">
          {navSections.map((section) => (
            <div key={section.label}>
              <div className="text-[9px] uppercase tracking-[2px] text-white/20 px-2 py-2 mt-2">
                {section.label}
              </div>
              {section.items.map((item) => {
                const isActive = pathname === item.href ||
                  (item.href !== '/dashboard' &&
                   item.href !== '/dashboard/stays' &&
                   item.href !== '/dashboard/experiences' &&
                   pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn('nav-item mb-0.5', isActive && 'active')}
                  >
                    <item.icon size={15} className="shrink-0" />
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="ml-auto bg-[var(--accent2)] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="px-2.5 py-3 border-t border-white/[0.08] flex-shrink-0">
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer hover:bg-white/[0.06] transition-colors">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent2)] to-[var(--accent3)] flex items-center justify-center text-[11px] font-bold text-white shrink-0">
              {initials(user.firstName, user.lastName)}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] text-white/65 font-medium truncate">
                {user.firstName} {user.lastName}
              </div>
              <div className="text-[9px] text-[var(--accent2)] font-semibold tracking-wide">
                {user.planner?.plan || user.role} {user.planner ? 'PLAN' : ''}
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowChangePwd(true)}
            className="flex items-center gap-2.5 px-2.5 py-2 w-full rounded-lg text-white/40 text-sm hover:text-white hover:bg-white/[0.06] transition-colors mt-1"
          >
            <KeyRound size={14} />
            Change password
          </button>
          <button
            onClick={() => logout()}
            className="flex items-center gap-2.5 px-2.5 py-2 w-full rounded-lg text-white/40 text-sm hover:text-white hover:bg-white/[0.06] transition-colors mt-1"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>
      <ChangePasswordModal open={showChangePwd} onClose={() => setShowChangePwd(false)} />

      {/* MAIN */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

// ─── TopBar ───────────────────────────────────────────
function TopBar() {
  const pathname = usePathname();
  const { activeMode } = useAuthStore();
  const shellMode = getDashboardShellMode(pathname, activeMode);

  const title = PAGE_TITLES[pathname] ||
    (pathname.includes('/events/') ? 'Event Details' :
     pathname.includes('/properties/') ? 'Property Details' :
     pathname.includes('/experiences/') ? 'Experience Details' : 'Owambe');

  // Mode-aware CTA
  const ctaMap: Record<PlatformMode, { href: string; label: string }> = {
    EVENTS: { href: '/dashboard/events/new', label: 'New Event' },
    STAYS: { href: '/dashboard/stays/properties/new', label: 'Add Property' },
    EXPERIENCES: { href: '/dashboard/experiences/new', label: 'Add Experience' },
  };
  const cta = ctaMap[shellMode];

  return (
    <header className="bg-[var(--surface)] border-b border-[var(--border)] h-[52px] px-6 flex items-center gap-3 flex-shrink-0 sticky top-0 z-10">
      <h1 className="font-bold text-[16px] text-[var(--dark)] flex-1">{title}</h1>
      <button className="flex items-center gap-2 text-[var(--mid)] border border-[var(--border)] bg-transparent text-xs font-semibold px-3 py-1.5 rounded-md hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
        <Search size={13} />
        Search
      </button>
      <button className="relative text-[var(--muted)] hover:text-[var(--dark)] transition-colors">
        <Bell size={18} />
        <span className="absolute -top-1 -right-1 w-2 h-2 bg-[var(--accent2)] rounded-full" />
      </button>
      <Link
        href={cta.href}
        className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
      >
        <Plus size={13} />
        {cta.label}
      </Link>
    </header>
  );
}
