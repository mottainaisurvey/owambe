'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { analyticsApi, eventsApi, experiencesApi } from '@/lib/api';
import { formatNGN, formatEventDate, EVENT_STATUS_CONFIG, cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Plus, Users, DollarSign, Calendar, Target, MapPin, Clock } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

// ─────────────────────────────────────────────────────────────────────────────
// EXPERIENCES DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

function ExperiencesDashboard() {
  const { data: myExpData, isLoading } = useQuery({
    queryKey: ['my-experiences-dashboard'],
    queryFn: () => experiencesApi.listMine({ limit: 5 }).then((r: any) => r.data),
  });

  const experiences = myExpData?.experiences || [];
  const total = myExpData?.total ?? 0;
  const published = experiences.filter((e: any) => e.isActive).length;
  const pending = experiences.filter((e: any) => !e.isApproved).length;

  return (
    <div className="p-6 animate-fade-up">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <StatCard
          label="My Experiences"
          value={isLoading ? '—' : total}
          sub="total created"
          accent="#6C2BD9"
          icon={<MapPin size={16} className="text-[var(--accent)]" />}
          positive
        />
        <StatCard
          label="Published"
          value={isLoading ? '—' : published}
          sub="live & bookable"
          accent="#16A34A"
          icon={<Calendar size={16} className="text-green-600" />}
          positive={published > 0}
        />
        <StatCard
          label="Awaiting Approval"
          value={isLoading ? '—' : pending}
          sub="pending platform review"
          accent="#C9A227"
          icon={<Clock size={16} className="text-yellow-600" />}
          positive={pending === 0}
        />
        <StatCard
          label="Total Bookings"
          value="—"
          sub="coming soon"
          accent="#7B61FF"
          icon={<Users size={16} className="text-purple-500" />}
          positive
        />
      </div>

      {/* Recent Experiences */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-title">My Experiences</h2>
        <Link href="/dashboard/experiences/new" className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
          <Plus size={12} /> Add Experience
        </Link>
      </div>
      <div className="space-y-2.5 mb-6">
        {isLoading ? (
          <div className="card text-center py-8 text-sm text-[var(--muted)]">Loading…</div>
        ) : experiences.length === 0 ? (
          <EmptyExperiences />
        ) : (
          experiences.map((exp: any) => <ExperienceRow key={exp.id} experience={exp} />)
        )}
        {experiences.length > 0 && (
          <Link href="/dashboard/experiences/list" className="block text-center text-sm text-[var(--accent)] font-semibold py-2 hover:underline">
            View all experiences →
          </Link>
        )}
      </div>
    </div>
  );
}

function ExperienceRow({ experience }: { experience: any }) {
  const isPublished = experience.isActive;
  const isApproved = experience.isApproved;
  const statusLabel = isPublished ? 'Published' : isApproved ? 'Approved — Unpublished' : 'Awaiting Approval';
  const statusClass = isPublished
    ? 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700'
    : isApproved
    ? 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700'
    : 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700';

  return (
    <Link href="/dashboard/experiences/list">
      <div className="card px-4 py-3.5 grid grid-cols-[1fr_auto_auto] items-center gap-3.5 hover:shadow-card hover:-translate-y-px transition-all cursor-pointer">
        <div>
          <div className="font-bold text-sm text-[var(--dark)]">{experience.title}</div>
          <div className="text-[11px] text-[var(--muted)] mt-0.5">
            📍 {experience.location || 'Location TBC'} · ⏱ {experience.durationMinutes ? `${experience.durationMinutes} min` : '—'}
          </div>
        </div>
        <div className="text-sm font-semibold text-[var(--dark)]">
          {experience.pricePerPerson ? formatNGN(experience.pricePerPerson, true) : '—'}
        </div>
        <span className={statusClass}>{statusLabel}</span>
      </div>
    </Link>
  );
}

function EmptyExperiences() {
  return (
    <div className="card text-center py-12">
      <div className="text-4xl mb-3">🌍</div>
      <div className="font-bold text-[var(--dark)] mb-1">No experiences yet</div>
      <div className="text-sm text-[var(--muted)] mb-5">Create your first experience in under 2 minutes</div>
      <Link href="/dashboard/experiences/new" className="btn-primary inline-flex items-center gap-1.5 text-sm">
        <Plus size={14} /> Add Experience
      </Link>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS DASHBOARD (original)
// ─────────────────────────────────────────────────────────────────────────────

function EventsDashboard() {
  const { data: overview } = useQuery({
    queryKey: ['planner-overview'],
    queryFn: () => analyticsApi.plannerOverview().then((r: any) => r.data),
  });

  const { data: eventsData } = useQuery({
    queryKey: ['my-events', { limit: 3 }],
    queryFn: () => eventsApi.list({ limit: 3 }).then((r: any) => r.data),
  });

  const stats = overview?.stats;
  const events = eventsData?.events || [];

  return (
    <div className="p-6 animate-fade-up">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3.5 mb-6">
        <StatCard
          label="Live Events"
          value={stats?.liveEvents ?? '—'}
          sub={`of ${stats?.totalEvents ?? 0} total`}
          accent="#6C2BD9"
          icon={<Calendar size={16} className="text-[var(--accent)]" />}
          positive
        />
        <StatCard
          label="Registrations"
          value={stats?.totalAttendees ?? '—'}
          sub={`↑ ${stats?.registrationGrowth ?? 0}% this month`}
          accent="#C9A227"
          icon={<Users size={16} className="text-[var(--accent2)]" />}
          positive={(stats?.registrationGrowth ?? 0) >= 0}
        />
        <StatCard
          label="Revenue"
          value={stats ? formatNGN(stats.totalRevenue, true) : '—'}
          sub="all time"
          accent="#7B61FF"
          icon={<DollarSign size={16} className="text-purple-500" />}
          positive
        />
        <StatCard
          label="Avg Fill Rate"
          value={stats ? `${stats.fillRate ?? 0}%` : '—'}
          sub="across all events"
          accent="#DC2626"
          icon={<Target size={16} className="text-red-500" />}
          positive={(stats?.fillRate ?? 0) >= 60}
        />
      </div>
      {/* Events */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-title">Recent Events</h2>
        <Link href="/dashboard/events/new" className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
          <Plus size={12} /> Create
        </Link>
      </div>
      <div className="space-y-2.5 mb-6">
        {events.length === 0 ? (
          <EmptyEvents />
        ) : (
          events.map((event: any) => <EventRow key={event.id} event={event} />)
        )}
        {events.length > 0 && (
          <Link href="/dashboard/events" className="block text-center text-sm text-[var(--accent)] font-semibold py-2 hover:underline">
            View all events →
          </Link>
        )}
      </div>
      {/* Activity Feed */}
      <h2 className="section-title mb-3">Activity Feed</h2>
      <div className="card overflow-hidden">
        {MOCK_ACTIVITY.map((a, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] last:border-0 text-sm">
            <span className="text-base shrink-0 mt-0.5">{a.icon}</span>
            <div className="flex-1" dangerouslySetInnerHTML={{ __html: a.text }} />
            <span className="text-[11px] text-[var(--muted)] whitespace-nowrap">{a.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT — mode switch
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { activeMode } = useAuthStore();

  if (activeMode === 'EXPERIENCES') {
    return <ExperiencesDashboard />;
  }

  return <EventsDashboard />;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent, icon, positive }: any) {
  return (
    <div className="stat-card" style={{ '--accent-color': accent } as any}>
      <div className={`absolute top-0 left-0 right-0 h-[3px] rounded-t-xl`} style={{ background: accent }} />
      <div className="flex items-start justify-between mb-2">
        <div className="stat-label">{label}</div>
        {icon}
      </div>
      <div className="stat-number">{value}</div>
      <div className={cn('text-[11px] mt-1.5 font-medium flex items-center gap-1', positive ? 'text-[var(--accent)]' : 'text-[var(--danger)]')}>
        {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
        {sub}
      </div>
    </div>
  );
}

function EventRow({ event }: { event: any }) {
  const cfg = EVENT_STATUS_CONFIG[event.status] || EVENT_STATUS_CONFIG.DRAFT;
  return (
    <Link href={`/dashboard/events/${event.id}`}>
      <div className="card px-4 py-3.5 grid grid-cols-[10px_1fr_auto_auto_auto_auto] items-center gap-3.5 hover:shadow-card hover:-translate-y-px transition-all cursor-pointer">
        <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', cfg.dot)} />
        <div>
          <div className="font-bold text-sm text-[var(--dark)]">{event.name}</div>
          <div className="text-[11px] text-[var(--muted)] mt-0.5">
            📅 {formatEventDate(event.startDate)} · 📍 {event.city || event.venue || 'TBC'}
          </div>
        </div>
        <Pill label={event.registrationCount} sub="Registered" />
        <Pill label={event.cap || '—'} sub="Capacity" />
        <Pill label={formatNGN(event.revenue || 0, true)} sub="Revenue" />
        <span className={cfg.className}>{cfg.label}</span>
      </div>
    </Link>
  );
}

function Pill({ label, sub }: { label: any; sub: string }) {
  return (
    <div className="text-center">
      <div className="font-bold text-[15px] text-[var(--dark)]">{label}</div>
      <div className="text-[9px] text-[var(--muted)] uppercase tracking-wide">{sub}</div>
    </div>
  );
}

function EmptyEvents() {
  return (
    <div className="card text-center py-12">
      <div className="text-4xl mb-3">🎉</div>
      <div className="font-bold text-[var(--dark)] mb-1">No events yet</div>
      <div className="text-sm text-[var(--muted)] mb-5">Create your first event in under 2 minutes</div>
      <Link href="/dashboard/events/new" className="btn-primary inline-flex items-center gap-1.5 text-sm">
        <Plus size={14} /> Create Event
      </Link>
    </div>
  );
}

const MOCK_ACTIVITY = [
  { icon: '🎟', text: '<strong>Alex Rivera</strong> registered · VIP ticket', time: '2m ago' },
  { icon: '💰', text: 'Payment of <strong>₦75,000</strong> received from Jordan Kim', time: '15m ago' },
  { icon: '✉️', text: 'Confirmation emails sent to <strong>12 attendees</strong>', time: '1h ago' },
  { icon: '🎤', text: '<strong>Aria Mitchell</strong> submitted presentation slides', time: '3h ago' },
  { icon: '🚀', text: 'Lagos Tech Summit published and live', time: 'Yesterday' },
];
