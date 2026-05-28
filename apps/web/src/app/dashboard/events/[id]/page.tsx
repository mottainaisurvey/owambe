'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi, ticketsApi, attendeesApi, speakersApi, sponsorsApi, contractsApi, distributionApi } from '@/lib/api';
import { formatNGN, formatDate, formatTimeAgo, EVENT_STATUS_CONFIG, cn } from '@/lib/utils';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useState } from 'react';
import {
  ArrowLeft, Edit2, Send, Trash2, QrCode, Users, Ticket,
  Mic, Trophy, FileText, BarChart2, Mail, Loader2, ExternalLink,
  Share2, Radio, Copy, CheckCircle2, Globe,
} from 'lucide-react';
import { StatCard } from '@/components/ui';
import { useAuthStore, getPlanTier, planAtLeast } from '@/store/auth.store';

const TABS = ['Overview', 'Attendees', 'Tickets', 'Speakers', 'Sponsors', 'Contracts', 'Distribute'] as const;
type Tab = typeof TABS[number];

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('Overview');

  const { data, isLoading } = useQuery({
    queryKey: ['event', id],
    queryFn: () => eventsApi.get(id).then(r => r.data),
  });

  const { data: attendeesData } = useQuery({
    queryKey: ['attendees', id],
    queryFn: () => attendeesApi.list(id, { limit: 100 }).then(r => r.data),
    enabled: activeTab === 'Attendees',
  });

  const { data: ticketsData } = useQuery({
    queryKey: ['ticket-types', id],
    queryFn: () => ticketsApi.list(id).then(r => r.data),
    enabled: activeTab === 'Tickets' || activeTab === 'Overview',
  });

  const { data: speakersData } = useQuery({
    queryKey: ['speakers', id],
    queryFn: () => speakersApi.list(id).then(r => r.data),
    enabled: activeTab === 'Speakers',
  });

  const { data: sponsorsData } = useQuery({
    queryKey: ['sponsors', id],
    queryFn: () => sponsorsApi.list(id).then(r => r.data),
    enabled: activeTab === 'Sponsors',
  });

  const { data: distributionData, refetch: refetchDist } = useQuery({
    queryKey: ['distributions', id],
    queryFn: () => distributionApi.list(id).then(r => r.data),
    enabled: activeTab === 'Distribute',
  });

  const { data: contractsData } = useQuery({
    queryKey: ['contracts', { eventId: id }],
    queryFn: () => contractsApi.list({ limit: 50 }).then(r => r.data),
    enabled: activeTab === 'Contracts',
  });

  const { user } = useAuthStore();
  const planTier = getPlanTier(user);
  const isGrowthPlus = planAtLeast(user, 'GROWTH');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  function copySnippet(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  }

  const pushMutation = useMutation({
    mutationFn: (channel: string) => distributionApi.push(id, channel),
    onSuccess: (res, channel) => {
      if (res.data.success) {
        toast.success(`✅ Published to ${channel.replace('_', ' ')}`);
      } else {
        toast.error(res.data.error || 'Push failed');
      }
      refetchDist();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Push failed'),
  });

  const publishMutation = useMutation({
    mutationFn: () => eventsApi.publish(id),
    onSuccess: () => {
      toast.success('🚀 Event published! It\'s now live.');
      queryClient.invalidateQueries({ queryKey: ['event', id] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Publish failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => eventsApi.delete(id),
    onSuccess: () => {
      toast.success('Event deleted');
      router.push('/dashboard/events');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Delete failed'),
  });

  if (isLoading) {
    return <div className="p-6 flex justify-center py-16"><Loader2 size={24} className="animate-spin text-[var(--muted)]" /></div>;
  }

  const event = data?.event;
  if (!event) return <div className="p-6 text-sm text-[var(--muted)]">Event not found.</div>;

  const cfg = EVENT_STATUS_CONFIG[event.status] || EVENT_STATUS_CONFIG.DRAFT;
  const attendees = attendeesData?.attendees || [];
  const tickets = ticketsData?.ticketTypes || [];
  const speakers = speakersData?.speakers || [];
  const sponsors = sponsorsData?.sponsors || [];
  const contracts = contractsData?.contracts || [];

  const totalRevenue = tickets.reduce((s: number, t: any) => s + Number(t.price) * (t.sold || 0), 0);
  const totalRegistered = event._count?.attendees || 0;
  const fillRate = event.maxCapacity ? Math.round((totalRegistered / event.maxCapacity) * 100) : null;

  return (
    <div className="p-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <Link href="/dashboard/events"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--dark)] mb-3 transition-colors">
            <ArrowLeft size={14} /> All Events
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-bold text-xl">{event.name}</h1>
            <span className={cfg.className}>{cfg.label}</span>
          </div>
          <p className="text-sm text-[var(--muted)]">
            {event.type} · {event.city} ·
            {event.startDate ? ` ${formatDate(event.startDate, 'MMM d, yyyy')}` : ' Date TBC'}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap justify-end">
          {event.status === 'PUBLISHED' && (
            <Link href={`/events/${event.slug}`} target="_blank"
              className="btn-secondary text-xs flex items-center gap-1.5">
              <ExternalLink size={12} /> View Page
            </Link>
          )}
          {event.status === 'DRAFT' && (
            <div title={!tickets.length ? 'Add at least one ticket type before publishing' : undefined}>
              <button
                onClick={() => {
                  if (!tickets.length) {
                    toast.error('Add at least one ticket type before publishing.');
                    return;
                  }
                  publishMutation.mutate();
                }}
                disabled={publishMutation.isPending}
                className="btn-primary text-xs flex items-center gap-1.5">
                {publishMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Publish
              </button>
            </div>
          )}
          {['PUBLISHED', 'LIVE'].includes(event.status) && (
            <Link href={`/dashboard/checkin?eventId=${id}`}
              className="btn-accent text-xs flex items-center gap-1.5">
              <QrCode size={12} /> Check-in
            </Link>
          )}
          {event.status === 'DRAFT' && (
            <button
              onClick={() => {
                if (confirm('Delete this event? This cannot be undone.')) deleteMutation.mutate();
              }}
              disabled={deleteMutation.isPending}
              className="btn-secondary text-xs text-red-500 border-red-200 hover:bg-red-50 flex items-center gap-1.5">
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard label="Registered" value={totalRegistered}
          sub={event.maxCapacity ? `of ${event.maxCapacity} capacity` : 'No limit set'} color="#6C2BD9" />
        <StatCard label="Fill Rate" value={fillRate !== null ? `${fillRate}%` : '—'}
          sub={fillRate !== null && fillRate >= 80 ? '🔥 Nearly full' : 'Spots available'} color="#C9A227" />
        <StatCard label="Revenue" value={formatNGN(totalRevenue, true)}
          sub="from ticket sales" color="#7B61FF" />
        <StatCard label="Ticket Types" value={tickets.length}
          sub={`${tickets.filter((t: any) => t.status === 'ACTIVE').length} active`} color="#059669" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-white border border-[var(--border)] rounded-lg p-1 w-fit">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === tab ? 'bg-[var(--dark)] text-white' : 'text-[var(--muted)] hover:text-[var(--dark)]'
            }`}>
            {tab === 'Overview' && <BarChart2 size={11} />}
            {tab === 'Attendees' && <Users size={11} />}
            {tab === 'Tickets' && <Ticket size={11} />}
            {tab === 'Speakers' && <Mic size={11} />}
            {tab === 'Sponsors' && <Trophy size={11} />}
            {tab === 'Contracts' && <FileText size={11} />}
            {tab === 'Distribute' && <Share2 size={11} />}
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Overview' && (
        <div className="grid grid-cols-[2fr_1fr] gap-5">
          <div className="card">
            <h3 className="font-bold text-sm mb-3">Event Details</h3>
            <div className="space-y-2">
              {[
                ['Name', event.name],
                ['Type', event.type],
                ['Format', event.format],
                ['Start', event.startDate ? formatDate(event.startDate, 'EEE, MMM d, yyyy · h:mm a') : 'TBC'],
                ['End', event.endDate ? formatDate(event.endDate, 'EEE, MMM d, yyyy · h:mm a') : '—'],
                ['Venue', event.venue || '—'],
                ['City', event.city || '—'],
                ['Capacity', event.maxCapacity ? `${event.maxCapacity} guests` : 'Unlimited'],
                ['Status', event.status],
                ['Slug', event.slug],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm py-1.5 border-b border-[var(--border)] last:border-0">
                  <span className="text-[var(--muted)]">{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="card">
              <h3 className="font-bold text-sm mb-3">Quick Actions</h3>
              <div className="space-y-2">
                <Link href={`/dashboard/emails?eventId=${id}`}
                  className="flex items-center gap-2 text-sm text-[var(--mid)] hover:text-[var(--dark)] py-2 hover:bg-[var(--bg)] rounded-lg px-2 transition-colors">
                  <Mail size={14} /> Send Email Campaign
                </Link>
                <Link href={`/dashboard/speakers?eventId=${id}`}
                  className="flex items-center gap-2 text-sm text-[var(--mid)] hover:text-[var(--dark)] py-2 hover:bg-[var(--bg)] rounded-lg px-2 transition-colors">
                  <Mic size={14} /> Manage Speakers
                </Link>
                <Link href={`/dashboard/waitlist?eventId=${id}`}
                  className="flex items-center gap-2 text-sm text-[var(--mid)] hover:text-[var(--dark)] py-2 hover:bg-[var(--bg)] rounded-lg px-2 transition-colors">
                  <Users size={14} /> Waitlist & Promos
                </Link>
              </div>
            </div>
            {event.description && (
              <div className="card">
                <h3 className="font-bold text-sm mb-2">Description</h3>
                <p className="text-sm text-[var(--muted)] leading-relaxed">{event.description}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'Attendees' && (
        <div className="card overflow-hidden p-0">
          <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <span className="text-sm font-bold">{totalRegistered} Attendees</span>
            <Link href={`/dashboard/checkin?eventId=${id}`}
              className="btn-primary text-xs flex items-center gap-1.5">
              <QrCode size={11} /> Open Scanner
            </Link>
          </div>
          {attendees.length === 0 ? (
            <div className="text-center py-10 text-sm text-[var(--muted)]">No attendees yet</div>
          ) : (
            <table className="w-full">
              <thead><tr>
                <th className="table-header">Name</th>
                <th className="table-header">Email</th>
                <th className="table-header">Ticket</th>
                <th className="table-header">Status</th>
                <th className="table-header">Registered</th>
              </tr></thead>
              <tbody>
                {attendees.map((a: any) => (
                  <tr key={a.id} className="table-row">
                    <td className="table-cell font-medium">{a.firstName} {a.lastName}</td>
                    <td className="table-cell text-[var(--muted)]">{a.email}</td>
                    <td className="table-cell text-sm">{a.ticketType?.name}</td>
                    <td className="table-cell">
                      <span className={a.checkIn ? 'badge-confirmed' : 'badge-upcoming'}>
                        {a.checkIn ? 'Checked in' : 'Registered'}
                      </span>
                    </td>
                    <td className="table-cell text-sm text-[var(--muted)]">
                      {formatTimeAgo(a.registeredAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'Tickets' && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-bold">{tickets.length} Ticket Types</span>
            <Link href={`/dashboard/registration?eventId=${id}`} className="btn-primary text-xs">
              + Add Ticket
            </Link>
          </div>
          <div className="space-y-3">
            {tickets.map((t: any) => (
              <div key={t.id} className="card">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-sm">{t.name}</div>
                    {t.description && <div className="text-xs text-[var(--muted)] mt-0.5">{t.description}</div>}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-[var(--accent)]">{Number(t.price) === 0 ? 'Free' : formatNGN(Number(t.price))}</div>
                    <span className={t.status === 'ACTIVE' ? 'badge-confirmed' : 'badge-draft'}>
                      {t.status}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex gap-4 text-sm text-[var(--muted)]">
                  <span>Sold: <strong className="text-[var(--dark)]">{t.sold || 0}</strong></span>
                  {t.capacity && <span>Capacity: <strong className="text-[var(--dark)]">{t.capacity}</strong></span>}
                  <span>Revenue: <strong className="text-[var(--accent)]">{formatNGN(Number(t.price) * (t.sold || 0), true)}</strong></span>
                </div>
                {t.capacity && (
                  <div className="mt-2 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--accent)] rounded-full"
                      style={{ width: `${Math.min(100, ((t.sold || 0) / t.capacity) * 100)}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'Speakers' && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-bold">{speakers.length} Speakers</span>
            <Link href={`/dashboard/speakers?eventId=${id}`} className="btn-primary text-xs">+ Add Speaker</Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {speakers.map((s: any) => (
              <div key={s.id} className="card flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--pill)] flex items-center justify-center text-[var(--accent)] font-bold text-sm flex-shrink-0">
                  {s.name.charAt(0)}
                </div>
                <div>
                  <div className="font-semibold text-sm">{s.name}</div>
                  <div className="text-xs text-[var(--muted)]">{s.title}{s.company ? ` · ${s.company}` : ''}</div>
                </div>
              </div>
            ))}
            {speakers.length === 0 && <div className="col-span-2 text-center py-8 text-sm text-[var(--muted)]">No speakers added</div>}
          </div>
        </div>
      )}

      {activeTab === 'Sponsors' && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-bold">{sponsors.length} Sponsors</span>
            <Link href={`/dashboard/sponsors?eventId=${id}`} className="btn-primary text-xs">+ Add Sponsor</Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {sponsors.map((s: any) => (
              <div key={s.id} className="card text-center">
                {s.logoUrl && <img src={s.logoUrl} alt={s.name} className="h-10 object-contain mx-auto mb-2" />}
                <div className="font-semibold text-sm">{s.name}</div>
                <span className="badge-upcoming text-[10px]">{s.tier}</span>
              </div>
            ))}
            {sponsors.length === 0 && <div className="col-span-3 text-center py-8 text-sm text-[var(--muted)]">No sponsors added</div>}
          </div>
        </div>
      )}


      {activeTab === 'Distribute' && (
        <div className="space-y-5">
          {/* Option C: Widget Embed */}
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-[var(--pill)] flex items-center justify-center">
                <Globe size={16} className="text-[var(--accent)]" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Embedded Booking Widget</h3>
                <p className="text-xs text-[var(--muted)]">Drop this on any website — BellaNaija, corporate intranets, personal sites</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {(['card', 'full', 'button'] as const).map(mode => {
                const labels: Record<string, string> = {
                  card: '🎴 Card + link',
                  full: '📋 Full form',
                  button: '🔘 Button only',
                };
                const needsGrowth = mode === 'full' && !isGrowthPlus;
                return (
                  <div key={mode} className="relative">
                    <button
                      onClick={async () => {
                        if (needsGrowth) {
                          toast.error('Full inline widget requires the Growth plan.');
                          return;
                        }
                        const res = await distributionApi.getWidgetSnippet(id, { mode });
                        copySnippet(res.data.snippet);
                        toast.success('Widget code copied!');
                      }}
                      className={`card p-3 text-left transition-colors w-full ${needsGrowth ? 'opacity-50 cursor-not-allowed' : 'hover:border-[var(--accent)] cursor-pointer'}`}>
                      <div className="text-sm font-semibold mb-0.5">{labels[mode]}</div>
                      <div className="text-[11px] text-[var(--muted)]">
                        {needsGrowth ? 'Growth plan required' : 'Copy embed code'}
                      </div>
                    </button>
                    {needsGrowth && (
                      <a href="/dashboard/pricing"
                        className="absolute top-1.5 right-1.5 text-[10px] font-bold text-[var(--accent)] bg-[var(--pill)] px-1.5 py-0.5 rounded-full">
                        Growth+
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="bg-[var(--bg)] rounded-lg p-3 border border-[var(--border)]">
              <div className="text-[11px] font-mono text-[var(--muted)] leading-relaxed">
                {`<script src="https://portal.owambe.com/widget/${event.slug}" data-mode="card"></script>`}
              </div>
            </div>
            <p className="text-[11px] text-[var(--muted)] mt-2">
              Widget auto-resizes. Registrations appear in your Attendees tab with source: WIDGET.
            </p>
          </div>

          {/* Option A: Channel Pushes */}
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-[var(--pill)] flex items-center justify-center">
                <Radio size={16} className="text-[var(--accent2)]" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Distribution Channels</h3>
                <p className="text-xs text-[var(--muted)]">Publish your event to external platforms with one click</p>
              </div>
            </div>

            {event.status === 'DRAFT' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-xs text-yellow-800">
                ⚠️ Publish your event first before distributing to channels.
              </div>
            )}

            <div className="space-y-3">
              {[
                {
                  channel: 'EVENTBRITE',
                  logo: '🎟️',
                  name: 'Eventbrite',
                  desc: "Nigeria's most-used ticketing platform. Reach millions of event-goers.",
                  color: '#F05537',
                  note: 'Requires EVENTBRITE_API_KEY in env',
                  requiresGrowth: true,
                },
                {
                  channel: 'FACEBOOK_EVENTS',
                  logo: '👥',
                  name: 'Facebook Events',
                  desc: 'Create a Facebook event on your Page. Reach your followers instantly.',
                  color: '#1877F2',
                  note: 'Requires Facebook Page token + Page ID',
                  requiresGrowth: true,
                },
                {
                  channel: 'GOOGLE_EVENTS',
                  logo: '🔍',
                  name: 'Google Events',
                  desc: 'Appear in Google Search event results via structured data + Indexing API.',
                  color: '#4285F4',
                  note: 'Works automatically when event is published',
                  requiresGrowth: false,
                },
              ].map(ch => {
                const existing = distributionData?.distributions?.find(
                  (d: any) => d.channel === ch.channel
                );
                const isPublished = existing?.status === 'PUBLISHED';
                const isFailed = existing?.status === 'FAILED';

                return (
                  <div key={ch.channel} className="flex items-start gap-4 p-4 border border-[var(--border)] rounded-xl">
                    <div className="text-2xl flex-shrink-0">{ch.logo}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-sm">{ch.name}</span>
                        {isPublished && (
                          <span className="badge-confirmed text-[10px]">Live</span>
                        )}
                        {isFailed && (
                          <span className="badge-danger text-[10px]">Failed</span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--muted)] mb-1">{ch.desc}</p>
                      {existing?.externalUrl && (
                        <a href={existing.externalUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-[var(--accent)] hover:underline inline-flex items-center gap-1">
                          <ExternalLink size={10} /> View on {ch.name}
                        </a>
                      )}
                      {existing?.lastError && (
                        <p className="text-[11px] text-red-500 mt-1">Error: {existing.lastError}</p>
                      )}
                      <p className="text-[10px] text-[var(--border)] mt-1">{ch.note}</p>
                    </div>
                    <div className="flex-shrink-0">
                      {isPublished ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-green-600">
                          <CheckCircle2 size={13} /> Published
                        </div>
                      ) : ch.requiresGrowth && !isGrowthPlus ? (
                        <a href="/dashboard/pricing"
                          className="text-xs font-bold text-[var(--accent)] hover:underline whitespace-nowrap flex items-center gap-1">
                          Growth+ →
                        </a>
                      ) : (
                        <button
                          onClick={() => pushMutation.mutate(ch.channel)}
                          disabled={pushMutation.isPending || event.status === 'DRAFT'}
                          className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
                          {pushMutation.isPending ? '...' : 'Publish →'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Attribution stats */}
          {distributionData?.distributions?.some((d: any) => d.clickCount > 0 || d.registrationCount > 0) && (
            <div className="card p-5">
              <h3 className="font-bold text-sm mb-3">Channel Attribution</h3>
              <div className="space-y-2">
                {distributionData.distributions
                  .filter((d: any) => d.status === 'PUBLISHED')
                  .map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                      <span className="text-sm font-medium">{d.channel.replace('_', ' ')}</span>
                      <div className="flex gap-4 text-xs text-[var(--muted)]">
                        <span><strong className="text-[var(--dark)]">{d.clickCount}</strong> clicks</span>
                        <span><strong className="text-[var(--accent)]">{d.registrationCount}</strong> registrations</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'Contracts' && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-bold">{contracts.length} Contracts</span>
            <Link href={`/dashboard/contracts/new`} className="btn-primary text-xs">+ New Contract</Link>
          </div>
          <div className="card overflow-hidden p-0">
            {contracts.length === 0 ? (
              <div className="text-center py-10 text-sm text-[var(--muted)]">No contracts linked to this event</div>
            ) : (
              <table className="w-full">
                <thead><tr>
                  <th className="table-header">Contract</th>
                  <th className="table-header">Vendor</th>
                  <th className="table-header">Amount</th>
                  <th className="table-header">Status</th>
                </tr></thead>
                <tbody>
                  {contracts.map((c: any) => (
                    <tr key={c.id} className="table-row">
                      <td className="table-cell">
                        <Link href={`/dashboard/contracts/${c.id}`} className="font-medium hover:text-[var(--accent)]">
                          {c.title}
                        </Link>
                        <div className="text-[10px] font-mono text-[var(--muted)]">{c.reference}</div>
                      </td>
                      <td className="table-cell text-sm">{c.vendor?.businessName}</td>
                      <td className="table-cell text-sm font-semibold">
                        {c.totalAmount ? formatNGN(Number(c.totalAmount), true) : '—'}
                      </td>
                      <td className="table-cell">
                        <span className={c.status === 'FULLY_SIGNED' ? 'badge-confirmed' : c.status === 'DRAFT' ? 'badge-draft' : 'badge-pending'}>
                          {c.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
