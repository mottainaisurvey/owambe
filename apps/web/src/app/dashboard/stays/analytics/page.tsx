'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatNGN } from '@/lib/utils';
import { BarChart2, TrendingUp, Home, Calendar, Loader2 } from 'lucide-react';

export default function StaysAnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['stays-dashboard-stats'],
    queryFn: () => api.get('/properties/host/dashboard-stats').then(r => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-[var(--accent)]" size={28} />
      </div>
    );
  }

  const stats = [
    {
      label: 'Total Net Revenue',
      value: data ? formatNGN(data.totalNetRevenue ?? 0, true) : '—',
      icon: TrendingUp,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Properties',
      value: data?.totalProperties ?? '—',
      icon: Home,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Active Rooms',
      value: data?.totalRooms ?? '—',
      icon: BarChart2,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      label: 'Confirmed Bookings',
      value: data?.confirmedBookings ?? '—',
      icon: Calendar,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
  ];

  return (
    <div className="p-6 animate-fade-up">
      <div className="mb-6">
        <h2 className="section-title">Stays Analytics</h2>
        <p className="text-xs text-[var(--muted)] mt-0.5">Revenue and occupancy insights for your properties.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(s => (
          <div key={s.label} className="card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center flex-shrink-0`}>
              <s.icon size={18} className={s.color} />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-[var(--muted)] truncate">{s.label}</div>
              <div className="text-lg font-bold text-[var(--dark)]">{String(s.value)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Bookings */}
      {data?.recentBookings?.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <h3 className="font-semibold text-sm text-[var(--dark)]">Recent Bookings</h3>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {data.recentBookings.map((b: any) => (
              <div key={b.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--dark)] truncate">{b.guestName}</div>
                  <div className="text-xs text-[var(--muted)]">{b.propertyName}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs text-[var(--muted)]">
                    {new Date(b.checkInDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                    {' → '}
                    {new Date(b.checkOutDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    b.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
                    b.status === 'CHECKED_IN' ? 'bg-blue-100 text-blue-700' :
                    b.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {b.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coastal Corridor Sync */}
      {data && (
        <div className="mt-6 card p-5">
          <h3 className="font-semibold text-sm text-[var(--dark)] mb-3">Coastal Corridor Sync</h3>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-[var(--muted)]">Synced Properties: </span>
              <span className="font-semibold text-[var(--dark)]">{data.coastalCorridorSyncedProperties}</span>
              <span className="text-[var(--muted)]"> / {data.totalProperties}</span>
            </div>
            {data.coastalCorridorSyncedProperties < data.totalProperties && (
              <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
                {data.totalProperties - data.coastalCorridorSyncedProperties} not yet synced
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--muted)] mt-2">
            Push properties to Coastal Corridor from the{' '}
            <a href="/dashboard/stays/properties" className="text-[var(--accent)] hover:underline">Properties</a> page.
          </p>
        </div>
      )}
    </div>
  );
}
