'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { formatNGN, formatTimeAgo, VENDOR_CATEGORY_LABELS, VENDOR_CATEGORY_EMOJIS } from '@/lib/utils';
import toast from 'react-hot-toast';
import { TenantsAdminPanel } from '@/components/TenantsAdminPanel';
import {
  CheckCircle, XCircle, AlertTriangle, Users, Store,
  DollarSign, BarChart2, Shield, Loader2, Eye, Bell, LogOut
} from 'lucide-react';

const TABS = ['Overview', 'Vendor Queue', 'Users', 'Disputes', 'Commission', 'Portals', 'Contracts'];

export default function AdminPage() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('Overview');
  const queryClient = useQueryClient();

  if (user?.role !== 'ADMIN') {
    router.replace('/dashboard');
    return null;
  }

  const handleSignOut = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Admin topbar */}
      <header className="bg-[var(--dark)] border-b border-white/10 h-14 flex items-center px-6 gap-4 sticky top-0 z-20">
        <div className="font-bold text-white">
          owambe<span className="text-[var(--accent2)]">.admin</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-white/50">
            <Shield size={13} className="text-[var(--accent2)]" />
            Admin · {user?.email}
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/90 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/10 border border-white/10"
            title="Sign out"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white border border-[var(--border)] rounded-xl p-1 w-fit">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-[var(--dark)] text-white'
                  : 'text-[var(--muted)] hover:text-[var(--dark)]'
              }`}>
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Overview' && <OverviewTab />}
        {activeTab === 'Vendor Queue' && <VendorQueueTab />}
        {activeTab === 'Users' && <UsersTab />}
        {activeTab === 'Disputes' && <DisputesTab />}
        {activeTab === 'Commission' && <CommissionTab />}
        {activeTab === 'Portals' && <TenantsAdminPanel />}
        {activeTab === 'Contracts' && <ContractsAdminTab />}
      </div>
    </div>
  );
}

// ─── OVERVIEW ────────────────────────────────────────
function OverviewTab() {
  const { data } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/platform/stats').then(r => r.data),
    refetchInterval: 30000,
  });

  const stats = data?.stats;

  const CARDS = [
    { label: 'Total Users', value: stats?.totalUsers ?? '—', icon: <Users size={16} />, color: '#2D6A4F' },
    { label: 'Verified Vendors', value: stats?.totalVendors ?? '—', icon: <Store size={16} />, color: '#E76F2A' },
    { label: 'Total Events', value: stats?.totalEvents ?? '—', icon: <BarChart2 size={16} />, color: '#7B61FF' },
    { label: 'Active Bookings', value: stats?.totalBookings ?? '—', icon: <CheckCircle size={16} />, color: '#059669' },
    { label: 'Total GMV', value: stats ? formatNGN(stats.totalGMV, true) : '—', icon: <DollarSign size={16} />, color: '#0EA5E9' },
    { label: 'Commission Earned', value: stats ? formatNGN(stats.totalCommission, true) : '—', icon: <DollarSign size={16} />, color: '#D97706' },
  ];

  return (
    <div className="animate-fade-up">
      <div className="grid grid-cols-3 gap-4 mb-6">
        {CARDS.map(c => (
          <div key={c.label} className="stat-card">
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: c.color }} />
            <div className="flex items-start justify-between mb-2">
              <div className="stat-label">{c.label}</div>
              <div style={{ color: c.color }}>{c.icon}</div>
            </div>
            <div className="stat-number">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Quick health indicators */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="text-sm font-bold mb-4">Platform Health</div>
          {[
            { label: 'API Response Time', value: '< 200ms', status: 'good' },
            { label: 'Payment Success Rate', value: '98.7%', status: 'good' },
            { label: 'Vendor Verification Queue', value: `${stats?.pendingVendors ?? 0} pending`, status: (stats?.pendingVendors ?? 0) > 10 ? 'warn' : 'good' },
            { label: 'Open Disputes', value: '2', status: 'good' },
            { label: 'Email Deliverability', value: '99.1%', status: 'good' },
            { label: 'Database Connections', value: 'Healthy', status: 'good' },
          ].map(h => (
            <div key={h.label} className="flex justify-between items-center py-2 border-b border-[var(--border)] last:border-0 text-sm">
              <span className="text-[var(--mid)]">{h.label}</span>
              <span className={`font-semibold text-xs px-2 py-0.5 rounded-full ${
                h.status === 'good' ? 'bg-green-100 text-green-700' :
                h.status === 'warn' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-600'
              }`}>{h.value}</span>
            </div>
          ))}
        </div>

        <div className="card p-5">
          <div className="text-sm font-bold mb-4">Recent Platform Activity</div>
          <div className="space-y-3 text-sm">
            {[
              { icon: '✅', text: 'Eko Hotel & Suites verified', time: '5m ago' },
              { icon: '📋', text: 'New booking: Wedding · ₦2.4M', time: '12m ago' },
              { icon: '🆕', text: '3 new vendors registered', time: '1h ago' },
              { icon: '💰', text: 'Payout released: ₦450K → Mama Cass', time: '2h ago' },
              { icon: '⚠️', text: 'Dispute opened: booking #OWB-338', time: '3h ago' },
              { icon: '📈', text: '47 registrations today', time: 'Today' },
            ].map((a, i) => (
              <div key={i} className="flex items-start gap-2.5 pb-2 border-b border-[var(--border)] last:border-0">
                <span>{a.icon}</span>
                <div className="flex-1 text-[var(--mid)]">{a.text}</div>
                <div className="text-[11px] text-[var(--muted)] whitespace-nowrap">{a.time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── VENDOR QUEUE ─────────────────────────────────────
function VendorQueueTab() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-vendors-pending'],
    queryFn: () => api.get('/admin/vendors/pending').then(r => r.data),
    refetchInterval: 60000,
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => api.put(`/admin/vendors/${id}/verify`),
    onSuccess: () => {
      toast.success('✅ Vendor verified and live!');
      queryClient.invalidateQueries({ queryKey: ['admin-vendors-pending'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.put(`/admin/vendors/${id}/reject`, { reason }),
    onSuccess: () => {
      toast.success('Vendor rejected with reason');
      queryClient.invalidateQueries({ queryKey: ['admin-vendors-pending'] });
    },
  });

  const [selectedVendor, setSelectedVendor] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);

  const vendors = data?.vendors || [];

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="section-title">Vendor Verification Queue</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">Review and verify vendor profiles. Target: under 24h turnaround.</p>
        </div>
        <span className="badge-pending">{vendors.length} pending</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--muted)]" />
        </div>
      ) : vendors.length === 0 ? (
        <div className="card text-center py-12">
          <CheckCircle size={32} className="mx-auto mb-3 text-green-400" />
          <div className="font-bold text-[var(--dark)]">Queue is clear</div>
          <div className="text-sm text-[var(--muted)]">All vendors have been reviewed</div>
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_380px] gap-5">
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-[var(--border)]">
                  <th className="table-header">Vendor</th>
                  <th className="table-header">Category</th>
                  <th className="table-header">City</th>
                  <th className="table-header">Submitted</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v: any) => (
                  <tr key={v.id}
                    onClick={() => setSelectedVendor(v)}
                    className={`table-row cursor-pointer ${selectedVendor?.id === v.id ? 'bg-[var(--pill)]' : ''}`}>
                    <td className="table-cell">
                      <div className="font-semibold text-sm">{v.businessName}</div>
                      <div className="text-xs text-[var(--muted)]">{v.user?.email}</div>
                    </td>
                    <td className="table-cell text-sm">
                      {VENDOR_CATEGORY_EMOJIS[v.category]} {VENDOR_CATEGORY_LABELS[v.category]}
                    </td>
                    <td className="table-cell text-sm">{v.city || '—'}</td>
                    <td className="table-cell text-xs text-[var(--muted)]">
                      {formatTimeAgo(v.createdAt)}
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); verifyMutation.mutate(v.id); }}
                          disabled={verifyMutation.isPending}
                          className="flex items-center gap-1 bg-green-500 text-white text-xs px-2.5 py-1 rounded-lg hover:bg-green-600 transition-colors font-semibold">
                          {verifyMutation.isPending ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={11} />}
                          Verify
                        </button>
                        {showRejectInput === v.id ? (
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <input className="input text-xs py-0.5 px-2 w-32"
                              placeholder="Reason..."
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)} />
                            <button
                              onClick={() => {
                                rejectMutation.mutate({ id: v.id, reason: rejectReason });
                                setShowRejectInput(null);
                                setRejectReason('');
                              }}
                              className="bg-red-500 text-white text-xs px-2 py-1 rounded-lg font-semibold">
                              Send
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowRejectInput(v.id); }}
                            className="flex items-center gap-1 bg-red-50 text-red-600 text-xs px-2.5 py-1 rounded-lg hover:bg-red-100 transition-colors font-semibold border border-red-200">
                            <XCircle size={11} /> Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Detail panel */}
          <div>
            {selectedVendor ? (
              <div className="card overflow-hidden">
                <div className="bg-[var(--bg)] px-5 py-4 border-b border-[var(--border)]">
                  <div className="font-bold text-sm">{selectedVendor.businessName}</div>
                  <div className="text-xs text-[var(--muted)]">{selectedVendor.user?.email}</div>
                </div>
                <div className="p-5 space-y-3 text-sm">
                  {[
                    ['Category', `${VENDOR_CATEGORY_EMOJIS[selectedVendor.category]} ${VENDOR_CATEGORY_LABELS[selectedVendor.category]}`],
                    ['City', selectedVendor.city || '—'],
                    ['Address', selectedVendor.address || '—'],
                    ['Min Price', selectedVendor.minPrice ? formatNGN(selectedVendor.minPrice) : '—'],
                    ['Max Price', selectedVendor.maxPrice ? formatNGN(selectedVendor.maxPrice) : '—'],
                    ['Instant Book', selectedVendor.isInstantBook ? '✅ Yes' : '❌ No'],
                    ['Bank Connected', selectedVendor.paystackSubAccountCode ? '✅ Yes' : '❌ No'],
                    ['Registered', formatTimeAgo(selectedVendor.createdAt)],
                  ].map(([l, v]) => (
                    <div key={l} className="flex justify-between">
                      <span className="text-[var(--muted)]">{l}</span>
                      <span className="font-semibold text-right ml-2 max-w-[180px] truncate">{v}</span>
                    </div>
                  ))}
                  {selectedVendor.description && (
                    <div>
                      <div className="text-[var(--muted)] mb-1">Description</div>
                      <div className="text-xs bg-[var(--bg)] p-3 rounded-lg leading-relaxed line-clamp-4">
                        {selectedVendor.description}
                      </div>
                    </div>
                  )}
                </div>
                <div className="px-5 py-4 border-t border-[var(--border)] flex gap-2">
                  <button
                    onClick={() => verifyMutation.mutate(selectedVendor.id)}
                    disabled={verifyMutation.isPending}
                    className="btn-primary flex-1 text-xs flex items-center justify-center gap-1.5">
                    <CheckCircle size={12} /> Verify & Go Live
                  </button>
                  <button
                    onClick={() => setShowRejectInput(selectedVendor.id)}
                    className="btn-danger flex-1 text-xs flex items-center justify-center gap-1.5">
                    <XCircle size={12} /> Reject
                  </button>
                </div>
              </div>
            ) : (
              <div className="card p-8 text-center text-sm text-[var(--muted)]">
                <Eye size={28} className="mx-auto mb-3 text-[var(--border)]" />
                Select a vendor to review details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── USERS ───────────────────────────────────────────
function UsersTab() {
  const [roleFilter, setRoleFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', roleFilter],
    queryFn: () => api.get('/admin/users', { params: { role: roleFilter || undefined } }).then(r => r.data),
  });

  const suspendMutation = useMutation({
    mutationFn: (id: string) => api.put(`/admin/users/${id}/suspend`),
    onSuccess: () => toast.success('User suspended'),
  });

  const users = data?.users || [];

  return (
    <div className="animate-fade-up">
      <div className="flex gap-2 mb-4">
        {['', 'PLANNER', 'VENDOR', 'CONSUMER', 'ADMIN'].map(r => (
          <button key={r} onClick={() => setRoleFilter(r)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
              roleFilter === r ? 'bg-[var(--dark)] text-white border-[var(--dark)]' : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]'
            }`}>{r || 'All Roles'}</button>
        ))}
        <div className="ml-auto text-xs text-[var(--muted)] flex items-center">
          {data?.total ?? 0} users total
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-[var(--muted)]" /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-[var(--border)]">
                <th className="table-header">User</th>
                <th className="table-header">Role</th>
                <th className="table-header">Status</th>
                <th className="table-header">Joined</th>
                <th className="table-header">Last Login</th>
                <th className="table-header">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id} className="table-row">
                  <td className="table-cell">
                    <div className="font-semibold text-sm">{u.firstName} {u.lastName}</div>
                    <div className="text-xs text-[var(--muted)]">{u.email}</div>
                  </td>
                  <td className="table-cell">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                      u.role === 'VENDOR' ? 'bg-orange-100 text-orange-700' :
                      u.role === 'PLANNER' ? 'bg-green-100 text-green-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>{u.role}</span>
                  </td>
                  <td className="table-cell">
                    <span className={u.isActive ? 'badge-live' : 'badge-cancelled'}>
                      {u.isActive ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="table-cell text-xs text-[var(--muted)]">{formatTimeAgo(u.createdAt)}</td>
                  <td className="table-cell text-xs text-[var(--muted)]">
                    {u.lastLoginAt ? formatTimeAgo(u.lastLoginAt) : 'Never'}
                  </td>
                  <td className="table-cell">
                    {u.isActive && u.role !== 'ADMIN' && (
                      <button
                        onClick={() => { if (confirm('Suspend this user?')) suspendMutation.mutate(u.id); }}
                        className="text-xs text-[var(--danger)] hover:underline font-semibold">
                        Suspend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── DISPUTES ─────────────────────────────────────────
function DisputesTab() {
  const MOCK_DISPUTES = [
    { id: '1', ref: 'OWB-338-FGH', type: 'Vendor Cancellation', planner: 'Adaeze Okonkwo', vendor: 'Eko Hotel & Suites', amount: 2400000, opened: '2h ago', status: 'OPEN' },
    { id: '2', ref: 'OWB-291-KLM', type: 'Service Quality', planner: 'Emeka Nwosu', vendor: 'Glow Up Studio', amount: 150000, opened: '1d ago', status: 'UNDER_REVIEW' },
  ];

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="section-title">Dispute Management</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">Resolve within 24 hours. Full refund if vendor at fault.</p>
        </div>
        <span className="badge-pending">{MOCK_DISPUTES.length} open</span>
      </div>

      <div className="space-y-3">
        {MOCK_DISPUTES.map(d => (
          <div key={d.id} className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-[var(--muted)]">{d.ref}</span>
                  <span className="badge-pending text-[10px]">{d.type}</span>
                  <span className={d.status === 'OPEN' ? 'badge-pending' : 'badge-upcoming'}>{d.status}</span>
                </div>
                <div className="text-sm text-[var(--muted)]">
                  <strong className="text-[var(--dark)]">{d.planner}</strong> vs{' '}
                  <strong className="text-[var(--dark)]">{d.vendor}</strong>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-[var(--accent)]">{formatNGN(d.amount)}</div>
                <div className="text-xs text-[var(--muted)]">Opened {d.opened}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => toast('📧 Both parties messaged for evidence')}
                className="btn-secondary text-xs flex items-center gap-1.5">
                <Bell size={11} /> Request Evidence
              </button>
              <button onClick={() => toast('💰 Full refund issued to client')}
                className="btn-primary text-xs">
                Issue Full Refund
              </button>
              <button onClick={() => toast('✅ Dispute resolved — no refund')}
                className="btn-secondary text-xs">
                Resolve — No Refund
              </button>
              <button onClick={() => toast('⚖️ Partial refund issued')}
                className="btn-secondary text-xs">
                Partial Refund
              </button>
            </div>
          </div>
        ))}
        {MOCK_DISPUTES.length === 0 && (
          <div className="card text-center py-12">
            <CheckCircle size={32} className="mx-auto mb-3 text-green-400" />
            <div className="font-bold text-[var(--dark)]">No open disputes</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── COMMISSION ───────────────────────────────────────
function CommissionTab() {
  const { data } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/platform/stats').then(r => r.data),
  });

  const stats = data?.stats;

  const RATE_PRESETS = [
    { category: 'Venues', rate: '10-12%', note: 'RFQ only, negotiated' },
    { category: 'Catering', rate: '8-10%', note: 'Instant + RFQ' },
    { category: 'Photography & Video', rate: '8%', note: 'Instant book' },
    { category: 'AV & Production', rate: '8%', note: 'Instant + RFQ' },
    { category: 'Décor & Florals', rate: '8%', note: 'Instant + RFQ' },
    { category: 'Entertainment', rate: '8-10%', note: 'Instant + RFQ' },
    { category: 'Makeup Artists', rate: '8%', note: 'Instant book' },
    { category: 'Speakers', rate: '10%', note: 'RFQ only' },
  ];

  return (
    <div className="animate-fade-up">
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl bg-[var(--accent)]" />
          <div className="stat-label">Total GMV</div>
          <div className="stat-number">{stats ? formatNGN(stats.totalGMV, true) : '—'}</div>
          <div className="text-xs text-[var(--muted)] mt-1">All completed bookings</div>
        </div>
        <div className="stat-card">
          <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl bg-[var(--accent2)]" />
          <div className="stat-label">Commission Earned</div>
          <div className="stat-number">{stats ? formatNGN(stats.totalCommission, true) : '—'}</div>
          <div className="text-xs text-[var(--muted)] mt-1">Platform revenue</div>
        </div>
        <div className="stat-card">
          <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl bg-[#7B61FF]" />
          <div className="stat-label">Avg Commission Rate</div>
          <div className="stat-number">8.6%</div>
          <div className="text-xs text-[var(--muted)] mt-1">Across all categories</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] font-bold text-sm">
          Commission Rate Structure
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="table-header">Category</th>
              <th className="table-header">Commission Rate</th>
              <th className="table-header">Booking Type</th>
              <th className="table-header">Action</th>
            </tr>
          </thead>
          <tbody>
            {RATE_PRESETS.map(r => (
              <tr key={r.category} className="table-row">
                <td className="table-cell font-semibold text-sm">{r.category}</td>
                <td className="table-cell">
                  <span className="badge-live">{r.rate}</span>
                </td>
                <td className="table-cell text-xs text-[var(--muted)]">{r.note}</td>
                <td className="table-cell">
                  <button onClick={() => toast(`Updated ${r.category} rate`)}
                    className="text-xs text-[var(--accent)] hover:underline font-semibold">
                    Edit Rate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--muted)]">
          💡 Launch bonus: New vendors pay 0% commission for first 90 days — automatically applied at registration.
        </div>
      </div>
    </div>
  );
}

// ─── CONTRACTS ADMIN TAB ──────────────────────────────
function ContractsAdminTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-contracts'],
    queryFn: () => api.get('/contracts', { params: { limit: 100 } }).then(r => r.data),
  });

  const contracts = data?.contracts || [];

  const STATUS_COLORS: Record<string, string> = {
    DRAFT: 'badge-draft',
    SENT: 'badge-upcoming',
    PARTIALLY_SIGNED: 'badge-pending',
    FULLY_SIGNED: 'badge-confirmed',
    VOID: 'badge-cancelled',
    EXPIRED: 'badge-draft',
  };

  const stats = {
    total: contracts.length,
    signed: contracts.filter((c: any) => c.status === 'FULLY_SIGNED').length,
    pending: contracts.filter((c: any) => ['SENT', 'PARTIALLY_SIGNED'].includes(c.status)).length,
    voided: contracts.filter((c: any) => c.status === 'VOID').length,
  };

  return (
    <div className="animate-fade-up">
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total Contracts', value: stats.total, color: '#9A9080' },
          { label: 'Fully Signed', value: stats.signed, color: '#059669' },
          { label: 'Awaiting Signature', value: stats.pending, color: '#D97706' },
          { label: 'Voided', value: stats.voided, color: '#E63946' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: s.color }} />
            <div className="stat-label">{s.label}</div>
            <div className="stat-number">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden p-0">
        <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <span className="text-sm font-bold">All Contracts</span>
          <span className="text-xs text-[var(--muted)]">{contracts.length} contracts</span>
        </div>
        {isLoading ? (
          <div className="text-center py-8 text-[var(--muted)] text-sm">Loading...</div>
        ) : contracts.length === 0 ? (
          <div className="text-center py-8 text-[var(--muted)] text-sm">No contracts yet</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Contract</th>
                <th className="table-header">Planner</th>
                <th className="table-header">Vendor</th>
                <th className="table-header">Amount</th>
                <th className="table-header">Status</th>
                <th className="table-header">Signed</th>
                <th className="table-header">Created</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c: any) => {
                const signed = c.signatures?.filter((s: any) => s.isSigned).length ?? 0;
                const total = c.signatures?.length ?? 0;
                return (
                  <tr key={c.id} className="table-row">
                    <td className="table-cell">
                      <div className="font-semibold text-sm" style={{ maxWidth: 200 }}>{c.title}</div>
                      <div className="text-[10px] font-mono text-[var(--muted)]">{c.reference}</div>
                    </td>
                    <td className="table-cell text-sm text-[var(--muted)]">
                      {c.planner?.user?.email}
                    </td>
                    <td className="table-cell text-sm">{c.vendor?.businessName}</td>
                    <td className="table-cell text-sm font-semibold">
                      {c.totalAmount ? `₦${Number(c.totalAmount).toLocaleString('en-NG')}` : '—'}
                    </td>
                    <td className="table-cell">
                      <span className={STATUS_COLORS[c.status] || 'badge-draft'}>
                        {c.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="table-cell text-sm text-[var(--muted)]">{signed}/{total}</td>
                    <td className="table-cell text-xs text-[var(--muted)]">
                      {new Date(c.createdAt).toLocaleDateString('en-NG')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
