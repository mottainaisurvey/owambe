'use client';
import { useEffect, useState } from 'react';
import {
  Calendar, Search, Clock, CheckCircle, XCircle, AlertCircle, Users, User
} from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface ExperienceBooking {
  id: string;
  reference: string;
  guestName?: string | null;
  guestEmail?: string | null;
  numberOfGuests: number;
  totalAmount: number;
  currency: string;
  status: string;
  paymentStatus: string;
  specialRequests?: string | null;
  createdAt: string;
  experience: { id: string; name: string; city: string };
  slot?: { startTime: string; endTime: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  CONFIRMED: { label: 'Confirmed', color: 'text-green-700 bg-green-50 border-green-200', icon: CheckCircle },
  COMPLETED: { label: 'Completed', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: CheckCircle },
  CANCELLED: { label: 'Cancelled', color: 'text-red-700 bg-red-50 border-red-200', icon: XCircle },
  NO_SHOW: { label: 'No Show', color: 'text-orange-700 bg-orange-50 border-orange-200', icon: AlertCircle },
  PENDING: { label: 'Pending', color: 'text-yellow-700 bg-yellow-50 border-yellow-200', icon: Clock },
  REFUNDED: { label: 'Refunded', color: 'text-purple-700 bg-purple-50 border-purple-200', icon: AlertCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'text-gray-700 bg-gray-50 border-gray-200', icon: Clock };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${cfg.color}`}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

function formatSlotTime(slot?: { startTime: string; endTime: string } | null): string {
  if (!slot) return '—';
  const start = new Date(slot.startTime);
  const end = new Date(slot.endTime);
  return `${start.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })} · ${start.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function ExperienceBookingsPage() {
  const [bookings, setBookings] = useState<ExperienceBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchBookings = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await api.get('/experience-bookings/operator');
      setBookings(data.data ?? []);
    } catch {
      setBookings([]);
      setLoadError('We could not load bookings. Existing bookings may still exist — please retry before making operational decisions.');
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const filtered = bookings.filter(b => {
    const matchStatus = statusFilter === 'ALL' || b.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      b.reference.toLowerCase().includes(q) ||
      (b.guestName ?? '').toLowerCase().includes(q) ||
      (b.guestEmail ?? '').toLowerCase().includes(q) ||
      b.experience.name.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-[var(--border)] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--dark)]">Experience Bookings</h1>
          <p className="text-sm text-[var(--mid)] mt-0.5">
            {bookings.length} total booking{bookings.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="text"
            placeholder="Search by reference, guest name, or experience..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input w-full pl-9 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="input text-sm w-full sm:w-44"
        >
          <option value="ALL">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([value, cfg]) => (
            <option key={value} value={value}>{cfg.label}</option>
          ))}
        </select>
      </div>

      {/* Error state */}
      {loadError && (
        <div className="text-center py-14 border border-red-200 bg-red-50 rounded-xl" role="alert">
          <AlertCircle size={40} className="mx-auto text-red-600 mb-4" />
          <h3 className="font-semibold text-red-900 mb-2">Unable to load bookings</h3>
          <p className="text-sm text-red-700 mb-6">{loadError}</p>
          <button type="button" onClick={fetchBookings} className="btn-primary text-sm px-5 py-2">
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loadError && filtered.length === 0 && (
        <div className="text-center py-16 border border-dashed border-[var(--border)] rounded-xl">
          <Calendar size={40} className="mx-auto text-[var(--muted)] mb-4" />
          <h3 className="font-semibold text-[var(--dark)] mb-2">
            {search || statusFilter !== 'ALL' ? 'No bookings match your filters' : 'No bookings yet'}
          </h3>
          <p className="text-sm text-[var(--mid)]">
            {search || statusFilter !== 'ALL'
              ? 'Try adjusting your search or filter.'
              : 'Bookings will appear here once guests book your experiences.'}
          </p>
        </div>
      )}

      {/* Bookings list */}
      {!loadError && (
        <div className="space-y-3">
          {filtered.map(booking => (
            <div
              key={booking.id}
              className="bg-white border border-[var(--border)] rounded-xl p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-[var(--accent3)] bg-[var(--accent3)]/10 px-2 py-0.5 rounded">
                      {booking.reference}
                    </span>
                    <StatusBadge status={booking.status} />
                  </div>
                  <div className="font-medium text-[var(--dark)] text-sm mb-1 truncate">
                    {booking.experience.name}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--mid)] flex-wrap">
                    <span className="flex items-center gap-1">
                      <User size={11} />
                      {booking.guestName ?? booking.guestEmail ?? 'Guest'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={11} />
                      {booking.numberOfGuests} guest{booking.numberOfGuests !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {formatSlotTime(booking.slot)}
                    </span>
                  </div>
                  {booking.specialRequests && (
                    <p className="text-xs text-[var(--mid)] mt-1 italic">
                      &ldquo;{booking.specialRequests}&rdquo;
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold text-[var(--dark)] text-sm">
                    {booking.currency} {Number(booking.totalAmount).toLocaleString('en-NG')}
                  </div>
                  <div className="text-xs text-[var(--mid)] mt-0.5">
                    {new Date(booking.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
