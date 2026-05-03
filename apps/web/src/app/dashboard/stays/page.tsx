'use client';
import Link from 'next/link';
import { Home, Bed, Calendar, Star, BarChart2, Plus, ArrowRight } from 'lucide-react';

const QUICK_LINKS = [
  { href: '/dashboard/stays/properties', icon: Bed, label: 'My Properties', desc: 'Manage your listed properties' },
  { href: '/dashboard/stays/bookings', icon: Calendar, label: 'Bookings', desc: 'View and manage guest bookings' },
  { href: '/dashboard/stays/calendar', icon: Calendar, label: 'Availability', desc: 'Set availability and pricing' },
  { href: '/dashboard/stays/reviews', icon: Star, label: 'Reviews', desc: 'Guest reviews and ratings' },
  { href: '/dashboard/stays/analytics', icon: BarChart2, label: 'Analytics', desc: 'Revenue and occupancy insights' },
];

export default function StaysDashboard() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🏡</span>
            <h1 className="text-2xl font-bold text-[var(--dark)]">Stays Dashboard</h1>
          </div>
          <p className="text-[var(--mid)] text-sm">
            List and manage your short-stay properties. Accept bookings, set availability, and earn.
          </p>
        </div>
        <Link
          href="/dashboard/stays/properties/new"
          className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
        >
          <Plus size={15} />
          Add Property
        </Link>
      </div>

      {/* Coming Soon Banner */}
      <div className="bg-gradient-to-r from-[var(--accent)]/10 to-[var(--accent2)]/10 border border-[var(--accent)]/20 rounded-xl p-5 mb-8">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--accent)]/20 flex items-center justify-center shrink-0 mt-0.5">
            <Home size={16} className="text-[var(--accent)]" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--dark)] mb-1">Stays Mode — Phase B Launch</h3>
            <p className="text-sm text-[var(--mid)]">
              Full property listing, booking management, and guest communication tools are launching in Phase B.
              Infrastructure and database are ready. You can begin adding properties now — they will be visible
              to guests when the marketplace goes live.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group bg-white border border-[var(--border)] rounded-xl p-4 hover:border-[var(--accent)] hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
                <link.icon size={16} className="text-[var(--accent)]" />
              </div>
              <ArrowRight size={14} className="text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors mt-1" />
            </div>
            <div className="font-semibold text-[var(--dark)] text-sm mb-1">{link.label}</div>
            <div className="text-xs text-[var(--mid)]">{link.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
