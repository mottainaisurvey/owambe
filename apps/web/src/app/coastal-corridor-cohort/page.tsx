'use client';
// CC-COHORT-OFFER-SURFACES-01 — Surface 2
// /coastal-corridor-cohort — dedicated landing page for the CC cohort bundled offer.
// Publicly accessible, no auth gate, search-engine indexable (no noindex).
// Email-capture form posts to POST /api/cohort/interest (Option B-lite per Amendment 01).

import { useState } from 'react';
import Link from 'next/link';
import {
  Waves, CheckCircle2, ArrowRight, Star, Zap, Home,
  Users, RefreshCw, Globe, BarChart2, Mail, Clock,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export default function CoastalCorridorCohortPage() {
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
      const res = await fetch(`${API_URL}/cohort/interest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus('success');
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
      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <nav className="bg-white/95 backdrop-blur-sm border-b border-[var(--border)] sticky top-0 z-20 shadow-sm">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-3">
          <Link href="/" className="flex-shrink-0">
            <img src="/owambe-logo-nav.png" alt="Owambe" className="h-14 w-auto" />
          </Link>
          <div className="flex-1" />
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
      <section className="max-w-4xl mx-auto px-5 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 bg-[var(--pill)] text-[var(--accent)] text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
          <Waves size={12} />
          Coastal Corridor Cohort — Exclusive Offer
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-[var(--dark)] mb-4 leading-tight">
          Free Owambe Growth tier.<br />
          <span className="text-[var(--accent)]">12 months. For CC cohort members.</span>
        </h1>
        <p className="text-lg text-[var(--muted)] max-w-2xl mx-auto mb-4">
          Coastal Corridor cohort hosts receive free Owambe Stays Growth tier access —
          worth approximately <strong className="text-[var(--dark)]">₦300,000 per property</strong>.
          Cohort operators receive free Experiences Growth tier access —
          worth approximately <strong className="text-[var(--dark)]">₦240,000 per operator</strong>.
        </p>
        <p className="text-sm text-[var(--muted)] mb-8">
          Operating in both modes? You get both, free, for the full 12 months.
        </p>
        {/* Primary CTA — email capture form */}
        <CohortInterestForm
          email={email}
          setEmail={setEmail}
          emailError={emailError}
          status={status}
          errorMessage={errorMessage}
          onSubmit={handleSubmit}
        />
      </section>

      {/* ── What's included ────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 pb-14">
        <h2 className="text-2xl font-bold text-[var(--dark)] mb-2 text-center">What's included</h2>
        <p className="text-sm text-[var(--muted)] text-center mb-8">
          Everything in the Growth tier, free for 12 months.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {/* Stays Growth */}
          <div className="card border-[var(--accent)]/30">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[var(--pill)] flex items-center justify-center">
                <Home size={16} className="text-[var(--accent)]" />
              </div>
              <h3 className="font-bold text-[var(--dark)]">Stays Growth tier</h3>
              <span className="ml-auto text-xs font-semibold text-[var(--accent)] bg-[var(--pill)] px-2 py-0.5 rounded-full">
                For CC hosts
              </span>
            </div>
            <ul className="space-y-2">
              {[
                'Unlimited properties listed',
                'Coastal Corridor channel sync',
                'Multi-currency settlement (NGN, USD, GBP)',
                'Channel manager — unified availability calendar',
                'Full analytics dashboard',
                'Direct booking page per property',
                'Email support + same-day onboarding',
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-[var(--dark)]">
                  <CheckCircle2 size={15} className="text-[var(--accent)] shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="text-xs text-[var(--muted)] mt-4 pt-3 border-t border-[var(--border)]">
              Standard price: ₦25,000/property/month after cohort period.
            </p>
          </div>
          {/* Experiences Growth */}
          <div className="card border-[var(--accent)]/30">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[var(--pill)] flex items-center justify-center">
                <Star size={16} className="text-[var(--accent)]" />
              </div>
              <h3 className="font-bold text-[var(--dark)]">Experiences Growth tier</h3>
              <span className="ml-auto text-xs font-semibold text-[var(--accent)] bg-[var(--pill)] px-2 py-0.5 rounded-full">
                For CC operators
              </span>
            </div>
            <ul className="space-y-2">
              {[
                'Unlimited experiences listed',
                'Coastal Corridor distribution',
                'Multi-currency settlement (NGN, USD, GBP)',
                'Slot-based booking calendar',
                'Full analytics dashboard',
                'Participant management + check-in',
                'Email support + same-day onboarding',
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-[var(--dark)]">
                  <CheckCircle2 size={15} className="text-[var(--accent)] shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="text-xs text-[var(--muted)] mt-4 pt-3 border-t border-[var(--border)]">
              Standard price: ₦20,000/month after cohort period.
            </p>
          </div>
        </div>
      </section>

      {/* ── Who it's for ───────────────────────────────────────────────── */}
      <section className="bg-white border-y border-[var(--border)]">
        <div className="max-w-4xl mx-auto px-5 py-14">
          <h2 className="text-2xl font-bold text-[var(--dark)] mb-2 text-center">Who it's for</h2>
          <p className="text-sm text-[var(--muted)] text-center mb-8">
            This offer is exclusively for members of the Coastal Corridor cohort.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: <Home size={20} className="text-[var(--accent)]" />,
                title: 'CC cohort hosts',
                body: 'Property owners and short-let operators who are part of the Coastal Corridor cohort programme.',
              },
              {
                icon: <Star size={20} className="text-[var(--accent)]" />,
                title: 'CC cohort operators',
                body: 'Experience operators — tours, activities, and local experiences — operating within the Coastal Corridor network.',
              },
              {
                icon: <Users size={20} className="text-[var(--accent)]" />,
                title: 'Both modes',
                body: 'Cohort members operating as both hosts and operators receive free access to both Growth tiers simultaneously.',
              },
            ].map((item) => (
              <div key={item.title} className="card text-center">
                <div className="w-10 h-10 rounded-full bg-[var(--pill)] flex items-center justify-center mx-auto mb-3">
                  {item.icon}
                </div>
                <h3 className="font-semibold text-[var(--dark)] mb-1">{item.title}</h3>
                <p className="text-sm text-[var(--muted)]">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-14">
        <h2 className="text-2xl font-bold text-[var(--dark)] mb-2 text-center">How it works</h2>
        <p className="text-sm text-[var(--muted)] text-center mb-8">Simple. No hidden conditions.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {[
            {
              icon: <Mail size={20} className="text-[var(--accent)]" />,
              step: '1',
              title: 'Register interest',
              body: 'Submit your email below. Our team will reach out with your cohort onboarding details.',
            },
            {
              icon: <Zap size={20} className="text-[var(--accent)]" />,
              step: '2',
              title: 'Activate your account',
              body: 'Create your Owambe account and activate your cohort code. Growth tier unlocks immediately.',
            },
            {
              icon: <Globe size={20} className="text-[var(--accent)]" />,
              step: '3',
              title: '12 months free',
              body: 'List your properties or experiences. Accept bookings via Owambe and Coastal Corridor.',
            },
            {
              icon: <RefreshCw size={20} className="text-[var(--accent)]" />,
              step: '4',
              title: 'Auto-converts to Growth',
              body: 'After 12 months, your account auto-converts to Growth at standard pricing. Cancel any time before.',
            },
          ].map((item) => (
            <div key={item.step} className="card text-center relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-[var(--accent)] text-white text-xs font-bold flex items-center justify-center">
                {item.step}
              </div>
              <div className="w-10 h-10 rounded-full bg-[var(--pill)] flex items-center justify-center mx-auto mb-3 mt-2">
                {item.icon}
              </div>
              <h3 className="font-semibold text-[var(--dark)] mb-1 text-sm">{item.title}</h3>
              <p className="text-xs text-[var(--muted)]">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Why it exists ──────────────────────────────────────────────── */}
      <section className="bg-white border-y border-[var(--border)]">
        <div className="max-w-4xl mx-auto px-5 py-14">
          <h2 className="text-2xl font-bold text-[var(--dark)] mb-2 text-center">Why this offer exists</h2>
          <p className="text-sm text-[var(--muted)] text-center mb-8 max-w-2xl mx-auto">
            Owambe and Coastal Corridor are sister ventures. This isn't a discount — it's operational tooling.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--pill)] flex items-center justify-center shrink-0">
                  <Waves size={16} className="text-[var(--accent)]" />
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--dark)] mb-1">Sister ventures, shared mission</h3>
                  <p className="text-sm text-[var(--muted)]">
                    Owambe and Coastal Corridor are built by the same founding team. The cohort offer
                    is a structural commitment — not a promotional campaign.
                  </p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--pill)] flex items-center justify-center shrink-0">
                  <BarChart2 size={16} className="text-[var(--accent)]" />
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--dark)] mb-1">Operational tooling, not just discount</h3>
                  <p className="text-sm text-[var(--muted)]">
                    Growth tier gives cohort members the channel manager, analytics, and multi-currency
                    settlement they need to run a professional operation — from day one.
                  </p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--pill)] flex items-center justify-center shrink-0">
                  <Globe size={16} className="text-[var(--accent)]" />
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--dark)] mb-1">Cross-platform reinforcement</h3>
                  <p className="text-sm text-[var(--muted)]">
                    Coastal Corridor drives demand. Owambe provides the back-office. Both platforms
                    grow stronger when cohort members are fully operational on both.
                  </p>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--pill)] flex items-center justify-center shrink-0">
                  <Clock size={16} className="text-[var(--accent)]" />
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--dark)] mb-1">12 months to prove the model</h3>
                  <p className="text-sm text-[var(--muted)]">
                    The cohort period gives members time to build occupancy and revenue before
                    Growth tier pricing applies. Auto-conversion is designed to be frictionless —
                    cancel before the 12 months if you need to.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA (repeat) ────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16 text-center">
        <h2 className="text-2xl font-bold text-[var(--dark)] mb-3">
          Ready to claim your cohort offer?
        </h2>
        <p className="text-[var(--muted)] mb-8 max-w-xl mx-auto">
          Register your interest below. Our team will send your cohort onboarding details
          and activation code within 24 hours.
        </p>
        <CohortInterestForm
          email={email}
          setEmail={setEmail}
          emailError={emailError}
          status={status}
          errorMessage={errorMessage}
          onSubmit={handleSubmit}
        />
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
            <Link href="/stays" className="hover:text-[var(--dark)]">Stays</Link>
          </div>
          <p className="text-xs text-[var(--muted)]">© 2026 Owambe. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

// ─── CohortInterestForm component ────────────────────────────────────────────
interface CohortInterestFormProps {
  email: string;
  setEmail: (v: string) => void;
  emailError: string;
  status: 'idle' | 'submitting' | 'success' | 'error';
  errorMessage: string;
  onSubmit: (e: React.FormEvent) => void;
}

function CohortInterestForm({
  email, setEmail, emailError, status, errorMessage, onSubmit,
}: CohortInterestFormProps) {
  if (status === 'success') {
    return (
      <div className="inline-flex flex-col items-center gap-3 bg-[var(--pill)] border border-[var(--accent)]/30 rounded-xl px-8 py-6 max-w-md mx-auto">
        <CheckCircle2 size={32} className="text-[var(--accent)]" />
        <p className="font-semibold text-[var(--dark)] text-center">
          You're on the list.
        </p>
        <p className="text-sm text-[var(--muted)] text-center">
          We'll be in touch with your cohort onboarding details within 24 hours.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto"
      noValidate
    >
      <div className="flex-1 flex flex-col gap-1">
        <label htmlFor="cohort-email" className="sr-only">
          Your email address
        </label>
        <input
          id="cohort-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className={`input w-full ${emailError ? 'border-red-400 focus:border-red-500' : ''}`}
          disabled={status === 'submitting'}
          autoComplete="email"
        />
        {emailError && (
          <p className="text-xs text-red-500 text-left" role="alert">
            {emailError}
          </p>
        )}
        {status === 'error' && (
          <p className="text-xs text-red-500 text-left" role="alert">
            {errorMessage}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="btn-primary px-6 py-2.5 text-sm whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {status === 'submitting' ? (
          <>
            <RefreshCw size={14} className="animate-spin" />
            Sending…
          </>
        ) : (
          <>
            Register interest <ArrowRight size={14} />
          </>
        )}
      </button>
    </form>
  );
}
