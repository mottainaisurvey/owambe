'use client';
// OWAMBE-DOT-COM-PLACEHOLDER-01
// Root / — owambe.com placeholder page.
// Replaces the pre-launch homepage with a substantive identity + interest-capture surface.
// Sections: Navbar · Hero · What Owambe is becoming (4 modes) · Cohort offer · Interest capture · Footer
// Copy: developer-drafted per strategy v1.4 §01–§02.5 + brief §2.1; founder refines before DNS cutover.
// Interest-capture: POST /api/cohort/interest (reused from CC-COHORT-OFFER-SURFACES-01, Option B-simple).
// No new backend. No DB changes.
import { useState } from 'react';
import Link from 'next/link';
import {
  Sparkles, Calendar, Home, Compass, Store,
  ArrowRight, CheckCircle2, Mail, Clock,
  ChevronRight, Zap,
} from 'lucide-react';

// ─── Mode definitions ──────────────────────────────────────────────────────
const MODES = [
  {
    icon: Calendar,
    name: 'Owambe Events',
    tagline: 'How Nigerian event planners run their business.',
    description:
      "Plan events, book vendors, sell tickets, manage attendees, run email campaigns, handle contracts — all in one place. Whether you're an independent planner, a wedding agency, or a corporate events team, Owambe Events replaces the fragmented stack of WhatsApp, spreadsheets, and bank transfers you're currently juggling.",
    status: 'Available now',
    statusColor: 'var(--success)',
    accent: 'var(--accent)',
    ctaHref: '/login',
    ctaLabel: 'Start planning',
  },
  {
    icon: Home,
    name: 'Owambe Stays',
    tagline: 'How Nigerian hosts run their property.',
    description:
      'Manage rooms and availability, accept reservations, communicate with guests, coordinate housekeeping and vendors, handle contracts and payments, and distribute your property across multiple booking channels. Built for diaspora-owned beach houses, boutique guesthouses, independent hotels, and resort operators who deserve a platform that understands Nigerian hospitality.',
    status: 'Launching soon',
    statusColor: 'var(--accent2)',
    accent: 'var(--accent2)',
    ctaHref: '/stays',
    ctaLabel: 'Learn about Stays',
  },
  {
    icon: Compass,
    name: 'Owambe Experiences',
    tagline: 'How Nigerian operators run their tours and experiences.',
    description:
      'Manage time-slot availability, accept group and individual bookings, coordinate guides and equipment, handle contracts for corporate clients, and distribute your inventory to multi-channel partners. Built for tour guides, boat charters, cultural workshops, food experiences, and transport operators running tourism services.',
    status: 'Launching soon',
    statusColor: 'var(--accent2)',
    accent: 'var(--accent3)',
    ctaHref: '/login',
    ctaLabel: 'Register interest',
  },
  {
    icon: Store,
    name: 'Vendors Marketplace',
    tagline: 'Where service businesses get found and hired.',
    description:
      "Photographers, caterers, decorators, AV teams, entertainers, and every other service business that makes Nigerian events, stays, and experiences possible — all in one searchable marketplace. Vendors get discovered and booked; planners, hosts, and operators get the right people for the job without the WhatsApp chaos.",
    status: 'Available now',
    statusColor: 'var(--success)',
    accent: 'var(--accent)',
    ctaHref: '/vendors',
    ctaLabel: 'Browse vendors',
  },
];

// ─── Cohort offer items ────────────────────────────────────────────────────
const COHORT_ITEMS = [
  {
    icon: '🏡',
    title: 'Free Owambe Stays Growth — 12 months',
    desc: 'Full Growth-tier access to Owambe Stays for every Coastal Corridor host. Channel manager, multi-property management, advanced guest communication, and priority support. No charge for the first 12 months.',
  },
  {
    icon: '🧭',
    title: 'Free Owambe Experiences Growth — 12 months',
    desc: 'Full Growth-tier access to Owambe Experiences for every Coastal Corridor operator. Time-slot management, group booking, guide coordination, and multi-channel distribution. No charge for the first 12 months.',
  },
  {
    icon: '🔄',
    title: 'Auto-converts to Growth after 12 months',
    desc: 'After the free period, your account converts to the standard Owambe Growth tier at the published rate. No surprises, no lock-in.',
  },
  {
    icon: '🤝',
    title: 'Coastal Corridor × Owambe integration',
    desc: 'Your Owambe account connects directly to your Coastal Corridor listing. Reservations, availability, and guest communication flow between both platforms so you manage one business, not two dashboards.',
  },
];

export default function PlaceholderHomePage() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  function validateEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError('');
    setErrorMessage('');

    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address.');
      return;
    }

    setStatus('submitting');
    try {
      const res = await fetch('/api/cohort/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus('success');
        setEmail('');
      } else {
        setStatus('error');
        setErrorMessage(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setStatus('error');
      setErrorMessage('Network error. Please check your connection and try again.');
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">

      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav className="bg-white/95 backdrop-blur-sm border-b border-[var(--border)] sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-3">
          <Link href="/" className="flex-shrink-0">
            <img src="/owambe-logo-nav.png" alt="Owambe" className="h-14 w-auto" />
          </Link>
          <div className="flex-1" />
          <div className="hidden md:flex items-center gap-1">
            <Link href="/vendors" className="px-3 py-2 text-sm text-[var(--mid)] hover:text-[var(--dark)] transition-colors rounded-lg hover:bg-[var(--bg)]">
              Browse Vendors
            </Link>
            <Link href="/stays" className="px-3 py-2 text-sm text-[var(--mid)] hover:text-[var(--dark)] transition-colors rounded-lg hover:bg-[var(--bg)]">
              For Hosts
            </Link>
            <Link href="/coastal-corridor-cohort" className="px-3 py-2 text-sm text-[var(--mid)] hover:text-[var(--dark)] transition-colors rounded-lg hover:bg-[var(--bg)]">
              CC Cohort Offer
            </Link>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <Link href="/login" className="px-4 py-2 text-sm font-medium text-[var(--mid)] hover:text-[var(--dark)] transition-colors">
              Sign in
            </Link>
            <Link href="/register" className="btn-primary text-sm px-4 py-2">
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full opacity-[0.06] blur-3xl pointer-events-none"
          style={{ background: 'var(--accent)' }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full opacity-[0.04] blur-3xl pointer-events-none"
          style={{ background: 'var(--accent2)' }} />

        <div className="max-w-6xl mx-auto px-5 pt-20 pb-24 text-center relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 border"
            style={{ background: 'rgba(108,43,217,0.06)', borderColor: 'rgba(108,43,217,0.15)', color: 'var(--accent)' }}>
            <Sparkles size={12} />
            Nigeria&apos;s operating system for service businesses
          </div>

          <h1 className="text-4xl md:text-6xl font-bold text-[var(--dark)] leading-tight mb-6 max-w-4xl mx-auto">
            One platform.{' '}
            <span style={{ color: 'var(--accent)' }}>Three modes.</span>{' '}
            Every Nigerian service business.
          </h1>

          <p className="text-lg md:text-xl text-[var(--mid)] max-w-2xl mx-auto mb-10 leading-relaxed">
            Owambe is becoming the platform Nigerian event planners, property hosts, and experience operators use to run their businesses — with a shared vendor marketplace where service businesses get found and hired.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register" className="btn-primary px-6 py-3 text-base">
              Get early access <ArrowRight size={16} />
            </Link>
            <Link href="/vendors" className="px-6 py-3 text-base font-medium text-[var(--mid)] hover:text-[var(--dark)] border border-[var(--border)] rounded-lg bg-white hover:border-[var(--accent)] transition-all">
              Browse vendors
            </Link>
          </div>

          <div className="mt-10 flex items-center justify-center gap-2 text-sm text-[var(--muted)]">
            <Clock size={14} />
            Building in public · Lagos, Nigeria
          </div>
        </div>
      </section>

      {/* ── What Owambe is becoming ──────────────────────────────────────── */}
      <section className="bg-white border-y border-[var(--border)] py-24">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-16">
            <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--accent2)' }}>
              What Owambe is becoming
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-[var(--dark)] mb-4">
              One platform. Three sector-native modes.
            </h2>
            <p className="text-[var(--mid)] max-w-2xl mx-auto text-lg">
              Each mode is a complete operating system for a specific sector — same platform underneath, sector-native vocabulary and workflow on the surface.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {MODES.map((mode) => {
              const Icon = mode.icon;
              return (
                <div key={mode.name} className="card group hover:shadow-md transition-all duration-200">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${mode.accent}14` }}>
                      <Icon size={20} style={{ color: mode.accent }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-bold text-[var(--dark)] text-lg">{mode.name}</h3>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: `${mode.statusColor}14`, color: mode.statusColor }}>
                          {mode.status}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--muted)] italic">{mode.tagline}</p>
                    </div>
                  </div>
                  <p className="text-[var(--mid)] text-sm leading-relaxed mb-5">
                    {mode.description}
                  </p>
                  <Link href={mode.ctaHref}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors group-hover:gap-2.5"
                    style={{ color: mode.accent }}>
                    {mode.ctaLabel} <ChevronRight size={14} />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Coastal Corridor cohort offer ────────────────────────────────── */}
      <section className="py-24 max-w-6xl mx-auto px-5" id="cohort-offer">
        <div className="rounded-2xl border p-8 md:p-12 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(108,43,217,0.04) 0%, rgba(201,162,39,0.06) 100%)',
            borderColor: 'rgba(108,43,217,0.15)',
          }}>
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.05] blur-3xl pointer-events-none"
            style={{ background: 'var(--accent2)' }} />

          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 border"
              style={{ background: 'rgba(201,162,39,0.08)', borderColor: 'rgba(201,162,39,0.20)', color: 'var(--accent2)' }}>
              <Zap size={12} />
              Coastal Corridor cohort — exclusive offer
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-[var(--dark)] mb-4 leading-tight">
                  Coastal Corridor hosts and operators get Owambe Growth free for 12 months.
                </h2>
                <p className="text-[var(--mid)] leading-relaxed mb-6">
                  As a Coastal Corridor cohort member, you get full Growth-tier access to the Owambe mode that matches your business — completely free for your first 12 months. This is the Coastal Corridor × Owambe integration offer per the Owambe Repositioning Strategy.
                </p>
                <Link href="/coastal-corridor-cohort"
                  className="inline-flex items-center gap-2 font-semibold text-sm transition-colors"
                  style={{ color: 'var(--accent)' }}>
                  See the full cohort offer details <ArrowRight size={14} />
                </Link>
              </div>

              <div className="space-y-4">
                {COHORT_ITEMS.map((item) => (
                  <div key={item.title} className="flex gap-3 p-4 rounded-xl bg-white border border-[var(--border)]">
                    <span className="text-xl flex-shrink-0 mt-0.5">{item.icon}</span>
                    <div>
                      <div className="font-semibold text-[var(--dark)] text-sm mb-1">{item.title}</div>
                      <div className="text-xs text-[var(--muted)] leading-relaxed">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Interest capture ─────────────────────────────────────────────── */}
      <section className="bg-[var(--dark)] py-24 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.06] blur-3xl pointer-events-none"
          style={{ background: 'var(--accent)' }} />

        <div className="max-w-2xl mx-auto px-5 text-center relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 border"
            style={{ background: 'rgba(201,162,39,0.12)', borderColor: 'rgba(201,162,39,0.25)', color: 'var(--accent2)' }}>
            <Mail size={12} />
            Stay in the loop
          </div>

          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight">
            Know when Owambe is ready for you.
          </h2>
          <p className="text-white/60 text-lg mb-10 leading-relaxed">
            We&apos;re building this in public. Leave your email and we&apos;ll reach out when the mode that matches your business is ready for onboarding — no spam, no pressure.
          </p>

          {status === 'success' ? (
            <div className="flex items-center justify-center gap-3 py-5 px-6 rounded-xl border"
              style={{ background: 'rgba(5,150,105,0.12)', borderColor: 'rgba(5,150,105,0.25)' }}>
              <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
              <span className="text-white font-medium">You&apos;re on the list. We&apos;ll be in touch.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <div className="flex-1">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
                  placeholder="your@email.com"
                  disabled={status === 'submitting'}
                  className="w-full px-4 py-3 rounded-lg text-sm bg-white/10 border text-white placeholder-white/40 focus:outline-none focus:ring-2 transition-all disabled:opacity-50"
                  style={{ borderColor: emailError ? 'var(--danger)' : 'rgba(255,255,255,0.15)' }}
                />
                {emailError && (
                  <p className="text-xs mt-1.5 text-left" style={{ color: 'var(--danger)' }}>{emailError}</p>
                )}
                {status === 'error' && (
                  <p className="text-xs mt-1.5 text-left" style={{ color: 'var(--danger)' }}>{errorMessage}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={status === 'submitting'}
                className="btn-primary px-5 py-3 text-sm whitespace-nowrap disabled:opacity-50"
              >
                {status === 'submitting' ? 'Sending…' : 'Notify me'}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)] py-8 bg-white">
        <div className="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <img src="/owambe-logo-nav.png" alt="Owambe" className="h-11 w-auto" />
          <div className="text-xs text-[var(--muted)]">
            © 2026 Owambe.com · Lagos, Nigeria 🇳🇬
          </div>
          <div className="flex gap-5 text-xs text-[var(--muted)]">
            <a href="mailto:hello@owambe.com" className="hover:text-[var(--dark)] transition-colors">hello@owambe.com</a>
            <Link href="/terms" className="hover:text-[var(--dark)] transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-[var(--dark)] transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
