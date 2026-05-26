// CC-COHORT-OFFER-SURFACES-01 — Surface 1
// /stays — public mode landing page for Stays operators.
// The cohort callout is the primary visible content in the operator section
// per AC-8 Item 1 edge case: "/stays page operator section currently empty or
// placeholder — callout becomes the primary visible content until other
// operator content ships."

import type { Metadata } from 'next';
import Link from 'next/link';
import { Home, Star, Zap, ArrowRight, MapPin, Waves } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Owambe Stays — List Your Property',
  description:
    'List your property on Owambe Stays and reach guests across Nigeria and beyond. ' +
    'Coastal Corridor cohort members get free Growth tier access for 12 months.',
};

export default function StaysPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <nav className="bg-white/95 backdrop-blur-sm border-b border-[var(--border)] sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-3">
          <Link href="/" className="flex-shrink-0">
            <img
              src="/owambe-logo-nav.png"
              alt="Owambe"
              className="h-14 w-auto"
            />
          </Link>
          <div className="flex-1" />
          <div className="hidden md:flex items-center gap-1">
            <Link
              href="/vendors"
              className="px-3 py-2 text-sm text-[var(--mid)] hover:text-[var(--dark)] rounded-lg hover:bg-[var(--bg)] transition-colors"
            >
              Browse Vendors
            </Link>
          </div>
          <div className="flex gap-2 ml-1">
            <Link href="/login" className="hidden sm:inline-flex btn-secondary text-sm px-4 py-2">
              Sign in
            </Link>
            <Link href="/register" className="btn-primary text-sm px-4 py-2">
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-5 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 bg-[var(--pill)] text-[var(--accent)] text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
          <Home size={12} />
          Owambe Stays — Now Live
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-[var(--dark)] mb-4 leading-tight">
          List your property.<br />
          <span className="text-[var(--accent)]">Reach guests across Nigeria.</span>
        </h1>
        <p className="text-lg text-[var(--muted)] max-w-2xl mx-auto mb-8">
          Owambe Stays connects property owners and short-let operators with guests booking
          directly and via Coastal Corridor — Nigeria's premier coastal travel platform.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/register" className="btn-primary px-6 py-3 text-base">
            List your property →
          </Link>
          <Link href="/login" className="btn-secondary px-6 py-3 text-base">
            Sign in to dashboard
          </Link>
        </div>
      </section>

      {/* ── Operator section ───────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-5 pb-16">

        {/* ── CC Cohort Callout (AC-1 primary callout) ─────────────────── */}
        {/* Reuses the established inline banner pattern from /dashboard/stays
            (gradient, border, icon, heading, body, CTA link) per AC-8 Item 4. */}
        <div
          id="cc-cohort-callout"
          className="bg-gradient-to-r from-[var(--accent)]/10 to-[var(--accent2)]/10 border border-[var(--accent)]/30 rounded-xl p-5 mb-10"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-[var(--accent)]/20 flex items-center justify-center shrink-0 mt-0.5">
              <Waves size={18} className="text-[var(--accent)]" />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-[var(--dark)] text-base mb-1">
                Coastal Corridor cohort? Get Stays Growth free for 12 months.
              </h2>
              <p className="text-sm text-[var(--muted)] mb-3">
                Coastal Corridor cohort hosts receive free Owambe Stays Growth tier access for
                12 months — worth approximately ₦300,000 per property. Operators using both
                modes also receive free Experiences Growth tier access.
              </p>
              <Link
                href="/coastal-corridor-cohort"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)] hover:underline"
              >
                Learn more about the cohort offer <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>

        {/* ── Feature grid ─────────────────────────────────────────────── */}
        <h2 className="text-2xl font-bold text-[var(--dark)] mb-6 text-center">
          Everything you need to run your property
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
          {[
            {
              icon: <MapPin size={20} className="text-[var(--accent)]" />,
              title: 'Direct bookings',
              body: 'Accept bookings directly from guests via your Owambe property page. No OTA commission on direct traffic.',
            },
            {
              icon: <Waves size={20} className="text-[var(--accent)]" />,
              title: 'Coastal Corridor sync',
              body: 'Push your property to Coastal Corridor with one click. Reach their entire guest network automatically.',
            },
            {
              icon: <Star size={20} className="text-[var(--accent)]" />,
              title: 'Multi-currency settlement',
              body: 'Receive payments in NGN, USD, or GBP. Owambe handles currency conversion and settlement.',
            },
            {
              icon: <Zap size={20} className="text-[var(--accent)]" />,
              title: 'Channel manager',
              body: 'Manage availability across Coastal Corridor, direct bookings, and other channels from one calendar.',
            },
            {
              icon: <Home size={20} className="text-[var(--accent)]" />,
              title: 'Unlimited properties',
              body: 'List as many properties as you operate. No per-property caps on the Growth tier.',
            },
            {
              icon: <ArrowRight size={20} className="text-[var(--accent)]" />,
              title: 'Analytics dashboard',
              body: 'Track occupancy, revenue, and channel performance. Understand what drives bookings.',
            },
          ].map((f) => (
            <div key={f.title} className="card">
              <div className="w-9 h-9 rounded-lg bg-[var(--pill)] flex items-center justify-center mb-3">
                {f.icon}
              </div>
              <h3 className="font-semibold text-[var(--dark)] mb-1">{f.title}</h3>
              <p className="text-sm text-[var(--muted)]">{f.body}</p>
            </div>
          ))}
        </div>

        {/* ── Bottom CTA ───────────────────────────────────────────────── */}
        <div className="text-center">
          <Link href="/register" className="btn-primary px-8 py-3 text-base">
            Start listing your property →
          </Link>
          <p className="text-xs text-[var(--muted)] mt-3">
            Free to list. Growth tier from ₦25,000/property/month.
          </p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)] bg-white">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex-shrink-0">
            <img src="/owambe-logo-nav.png" alt="Owambe" className="h-10 w-auto" />
          </Link>
          <div className="flex flex-wrap gap-4 text-sm text-[var(--muted)]">
            <Link href="/privacy" className="hover:text-[var(--dark)]">Privacy</Link>
            <Link href="/terms" className="hover:text-[var(--dark)]">Terms</Link>
            <Link href="/contact" className="hover:text-[var(--dark)]">Contact</Link>
          </div>
          <p className="text-xs text-[var(--muted)]">© 2026 Owambe. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
