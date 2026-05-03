import Link from 'next/link';
import { Sparkles, Star, Zap, Shield, Users, ArrowRight } from 'lucide-react';

export default function HomePage() {
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
          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1">
            <Link
              href="/vendors"
              className="px-3 py-2 text-sm text-[var(--mid)] hover:text-[var(--dark)] rounded-lg hover:bg-[var(--bg)] transition-colors"
            >
              Browse Vendors
            </Link>
            <Link
              href="/plan"
              className="px-3 py-2 text-sm font-semibold text-[var(--accent)] rounded-lg hover:bg-[var(--pill)] transition-colors flex items-center gap-1.5"
            >
              <Sparkles size={13} /> Plan with AI
            </Link>
          </div>
          {/* CTA buttons — responsive */}
          <div className="flex gap-2 ml-1">
            {/* Sign in — text link on mobile, outlined button on desktop */}
            <Link
              href="/login"
              className="hidden sm:inline-flex btn-secondary text-sm px-4 py-2"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="sm:hidden text-sm font-medium text-[var(--mid)] px-2 py-2 hover:text-[var(--dark)] transition-colors"
            >
              Sign in
            </Link>
            {/* Purple = product/auth CTA */}
            <Link
              href="/register"
              className="btn-primary text-sm px-3 sm:px-5 py-2"
            >
              <span className="hidden sm:inline">Get started free</span>
              <span className="sm:hidden">Start free</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">

        {/* Rich layered background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#F5F0FF] via-[#E8E0FF] to-[#F0EBFF] pointer-events-none" />

        {/* Decorative dot-grid pattern */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(108,43,217,0.10) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
            opacity: 0.3,
          }}
        />

        {/* Large central radial glow behind headline */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[480px] bg-[var(--accent)] opacity-[0.12] rounded-full blur-[90px] pointer-events-none" />

        {/* Top-right gold accent orb */}
        <div className="absolute top-0 right-0 w-[520px] h-[520px] bg-[var(--accent2)] opacity-[0.08] rounded-full blur-[70px] -translate-y-1/3 translate-x-1/4 pointer-events-none" />

        {/* Bottom-left subtle purple orb */}
        <div className="absolute bottom-0 left-0 w-[400px] h-[300px] bg-[var(--accent)] opacity-[0.06] rounded-full blur-[60px] translate-y-1/4 -translate-x-1/4 pointer-events-none" />

        {/* Geometric accent — top-right concentric rings (desktop only) */}
        <svg className="absolute top-8 right-[5%] hidden xl:block pointer-events-none" width="160" height="160" viewBox="0 0 160 160" fill="none" aria-hidden="true">
          <circle cx="80" cy="80" r="72" stroke="rgba(108,43,217,0.10)" strokeWidth="1.5" fill="none" />
          <circle cx="80" cy="80" r="50" stroke="rgba(108,43,217,0.07)" strokeWidth="1" fill="none" />
          <circle cx="80" cy="80" r="28" stroke="rgba(201,162,39,0.12)" strokeWidth="1" fill="none" />
        </svg>

        {/* Geometric accent — bottom-left dot grid (desktop only) */}
        <svg className="absolute bottom-12 left-[4%] hidden xl:block pointer-events-none" width="112" height="72" viewBox="0 0 112 72" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="2.5" fill="rgba(201,162,39,0.20)" /><circle cx="36" cy="12" r="2.5" fill="rgba(201,162,39,0.16)" /><circle cx="60" cy="12" r="2.5" fill="rgba(201,162,39,0.12)" /><circle cx="84" cy="12" r="2.5" fill="rgba(201,162,39,0.08)" />
          <circle cx="12" cy="36" r="2.5" fill="rgba(201,162,39,0.16)" /><circle cx="36" cy="36" r="2.5" fill="rgba(201,162,39,0.12)" /><circle cx="60" cy="36" r="2.5" fill="rgba(201,162,39,0.08)" /><circle cx="84" cy="36" r="2.5" fill="rgba(201,162,39,0.05)" />
          <circle cx="12" cy="60" r="2.5" fill="rgba(201,162,39,0.10)" /><circle cx="36" cy="60" r="2.5" fill="rgba(201,162,39,0.07)" /><circle cx="60" cy="60" r="2.5" fill="rgba(201,162,39,0.04)" />
        </svg>

        <div className="relative max-w-6xl mx-auto px-5 pt-20 pb-28 text-center">

          {/* Launch badge */}
          <div className="inline-flex items-center gap-2 bg-[var(--pill)] text-[var(--accent)] text-xs font-semibold px-4 py-2 rounded-full mb-8 border border-[rgba(108,43,217,0.2)] shadow-sm">
            <Sparkles size={13} /> Launching in Lagos, Nigeria 🇳🇬
          </div>

          {/* Headline with gold accent on key phrase */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[var(--dark)] leading-[1.08] mb-6 max-w-3xl mx-auto text-balance">
            Nigeria&apos;s smartest{' '}
            <span className="relative inline-block">
              <span className="relative z-10" style={{ color: 'var(--accent)' }}>event planning</span>
              <span
                className="absolute bottom-0 left-0 right-0 rounded-full"
                style={{
                  height: '3px',
                  background: 'linear-gradient(90deg, var(--accent2), var(--accent))',
                  opacity: 0.55,
                }}
              />
            </span>{' '}
            platform
          </h1>

          {/* Sub-copy */}
          <p className="text-lg text-[var(--muted)] max-w-lg mx-auto mb-10 leading-relaxed">
            AI plans your entire event in minutes. Book verified venues, catering, photography, makeup, AV and more — all within your budget.
          </p>

          {/* CTA row — Gold = primary marketing, White/outline = secondary */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link
              href="/plan"
              className="btn-accent px-8 py-3.5 text-base flex items-center gap-2 shadow-xl hover:-translate-y-0.5 transition-all"
              style={{ boxShadow: '0 8px 24px rgba(201,162,39,0.28)' }}
            >
              <Sparkles size={16} /> Plan My Event Free
            </Link>
            <Link
              href="/vendors"
              className="btn-secondary px-8 py-3.5 text-base flex items-center gap-2 hover:-translate-y-0.5 transition-all"
            >
              Browse Vendors <ArrowRight size={15} />
            </Link>
          </div>

          <p className="text-xs text-[var(--muted)] mt-5 opacity-70">No account needed to start · 200+ verified vendors in Lagos</p>

          {/* Category dot-list */}
          <div className="mt-8 flex items-center justify-center gap-5 flex-wrap">
            {['Venues', 'Catering', 'Photography', 'AV & Production', 'Décor', 'Entertainment'].map(cat => (
              <span key={cat} className="text-xs text-[var(--muted)] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--accent)', opacity: 0.6 }} />
                {cat}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────────────── */}
      <section className="bg-[var(--dark)] py-16 relative overflow-hidden">
        {/* Subtle gold shimmer overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(201,162,39,0.04) 50%, transparent 100%)' }}
        />
        <div className="max-w-4xl mx-auto px-5 grid grid-cols-2 sm:grid-cols-4 text-center relative">
          {[
            { val: '200+', label: 'Verified vendors', sub: 'Lagos' },
            { val: '93%', label: 'Cheaper than Cvent', sub: 'for planners' },
            { val: '8', label: 'Vendor categories', sub: 'all in one' },
            { val: '₦0', label: 'To list as vendor', sub: 'commission only' },
          ].map((s, i) => (
            <div
              key={s.val}
              className="py-8 px-4"
              style={{ borderRight: i < 3 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}
            >
              {/* Gold accent bar */}
              <div
                className="mx-auto mb-3 rounded-full"
                style={{
                  width: '40px',
                  height: '3px',
                  background: 'linear-gradient(90deg, var(--accent2), var(--accent))',
                  opacity: 0.85,
                }}
              />
              <div className="text-5xl font-bold text-white mb-2 leading-none tracking-tight">{s.val}</div>
              <div className="text-sm font-semibold text-white/90 mb-1">{s.label}</div>
              <div className="text-xs text-white/55 tracking-wide uppercase">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 py-20">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">Plan your event in 3 steps</h2>
        <p className="text-center text-sm text-[var(--muted)] mb-12">From idea to booked vendors in under 10 minutes</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { n: '01', icon: '✨', title: 'Describe your event', desc: 'Tell our AI your event type, guest count, date, and budget. Takes 60 seconds.' },
            { n: '02', icon: '🔍', title: 'AI builds your plan', desc: 'We match you with verified vendors across all 8 categories, ranked by fit and price.' },
            { n: '03', icon: '✅', title: 'Book with confidence', desc: 'Pay securely via escrow. Vendors only get paid after your event. Zero risk.' },
          ].map(step => (
            <div key={step.n} className="card p-6 relative group hover:shadow-lg hover:border-[rgba(108,43,217,0.25)] hover:-translate-y-1 transition-all duration-200">
              <div className="absolute top-4 right-4 text-[11px] font-bold text-[var(--muted)] opacity-35 font-mono">{step.n}</div>
              <div className="w-12 h-12 rounded-2xl bg-[var(--pill)] border border-[rgba(108,43,217,0.15)] flex items-center justify-center text-2xl mx-auto mb-4 shadow-sm group-hover:scale-105 transition-transform">
                {step.icon}
              </div>
              <h3 className="font-bold text-base text-center mb-2">{step.title}</h3>
              <p className="text-sm text-[var(--muted)] leading-relaxed text-center">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Vendor categories ──────────────────────────────────────────── */}
      <section className="bg-white py-20 border-y border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-5">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">Every vendor you need</h2>
          <p className="text-center text-sm text-[var(--muted)] mb-10">All 8 categories, all verified, all in Lagos</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { emoji: '🏛', name: 'Venues', sub: 'Hotels, rooftops, halls' },
              { emoji: '🍽', name: 'Catering & F&B', sub: 'Nigerian & continental' },
              { emoji: '📸', name: 'Photography', sub: 'Photo, video, drone' },
              { emoji: '🎛', name: 'AV & Production', sub: 'Sound, lighting, stage' },
              { emoji: '💐', name: 'Décor & Florals', sub: 'Theming & centrepieces' },
              { emoji: '🎶', name: 'Entertainment', sub: 'Bands, DJs, MCs' },
              { emoji: '💄', name: 'Makeup Artists', sub: 'Bridal & editorial' },
              { emoji: '🎤', name: 'Speakers', sub: 'Keynotes & panels' },
            ].map(cat => (
              <Link key={cat.name} href={`/vendors?category=${cat.name}`}>
                <div className="card p-4 hover:shadow-md hover:border-[rgba(108,43,217,0.3)] hover:-translate-y-0.5 transition-all cursor-pointer text-center group">
                  <div className="text-3xl mb-2.5">{cat.emoji}</div>
                  <div className="font-semibold text-sm mb-0.5 group-hover:text-[var(--accent)] transition-colors">{cat.name}</div>
                  <div className="text-xs text-[var(--muted)]">{cat.sub}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── For vendors CTA ────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 py-20">
        <div className="bg-[var(--dark)] rounded-3xl p-8 sm:p-12 grid grid-cols-1 sm:grid-cols-2 gap-8 items-center overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--accent)] opacity-10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-[var(--accent)] opacity-[0.06] rounded-full blur-2xl pointer-events-none" />
          <div className="relative">
            <div className="text-[var(--accent2)] font-semibold text-xs uppercase tracking-widest mb-3">For Vendors &amp; Businesses</div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 leading-tight">List your business free. Earn more.</h2>
            <p className="text-white/60 text-sm leading-relaxed mb-6">
              Zero upfront cost. 0% commission for your first 90 days. Guaranteed payment via escrow. We bring the clients to you.
            </p>
            {/* Gold = primary marketing CTA */}
            <Link
              href="/vendor/settings"
              className="btn-accent inline-flex items-center gap-2 hover:-translate-y-0.5 transition-all"
              style={{ boxShadow: '0 6px 20px rgba(201,162,39,0.22)' }}
            >
              List My Business Free <Zap size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 relative">
            {[
              { icon: <Shield size={18} />, title: 'Guaranteed payment', desc: 'Escrow protects every booking' },
              { icon: <Users size={18} />, title: 'Qualified leads', desc: 'AI sends you matched clients' },
              { icon: <Star size={18} />, title: 'Build reputation', desc: 'Verified reviews from real clients' },
              { icon: <Sparkles size={18} />, title: 'AI profile builder', desc: 'We write your listing for you' },
            ].map(f => (
              <div key={f.title} className="bg-white/[0.06] rounded-xl p-3.5 border border-white/[0.06] hover:bg-white/[0.09] transition-colors">
                <div className="text-[var(--accent2)] mb-2">{f.icon}</div>
                <div className="text-white text-xs font-semibold mb-0.5">{f.title}</div>
                <div className="text-white/40 text-[11px] leading-relaxed">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border)] py-8 bg-white">
        <div className="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <img src="/owambe-logo-nav.png" alt="Owambe" className="h-11 w-auto" />
          <div className="text-xs text-[var(--muted)]">© 2026 Owambe.com · Lagos, Nigeria 🇳🇬</div>
          <div className="flex gap-5 text-xs text-[var(--muted)]">
            <Link href="/terms" className="hover:text-[var(--dark)] transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-[var(--dark)] transition-colors">Privacy</Link>
            <Link href="/contact" className="hover:text-[var(--dark)] transition-colors">Contact</Link>
          </div>
        </div>
      </footer>

      {/* Floating emoji keyframes */}
      <style>{`
        @keyframes floatA {
          0%, 100% { transform: translateY(0px) rotate(-3deg); }
          50% { transform: translateY(-14px) rotate(3deg); }
        }
        @keyframes floatB {
          0%, 100% { transform: translateY(0px) rotate(2deg); }
          50% { transform: translateY(-10px) rotate(-2deg); }
        }
        @keyframes floatC {
          0%, 100% { transform: translateY(0px) rotate(-2deg); }
          50% { transform: translateY(-18px) rotate(4deg); }
        }
      `}</style>
    </div>
  );
}
