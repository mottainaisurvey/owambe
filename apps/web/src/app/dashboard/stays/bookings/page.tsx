'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Calendar, Search, Filter, ChevronDown, ArrowUpRight,
  User, Bed, Clock, CheckCircle, XCircle, AlertCircle, LogIn, LogOut
} from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface StayBooking {
  id: string;
  reference: string;
  guestName: string;
  guestEmail: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  numberOfGuests?: number | null;
  totalAmount: number;
  currency: string;
  netToHost?: number | null;
  channelCommissionPercent?: number | null;
  status: string;
  channelOrigin?: string | null;
  externalRef?: string | null;
  paymentStatus: string;
  specialRequests?: string | null;
  createdAt: string;
  room: { id: string; name: string; roomType: string };
  property: { id: string; name: string; city: string };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  CONFIRMED: { label: 'Confirmed', color: 'text-green-700 bg-green-50 border-green-200', icon: CheckCircle },
  CHECKED_IN: { label: 'Checked In', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: LogIn },
  CHECKED_OUT: { label: 'Checked Out', color: 'text-purple-700 bg-purple-50 border-purple-200', icon: LogOut },
  CANCELLED: { label: 'Cancelled', color: 'text-red-700 bg-red-50 border-red-200', icon: XCircle },
  NO_SHOW: { label: 'No Show', color: 'text-orange-700 bg-orange-50 border-orange-200', icon: AlertCircle },
  PENDING: { label: 'Pending', color: 'text-yellow-700 bg-yellow-50 border-yellow-200', icon: Clock },
};

const CHANNEL_LABELS: Record<string, string> = {
  COASTAL_CORRIDOR: 'Coastal Corridor',
  HOTELS_NG: 'Hotels.ng',
  BOOKING_COM: 'Booking.com',
  AIRBNB: 'Airbnb',
  OWAMBE: 'Direct',
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

export default function StaysBookingsPage() {
  const [bookings, setBookings] = useState<StayBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [channelFilter, setChannelFilter] = useState('ALL');

  const fetchBookings = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await api.get('/properties/host/bookings');
      setBookings(data.data ?? []);
    } catch {
      setBookings([]);
      setLoadError('We could not load reservations. Existing reservations may still exist; please retry before making operational decisions from this page.');
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const filtered = bookings.filter(b => {
    const matchSearch =
      !search ||
      b.guestName.toLowerCase().includes(search.toLowerCase()) ||
      b.guestEmail.toLowerCase().includes(search.toLowerCase()) ||
      b.reference.toLowerCase().includes(search.toLowerCase()) ||
      b.property.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || b.status === statusFilter;
    const matchChannel = channelFilter === 'ALL' || (b.channelOrigin ?? 'OWAMBE') === channelFilter;
    return matchSearch && matchStatus && matchChannel;
  });

  const stats = {
    confirmed: bookings.filter(b => b.status === 'CONFIRMED').length,
    checkedIn: bookings.filter(b => b.status === 'CHECKED_IN').length,
    total: bookings.length,
    revenue: bookings
      .filter(b => ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(b.status))
      .reduce((sum, b) => sum + (b.netToHost ?? Number(b.totalAmount)), 0),
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-[var(--border)] rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--dark)]">Reservations</h1>
          <p className="text-sm text-[var(--mid)] mt-0.5">All guest reservations across your properties</p>
        </div>
      </div>

      {/* Error state */}
      {loadError && (
        <div className="text-center py-14 border border-red-200 bg-red-50 rounded-xl mb-6" role="alert">
          <AlertCircle size={40} className="mx-auto text-red-600 mb-4" />
          <h2 className="font-semibold text-red-900 mb-2">Unable to load reservations</h2>
          <p className="text-sm text-red-700 mb-6 max-w-xl mx-auto">{loadError}</p>
          <button type="button" onClick={fetchBookings} className="btn-primary text-sm px-5 py-2">
            Retry Loading Reservations
          </button>
        </div>
      )}

      {/* Stats row */}
      {!loadError && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Reservations', value: stats.total, color: 'text-[var(--dark)]' },
          { label: 'Confirmed', value: stats.confirmed, color: 'text-green-700' },
          { label: 'Checked In', value: stats.checkedIn, color: 'text-blue-700' },
          {
            label: 'Net Revenue',
            value: `₦${Number(stats.revenue).toLocaleString('en-NG')}`,
            color: 'text-[var(--accent)]',
          },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[var(--border)] rounded-xl p-3">
            <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-[var(--mid)] mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>}

      {/* Filters */}
      {!loadError && <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex-1 min-w-48 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="text"
            placeholder="Search guest, reference, property..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-white focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-sm border border-[var(--border)] rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="ALL">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={channelFilter}
          onChange={e => setChannelFilter(e.target.value)}
          className="text-sm border border-[var(--border)] rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="ALL">All Channels</option>
          {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>}

      {/* Empty state */}
      {!loadError && filtered.length === 0 && (
        <div className="text-center py-14 border border-dashed border-[var(--border)] rounded-xl">
          <Calendar size={36} className="mx-auto text-[var(--muted)] mb-3" />
          <h3 className="font-semibold text-[var(--dark)] mb-1">
            {bookings.length === 0 ? 'No reservations yet' : 'No matching reservations'}
          </h3>
          <p className="text-sm text-[var(--mid)]">
            {bookings.length === 0
              ? 'Reservations from guests and Coastal Corridor will appear here.'
              : 'Try adjusting your search or filters.'}
          </p>
        </div>
      )}

      {/* Reservation list */}
      <div className="space-y-3">
        {!loadError && filtered.map(booking => (
          <div
            key={booking.id}
            className="bg-white border border-[var(--border)] rounded-xl p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-[var(--dark)] text-sm">{booking.guestName}</span>
                  <StatusBadge status={booking.status} />
                  {booking.channelOrigin && booking.channelOrigin !== 'OWAMBE' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                      {CHANNEL_LABELS[booking.channelOrigin] ?? booking.channelOrigin}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-[var(--mid)] mb-2">
                  <Bed size={11} />
                  {booking.property.name} — {booking.room.name}
                  <span className="mx-1">·</span>
                  <span className="font-mono">{booking.reference}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--mid)]">
                  <span className="flex items-center gap-1">
                    <Calendar size={10} />
                    {new Date(booking.checkInDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                    {' → '}
                    {new Date(booking.checkOutDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    ({booking.nights} nights)
                  </span>
                  {booking.numberOfGuests && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <User size={10} />
                        {booking.numberOfGuests} guests
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-semibold text-[var(--dark)] text-sm">
                  {booking.currency} {Number(booking.totalAmount).toLocaleString('en-NG')}
                </div>
                {booking.netToHost != null && (
                  <div className="text-xs text-[var(--mid)]">
                    Net: {booking.currency} {Number(booking.netToHost).toLocaleString('en-NG')}
                  </div>
                )}
                <Link
                  href={`/dashboard/stays/bookings/${booking.id}`}
                  className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline mt-1"
                >
                  View <ArrowUpRight size={10} />
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
