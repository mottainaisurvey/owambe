'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Home, Bed, Calendar, Star, BarChart2, Plus, ArrowRight,
  TrendingUp, Users, CheckCircle, Clock, RefreshCw
} from 'lucide-react';
import { api } from '@/lib/api';

interface StaysDashboardStats {
  totalProperties: number;
  totalRooms: number;
  confirmedBookings: number;
  checkedInBookings: number;
  pendingBookings: number;
  totalNetRevenue: number;
  currency: string;
  coastalCorridorSyncedProperties: number;
  recentBookings: Array<{
    id: string;
    reference: string;
    guestName: string;
    propertyName: string;
    checkInDate: string;
    checkOutDate: string;
    status: string;
    channelOrigin?: string | null;
  }>;
}

const QUICK_LINKS = [
  { href: '/dashboard/stays/properties', icon: Bed, label: 'My Properties', desc: 'Manage your listed properties' },
  { href: '/dashboard/stays/bookings', icon: Calendar, label: 'Reservations', desc: 'View and manage guest reservations' },
  { href: '/dashboard/stays/calendar', icon: Calendar, label: 'Availability', desc: 'Set availability and pricing' },
  { href: '/dashboard/stays/reviews', icon: Star, label: 'Reviews', desc: 'Guest reviews and ratings' },
  { href: '/dashboard/stays/analytics', icon: BarChart2, label: 'Analytics', desc: 'Revenue and occupancy insights' },
];

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: 'text-green-700 bg-green-50',
  CHECKED_IN: 'text-blue-700 bg-blue-50',
  CHECKED_OUT: 'text-purple-700 bg-purple-50',
  CANCELLED: 'text-red-700 bg-red-50',
  PENDING: 'text-yellow-700 bg-yellow-50',
};

const CHANNEL_LABELS: Record<string, string> = {
  COASTAL_CORRIDOR: 'CC',
  HOTELS_NG: 'Hotels.ng',
  BOOKING_COM: 'Booking.com',
  AIRBNB: 'Airbnb',
};

export default function StaysDashboard() {
  const [stats, setStats] = useState<StaysDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/properties/host/dashboard-stats')
      .then(({ data }) => setStats(data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🏡</span>
            <h1 className="text-2xl font-bold text-[var(--dark)]">Stays Dashboard</h1>
          </div>
          <p className="text-[var(--mid)] text-sm">
            List and manage your short-stay properties. Accept bookings, set availability, and earn.
          </p>
        </div>
        <Link
          href="/dashboard/stays/properties/new"
          className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
        >
          <Plus size={15} />
          Add Property
        </Link>
      </div>

      {/* Stats row */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-[var(--border)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Bed size={14} className="text-[var(--accent)]" />
              <span className="text-xs text-[var(--mid)]">Properties</span>
            </div>
            <div className="text-2xl font-bold text-[var(--dark)]">{stats.totalProperties}</div>
            <div className="text-xs text-[var(--mid)] mt-0.5">{stats.totalRooms} rooms total</div>
          </div>
          <div className="bg-white border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle size={14} className="text-green-600" />
              <span className="text-xs text-[var(--mid)]">Confirmed</span>
            </div>
            <div className="text-2xl font-bold text-[var(--dark)]">{stats.confirmedBookings}</div>
            <div className="text-xs text-[var(--mid)] mt-0.5">{stats.checkedInBookings} checked in</div>
          </div>
          <div className="bg-white border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <RefreshCw size={14} className="text-purple-600" />
              <span className="text-xs text-[var(--mid)]">CC Synced</span>
            </div>
            <div className="text-2xl font-bold text-[var(--dark)]">{stats.coastalCorridorSyncedProperties}</div>
            <div className="text-xs text-[var(--mid)] mt-0.5">of {stats.totalProperties} properties</div>
          </div>
          <div className="bg-white border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-[var(--accent)]" />
              <span className="text-xs text-[var(--mid)]">Net Revenue</span>
            </div>
            <div className="text-lg font-bold text-[var(--dark)]">
              ₦{stats.totalNetRevenue.toLocaleString('en-NG')}
            </div>
            <div className="text-xs text-[var(--mid)] mt-0.5">all time</div>
          </div>
        </div>
      ) : null}

      {/* Coastal Corridor sync status */}
      {stats && stats.totalProperties > 0 && stats.coastalCorridorSyncedProperties < stats.totalProperties && (
        <div className="bg-gradient-to-r from-[var(--accent)]/10 to-[var(--accent2)]/10 border border-[var(--accent)]/20 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--accent)]/20 flex items-center justify-center shrink-0">
              <RefreshCw size={14} className="text-[var(--accent)]" />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--dark)] text-sm mb-0.5">
                {stats.totalProperties - stats.coastalCorridorSyncedProperties} {stats.totalProperties - stats.coastalCorridorSyncedProperties === 1 ? 'property' : 'properties'} not yet synced to Coastal Corridor
              </h3>
              <p className="text-xs text-[var(--mid)]">
                Push your properties to Coastal Corridor to start receiving bookings from their platform.
              </p>
              <Link href="/dashboard/stays/properties" className="text-xs text-[var(--accent)] hover:underline mt-1 inline-block">
                Manage properties →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Phase B live banner (only if no properties yet) */}
      {stats && stats.totalProperties === 0 && (
        <div className="bg-gradient-to-r from-[var(--accent)]/10 to-[var(--accent2)]/10 border border-[var(--accent)]/20 rounded-xl p-5 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--accent)]/20 flex items-center justify-center shrink-0 mt-0.5">
              <Home size={16} className="text-[var(--accent)]" />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--dark)] mb-1">Stays Mode — Phase B is Live</h3>
              <p className="text-sm text-[var(--mid)]">
                Add your first property to start accepting bookings directly and via Coastal Corridor.
                Once listed, your property will be pushed to Coastal Corridor automatically.
              </p>
              <Link href="/dashboard/stays/properties/new" className="text-sm text-[var(--accent)] hover:underline mt-1 inline-block font-medium">
                Add your first property →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Recent bookings */}
      {stats && stats.recentBookings.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[var(--dark)] text-sm">Recent Reservations</h2>
            <Link href="/dashboard/stays/bookings" className="text-xs text-[var(--accent)] hover:underline">
              View all →
            </Link>
          </div>
          <div className="space-y-2">
            {stats.recentBookings.map(b => (
              <Link
                key={b.id}
                href={`/dashboard/stays/bookings/${b.id}`}
                className="flex items-center justify-between bg-white border border-[var(--border)] rounded-xl px-4 py-3 hover:shadow-sm transition-shadow"
              >
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-[var(--dark)]">{b.guestName}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[b.status] ?? 'text-gray-700 bg-gray-50'}`}>
                      {b.status}
                    </span>
                    {b.channelOrigin && b.channelOrigin !== 'OWAMBE' && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700">
                        {CHANNEL_LABELS[b.channelOrigin] ?? b.channelOrigin}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--mid)]">
                    {b.propertyName} · {new Date(b.checkInDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })} → {new Date(b.checkOutDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
                <ArrowRight size={14} className="text-[var(--muted)]" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick Links */}
      <h2 className="font-semibold text-[var(--dark)] text-sm mb-3">Quick Access</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group bg-white border border-[var(--border)] rounded-xl p-4 hover:border-[var(--accent)] hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
                <link.icon size={16} className="text-[var(--accent)]" />
              </div>
              <ArrowRight size={14} className="text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors mt-1" />
            </div>
            <div className="font-semibold text-[var(--dark)] text-sm mb-1">{link.label}</div>
            <div className="text-xs text-[var(--mid)]">{link.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
