'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi } from '@/lib/api';
import { formatNGN, formatEventDate, EVENT_STATUS_CONFIG, cn } from '@/lib/utils';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Plus, Rocket, Trash2, ExternalLink, BarChart2, Scan, Loader2 } from 'lucide-react';

const STATUS_TABS = ['ALL', 'DRAFT', 'PUBLISHED', 'LIVE', 'ENDED'];

export default function EventsListPage() {
  const [activeTab, setActiveTab] = useState('ALL');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['my-events', activeTab],
    queryFn: () => eventsApi.list({
      status: activeTab === 'ALL' ? undefined : activeTab,
      limit: 50
    }).then(r => r.data),
  });

  const publishMutation = useMutation({
    mutationFn: eventsApi.publish,
    onSuccess: () => {
      toast.success('🚀 Event is now live!');
      queryClient.invalidateQueries({ queryKey: ['my-events'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || 'Failed to publish event';
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: eventsApi.delete,
    onSuccess: () => {
      toast.success('Event deleted');
      queryClient.invalidateQueries({ queryKey: ['my-events'] });
    },
  });

  const events = data?.events || [];
  const total = data?.total || 0;

  return (
    <div className="p-6 animate-fade-up">
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-xs text-[var(--muted)] uppercase tracking-widest mb-0.5">
            {total} event{total !== 1 ? 's' : ''} total
          </div>
        </div>
        <Link href="/dashboard/events/new" className="btn-primary text-sm flex items-center gap-1.5">
          <Plus size={14} /> Create Event
        </Link>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-5 bg-white border border-[var(--border)] rounded-lg p-1 w-fit">
        {STATUS_TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === tab ? 'bg-[var(--dark)] text-white' : 'text-[var(--muted)] hover:text-[var(--dark)]'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Events table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--muted)]" />
        </div>
      ) : events.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-4xl mb-3">🎉</div>
          <div className="font-bold text-[var(--dark)] mb-1">
            {activeTab === 'ALL' ? 'No events yet' : `No ${activeTab.toLowerCase()} events`}
          </div>
          <div className="text-sm text-[var(--muted)] mb-5">
            Create your first event in under 2 minutes
          </div>
          <Link href="/dashboard/events/new" className="btn-primary inline-flex items-center gap-1.5 text-sm">
            <Plus size={14} /> Create Event
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-[var(--border)]">
                <th className="table-header w-4" />
                <th className="table-header">Event</th>
                <th className="table-header">Date</th>
                <th className="table-header text-right">Registered</th>
                <th className="table-header text-right">Revenue</th>
                <th className="table-header text-right">Fill Rate</th>
                <th className="table-header">Status</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event: any) => {
                const cfg = EVENT_STATUS_CONFIG[event.status] || EVENT_STATUS_CONFIG.DRAFT;
                const fillRate = event.maxCapacity && event.registrationCount
                  ? Math.round((event.registrationCount / event.maxCapacity) * 100) : null;
                return (
                  <tr key={event.id} className="table-row">
                    <td className="table-cell py-4 pl-4">
                      <div className={cn('w-2.5 h-2.5 rounded-full', cfg.dot)} />
                    </td>
                    <td className="table-cell">
                      <div className="font-bold text-sm text-[var(--dark)]">{event.name}</div>
                      <div className="text-xs text-[var(--muted)] mt-0.5">
                        {event.city || event.venue || 'No location'} · {event.type || 'Event'}
                      </div>
                    </td>
                    <td className="table-cell text-sm">{formatEventDate(event.startDate)}</td>
                    <td className="table-cell text-right">
                      <span className="font-semibold text-sm">{event.registrationCount || 0}</span>
                      {event.maxCapacity && (
                        <span className="text-xs text-[var(--muted)]"> / {event.maxCapacity}</span>
                      )}
                    </td>
                    <td className="table-cell text-right font-semibold text-sm text-[var(--accent)]">
                      {formatNGN(event.revenue || 0, true)}
                    </td>
                    <td className="table-cell text-right">
                      {fillRate !== null ? (
                        <span className={cn('text-sm font-bold',
                          fillRate >= 80 ? 'text-green-600' :
                          fillRate >= 50 ? 'text-yellow-600' : 'text-[var(--danger)]'
                        )}>
                          {fillRate}%
                        </span>
                      ) : <span className="text-[var(--muted)] text-sm">—</span>}
                    </td>
                    <td className="table-cell">
                      <span className={cfg.className}>{cfg.label}</span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        {event.status === 'DRAFT' && (
                          <button
                            onClick={() => {
                              const ticketCount = event.ticketTypes?.length ?? 0;
                              if (ticketCount === 0) {
                                toast.error('Add at least one ticket type before publishing. Open the event to add tickets.');
                                return;
                              }
                              publishMutation.mutate(event.id);
                            }}
                            disabled={publishMutation.isPending}
                            className="p-1.5 rounded-md hover:bg-[var(--accent)] hover:text-white transition-colors text-[var(--muted)]"
                            title={event.ticketTypes?.length ? 'Publish event' : 'Add ticket types first'}>
                            {publishMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />}
                          </button>
                        )}
                        <Link href={`/dashboard/analytics?event=${event.id}`}
                          className="p-1.5 rounded-md hover:bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--dark)] transition-colors"
                          title="Analytics">
                          <BarChart2 size={13} />
                        </Link>
                        <Link href={`/dashboard/checkin?event=${event.id}`}
                          className="p-1.5 rounded-md hover:bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--dark)] transition-colors"
                          title="Check-in">
                          <Scan size={13} />
                        </Link>
                        {event.status !== 'LIVE' && (
                          <button
                            onClick={() => {
                              if (confirm('Delete this event? This cannot be undone.')) {
                                deleteMutation.mutate(event.id);
                              }
                            }}
                            className="p-1.5 rounded-md hover:bg-red-50 hover:text-[var(--danger)] text-[var(--muted)] transition-colors"
                            title="Delete">
                            <Trash2 size={13} />
                          </button>
                        )}
                        {(event.status === 'PUBLISHED' || event.status === 'LIVE') && (
                          <a href={`/events/${event.slug}`} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 rounded-md hover:bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--dark)] transition-colors"
                            title="View live page">
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
