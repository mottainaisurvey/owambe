'use client';
import Link from 'next/link';
import { Compass, Package, Calendar, Star, BarChart2, Plus, ArrowRight } from 'lucide-react';

const QUICK_LINKS = [
  { href: '/dashboard/experiences/list', icon: Package, label: 'My Experiences', desc: 'Manage your experience listings' },
  { href: '/dashboard/experiences/bookings', icon: Calendar, label: 'Bookings', desc: 'View and manage guest bookings' },
  { href: '/dashboard/experiences/slots', icon: Calendar, label: 'Manage Slots', desc: 'Set availability and capacity' },
  { href: '/dashboard/experiences/reviews', icon: Star, label: 'Reviews', desc: 'Guest reviews and ratings' },
  { href: '/dashboard/experiences/analytics', icon: BarChart2, label: 'Analytics', desc: 'Booking and revenue insights' },
];

export default function ExperiencesDashboard() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🌍</span>
            <h1 className="text-2xl font-bold text-[var(--dark)]">Experiences Dashboard</h1>
          </div>
          <p className="text-[var(--mid)] text-sm">
            Offer curated experiences — tours, workshops, cultural events, and more. Set slots, accept bookings, and earn.
          </p>
        </div>
        <Link
          href="/dashboard/experiences/new"
          className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
        >
          <Plus size={15} />
          Add Experience
        </Link>
      </div>

      {/* Coming Soon Banner */}
      <div className="bg-gradient-to-r from-[var(--accent3)]/10 to-[var(--accent2)]/10 border border-[var(--accent3)]/20 rounded-xl p-5 mb-8">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--accent3)]/20 flex items-center justify-center shrink-0 mt-0.5">
            <Compass size={16} className="text-[var(--accent3)]" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--dark)] mb-1">Experiences Mode — Phase B Launch</h3>
            <p className="text-sm text-[var(--mid)]">
              Full experience listing, slot management, and booking tools are launching in Phase B.
              Infrastructure and database are ready. You can begin adding experiences now — they will be
              discoverable by guests when the marketplace goes live.
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
            className="group bg-white border border-[var(--border)] rounded-xl p-4 hover:border-[var(--accent3)] hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--accent3)]/10 flex items-center justify-center">
                <link.icon size={16} className="text-[var(--accent3)]" />
              </div>
              <ArrowRight size={14} className="text-[var(--muted)] group-hover:text-[var(--accent3)] transition-colors mt-1" />
            </div>
            <div className="font-semibold text-[var(--dark)] text-sm mb-1">{link.label}</div>
            <div className="text-xs text-[var(--mid)]">{link.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
