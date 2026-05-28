'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi, eventsApi } from '@/lib/api';
import { formatNGN, formatDate } from '@/lib/utils';
import { BarChart2, TrendingUp, Mail, Smartphone, Users, Zap, Star, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, PieChart, Pie, Legend } from 'recharts';

const TOOLTIP_STYLE = {
  contentStyle: { background: '#1C1528', border: 'none', borderRadius: 8, fontSize: 12, color: '#fff' },
};

export default function AnalyticsPage() {
  const [selectedEventId, setSelectedEventId] = useState('');

  const { data: overview } = useQuery({
    queryKey: ['planner-overview'],
    queryFn: () => analyticsApi.plannerOverview().then(r => r.data),
    refetchInterval: 30000,
  });

  const { data: eventsData } = useQuery({
    queryKey: ['my-events'],
    queryFn: () => eventsApi.list({ limit: 50 }).then(r => r.data),
  });

  const { data: eventStats } = useQuery({
    queryKey: ['event-stats', selectedEventId],
    queryFn: () => analyticsApi.eventStats(selectedEventId).then(r => r.data),
    enabled: !!selectedEventId,
  });

  const { data: liveStats } = useQuery({
    queryKey: ['checkin-live', selectedEventId],
    queryFn: () => analyticsApi.checkInLive(selectedEventId).then(r => r.data),
    enabled: !!selectedEventId,
    refetchInterval: 10000,
  });

  const stats = overview?.stats || {};
  const events = eventsData?.events || [];
  const regByDay: any[] = overview?.registrationsByDay || MOCK_REG_DATA;
  const revenueByMonth: any[] = overview?.revenueByMonth || MOCK_REVENUE;
  const selectedEvent = events.find((e: any) => e.id === selectedEventId);

  return (
    <div className="p-6 animate-fade-up">
      {/* Platform overview */}
      <div className="grid grid-cols-4 gap-3.5 mb-5">
        {[
          { label: 'Total Events', value: stats.totalEvents ?? '—', sub: `${stats.liveEvents ?? 0} live now`, color: '#6C2BD9', icon: <Zap size={15}/> },
          { label: 'Total Registrations', value: stats.totalAttendees ?? '—', sub: `${stats.recentAttendees ?? 0} this month`, color: '#C9A227', icon: <Users size={15}/> },
          { label: 'Total Revenue', value: stats.totalRevenue ? formatNGN(stats.totalRevenue, true) : '—', sub: 'All events', color: '#7B61FF', icon: <DollarSign size={15}/> },
          { label: 'Avg Fill Rate', value: stats.fillRate ? `${stats.fillRate}%` : '—', sub: 'Across all events', color: '#059669', icon: <Star size={15}/> },
        ].map(m => (
          <div key={m.label} className="stat-card">
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: m.color }} />
            <div className="flex items-start justify-between mb-1.5">
              <div className="stat-label">{m.label}</div>
              <div style={{ color: m.color }}>{m.icon}</div>
            </div>
            <div className="stat-number">{m.value}</div>
            <div className="text-[11px] text-[var(--muted)] mt-1">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-[2fr_1fr] gap-4 mb-5">
        <div className="card p-5">
          <div className="text-sm font-bold mb-0.5">Registrations — Last 30 Days</div>
          <div className="text-xs text-[var(--muted)] mb-4">Daily across all events</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={regByDay} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8B82A0' }} tickFormatter={v => v?.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: '#8B82A0' }} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [v, 'Registrations']} />
              <Bar dataKey="count" radius={[3,3,0,0]}>
                {regByDay.map((_: any, i: number) => (
                  <Cell key={i} fill={i === regByDay.length - 1 ? '#C9A227' : '#6C2BD9'} opacity={0.55 + i * 0.03} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <div className="text-sm font-bold mb-4">Revenue by Month (₦)</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={revenueByMonth} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#8B82A0' }} />
              <YAxis tick={{ fontSize: 10, fill: '#8B82A0' }} tickFormatter={v => `₦${(v/1000000).toFixed(1)}M`} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [formatNGN(v, true), 'Revenue']} />
              <Line type="monotone" dataKey="amount" stroke="#6C2BD9" strokeWidth={2.5}
                dot={{ fill: '#6C2BD9', strokeWidth: 0, r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-event deep dive */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-3">
          <div className="text-sm font-bold">Per-Event Analytics</div>
          <select className="input w-56 text-xs py-1.5 ml-auto" value={selectedEventId}
            onChange={e => setSelectedEventId(e.target.value)}>
            <option value="">Select an event</option>
            {events.map((ev: any) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
        </div>

        {!selectedEventId ? (
          <div className="text-center py-10 text-sm text-[var(--muted)]">
            Select an event above to see detailed analytics
          </div>
        ) : (
          <div className="p-5">
            <div className="grid grid-cols-4 gap-3 mb-5">
              {[
                { label: 'Registered', value: liveStats?.totalRegistered ?? eventStats?.totalAttendees ?? '—' },
                { label: 'Checked In', value: liveStats?.totalCheckedIn ?? '—' },
                { label: 'Check-in Rate', value: liveStats?.checkInRate != null ? `${liveStats.checkInRate}%` : '—' },
                { label: 'Revenue', value: eventStats?.revenue ? formatNGN(eventStats.revenue, true) : '—' },
              ].map(s => (
                <div key={s.label} className="bg-[var(--bg)] rounded-xl p-3 text-center border border-[var(--border)]">
                  <div className="stat-label mb-1">{s.label}</div>
                  <div className="text-xl font-bold text-[var(--dark)]">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Ticket type breakdown */}
            {eventStats?.ticketBreakdown?.length > 0 && (
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-[var(--muted)] mb-3">Ticket Breakdown</div>
                <div className="space-y-2">
                  {eventStats.ticketBreakdown.map((t: any) => {
                    const pct = t.capacity ? Math.round((t.sold / t.capacity) * 100) : 0;
                    return (
                      <div key={t.id} className="flex items-center gap-3">
                        <div className="w-28 text-sm font-semibold truncate">{t.name}</div>
                        <div className="flex-1 h-2 bg-[var(--border)] rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--accent)] rounded-full transition-all"
                            style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-xs text-[var(--muted)] w-20 text-right">
                          {t.sold} / {t.capacity ?? '∞'} ({pct}%)
                        </div>
                        <div className="text-xs font-bold text-[var(--accent)] w-20 text-right">
                          {formatNGN(t.revenue, true)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent check-ins */}
            {liveStats?.recentCheckIns?.length > 0 && (
              <div className="mt-5 pt-5 border-t border-[var(--border)]">
                <div className="text-xs font-bold uppercase tracking-widest text-[var(--muted)] mb-3">Recent Check-ins</div>
                <div className="space-y-1.5">
                  {liveStats.recentCheckIns.slice(0, 5).map((ci: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-[var(--accent)] font-bold">✓</span>
                      <span className="font-semibold">{ci.attendee?.firstName} {ci.attendee?.lastName}</span>
                      <span className="text-[var(--muted)] text-xs ml-auto">
                        {ci.attendee?.ticketType?.name} · {formatDate(ci.checkedInAt, 'h:mm a')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const MOCK_REG_DATA = Array.from({ length: 14 }, (_, i) => ({
  date: `2026-04-${String(i + 1).padStart(2, '0')}`,
  count: [8,15,12,22,19,35,28,41,38,55,49,68,62,78][i],
}));

const MOCK_REVENUE = [
  { month: 'Jan', amount: 0 },
  { month: 'Feb', amount: 480000 },
  { month: 'Mar', amount: 1200000 },
  { month: 'Apr', amount: 1750000 },
  { month: 'May', amount: 2100000 },
  { month: 'Jun', amount: 3400000 },
];
