'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate, formatNGN } from '@/lib/utils';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Plus, Download, Send, Eye, RotateCcw, Ban, Loader2, FileText } from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  DRAFT:            { label: 'Draft',           bg: '#F3F4F6', text: '#374151', dot: '#9CA3AF' },
  SENT:             { label: 'Sent',            bg: '#EFF6FF', text: '#1D4ED8', dot: '#3B82F6' },
  PARTIALLY_SIGNED: { label: 'Part. Signed',    bg: '#FEF3C7', text: '#92400E', dot: '#F59E0B' },
  FULLY_SIGNED:     { label: 'Fully Signed',    bg: '#D1FAE5', text: '#065F46', dot: '#10B981' },
  VOID:             { label: 'Void',            bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' },
  EXPIRED:          { label: 'Expired',         bg: '#F3F4F6', text: '#6B7280', dot: '#9CA3AF' },
};

const STATUS_TABS = ['ALL', 'DRAFT', 'SENT', 'PARTIALLY_SIGNED', 'FULLY_SIGNED', 'VOID'];

export default function ContractsPage() {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['contracts', statusFilter],
    queryFn: () => api.get('/contracts', {
      params: { status: statusFilter === 'ALL' ? undefined : statusFilter, limit: 50 }
    }).then(r => r.data),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/contracts/${id}/send`),
    onSuccess: () => {
      toast.success('📧 Contract sent to both parties for signing!');
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to send'),
  });

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/contracts/${id}/void`, { reason }),
    onSuccess: () => {
      toast.success('Contract voided');
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });

  const resendMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.post(`/contracts/${id}/resend/${role}`),
    onSuccess: () => toast.success('Reminder sent!'),
  });

  const contracts = data?.contracts || [];

  function downloadPdf(id: string, reference: string) {
    window.open(`/api/contracts/${id}/pdf`, '_blank');
  }

  function handleVoid(id: string) {
    const reason = prompt('Reason for voiding this contract?');
    if (reason) voidMutation.mutate({ id, reason });
  }

  return (
    <div className="p-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-bold text-lg">Contracts</h1>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Digital agreements between you and your vendors — legally binding, stored forever
          </p>
        </div>
        <Link href="/dashboard/contracts/new" className="btn-primary text-sm flex items-center gap-1.5">
          <Plus size={14} /> New Contract
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Total', value: data?.total ?? '—', color: '#8B82A0' },
          { label: 'Awaiting Signature', value: contracts.filter((c: any) => ['SENT', 'PARTIALLY_SIGNED'].includes(c.status)).length, color: '#F59E0B' },
          { label: 'Fully Signed', value: contracts.filter((c: any) => c.status === 'FULLY_SIGNED').length, color: '#059669' },
          { label: 'Drafts', value: contracts.filter((c: any) => c.status === 'DRAFT').length, color: '#8B82A0' },
          { label: 'Voided', value: contracts.filter((c: any) => c.status === 'VOID').length, color: '#DC2626' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: s.color }} />
            <div className="stat-label">{s.label}</div>
            <div className="stat-number">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 bg-white border border-[var(--border)] rounded-lg p-1 w-fit">
        {STATUS_TABS.map(tab => (
          <button key={tab} onClick={() => setStatusFilter(tab)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              statusFilter === tab ? 'bg-[var(--dark)] text-white' : 'text-[var(--muted)] hover:text-[var(--dark)]'
            }`}>
            {tab === 'ALL' ? 'All' : STATUS_CONFIG[tab]?.label || tab}
          </button>
        ))}
      </div>

      {/* Contracts table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--muted)]" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="card text-center py-14">
          <FileText size={40} className="mx-auto mb-3 text-[var(--border)]" />
          <div className="font-bold text-[var(--dark)] mb-1">No contracts yet</div>
          <p className="text-sm text-[var(--muted)] mb-5 max-w-sm mx-auto">
            Create a contract directly from a booking or draft a new one from scratch.
          </p>
          <Link href="/dashboard/contracts/new" className="btn-primary inline-flex items-center gap-1.5 text-sm">
            <Plus size={14} /> Create Contract
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-[var(--border)]">
                <th className="table-header">Contract</th>
                <th className="table-header">Vendor</th>
                <th className="table-header">Amount</th>
                <th className="table-header">Event Date</th>
                <th className="table-header">Status</th>
                <th className="table-header">Signatures</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c: any) => {
                const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.DRAFT;
                const signedCount = c.signatures?.filter((s: any) => s.isSigned).length || 0;
                const totalSigs = c.signatures?.length || 0;

                return (
                  <tr key={c.id} className="table-row">
                    <td className="table-cell">
                      <div className="font-semibold text-sm text-[var(--dark)]" style={{ maxWidth: 200 }}>
                        {c.title}
                      </div>
                      <div className="text-[10px] font-mono text-[var(--muted)] mt-0.5">{c.reference}</div>
                    </td>
                    <td className="table-cell text-sm">{c.vendor?.businessName}</td>
                    <td className="table-cell font-semibold text-sm text-[var(--accent)]">
                      {c.totalAmount ? formatNGN(Number(c.totalAmount), true) : '—'}
                    </td>
                    <td className="table-cell text-sm text-[var(--muted)]">
                      {c.eventDate ? formatDate(c.eventDate, 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="table-cell">
                      <span style={{
                        background: cfg.bg, color: cfg.text,
                        padding: '3px 8px', borderRadius: 12,
                        fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot }} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        {c.signatures?.map((s: any) => (
                          <div key={s.signerRole} title={`${s.signerRole}: ${s.isSigned ? 'Signed' : 'Pending'}`}
                            style={{
                              width: 22, height: 22, borderRadius: '50%',
                              background: s.isSigned ? '#059669' : '#E5E0F0',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, color: s.isSigned ? '#fff' : '#8B82A0', fontWeight: 700,
                            }}>
                            {s.signerRole === 'PLANNER' ? 'P' : 'V'}
                          </div>
                        ))}
                        <span className="text-xs text-[var(--muted)] ml-1">{signedCount}/{totalSigs}</span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        <Link href={`/dashboard/contracts/${c.id}`}
                          className="p-1.5 rounded-md hover:bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--dark)] transition-colors"
                          title="View">
                          <Eye size={13} />
                        </Link>

                        {c.status === 'DRAFT' && (
                          <button
                            onClick={() => sendMutation.mutate(c.id)}
                            disabled={sendMutation.isPending}
                            className="p-1.5 rounded-md hover:bg-[var(--accent)] hover:text-white text-[var(--muted)] transition-colors"
                            title="Send for signing">
                            {sendMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                          </button>
                        )}

                        {['SENT', 'PARTIALLY_SIGNED'].includes(c.status) && (
                          <>
                            {c.signatures?.filter((s: any) => !s.isSigned).map((s: any) => (
                              <button key={s.signerRole}
                                onClick={() => resendMutation.mutate({ id: c.id, role: s.signerRole })}
                                title={`Remind ${s.signerRole}`}
                                className="p-1.5 rounded-md hover:bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--dark)] transition-colors">
                                <RotateCcw size={13} />
                              </button>
                            ))}
                          </>
                        )}

                        {c.status !== 'VOID' && (
                          <button
                            onClick={() => downloadPdf(c.id, c.reference)}
                            className="p-1.5 rounded-md hover:bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--dark)] transition-colors"
                            title="Download PDF">
                            <Download size={13} />
                          </button>
                        )}

                        {!['FULLY_SIGNED', 'VOID'].includes(c.status) && (
                          <button
                            onClick={() => handleVoid(c.id)}
                            className="p-1.5 rounded-md hover:bg-red-50 hover:text-red-600 text-[var(--muted)] transition-colors"
                            title="Void contract">
                            <Ban size={13} />
                          </button>
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
