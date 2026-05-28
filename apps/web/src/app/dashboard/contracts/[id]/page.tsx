'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate, formatNGN } from '@/lib/utils';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Download, Send, RotateCcw, Ban,
  CheckCircle, Clock, Eye, Loader2, Copy, FileText,
} from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:            { label: 'Draft',          color: '#6B7280', bg: '#F9FAFB' },
  SENT:             { label: 'Sent',           color: '#1D4ED8', bg: '#EFF6FF' },
  PARTIALLY_SIGNED: { label: 'Partly Signed',  color: '#B45309', bg: '#FEF3C7' },
  FULLY_SIGNED:     { label: 'Fully Signed',   color: '#065F46', bg: '#D1FAE5' },
  VOID:             { label: 'Void',           color: '#991B1B', bg: '#FEE2E2' },
  EXPIRED:          { label: 'Expired',        color: '#4B5563', bg: '#F3F4F6' },
};

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://owambe.com';

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['contract', id],
    queryFn: () => api.get(`/contracts/${id}`).then(r => r.data),
    refetchInterval: 15000, // poll for signature updates
  });

  const sendMutation = useMutation({
    mutationFn: () => api.post(`/contracts/${id}/send`),
    onSuccess: () => {
      toast.success('📧 Signing links sent to both parties');
      queryClient.invalidateQueries({ queryKey: ['contract', id] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to send'),
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) => api.post(`/contracts/${id}/void`, { reason }),
    onSuccess: () => {
      toast.success('Contract voided');
      queryClient.invalidateQueries({ queryKey: ['contract', id] });
    },
  });

  const resendMutation = useMutation({
    mutationFn: (role: string) => api.post(`/contracts/${id}/resend/${role}`),
    onSuccess: () => toast.success('Reminder sent'),
  });

  function downloadPdf() {
    window.open(`/api/contracts/${id}/pdf`, '_blank');
  }

  function handleVoid() {
    const reason = prompt('Reason for voiding this contract?');
    if (reason) voidMutation.mutate(reason);
  }

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center py-16">
        <Loader2 size={24} className="animate-spin text-[var(--muted)]" />
      </div>
    );
  }

  const contract = data?.contract;
  if (!contract) return <div className="p-6 text-sm text-[var(--muted)]">Contract not found.</div>;

  const cfg = STATUS_CONFIG[contract.status] || STATUS_CONFIG.DRAFT;
  const plannerSig = contract.signatures?.find((s: any) => s.signerRole === 'PLANNER');
  const vendorSig = contract.signatures?.find((s: any) => s.signerRole === 'VENDOR');

  const timeline = [
    { label: 'Created', date: contract.createdAt, done: true },
    { label: 'Sent for signing', date: contract.sentAt, done: !!contract.sentAt },
    { label: 'Client signed', date: plannerSig?.signedAt, done: plannerSig?.isSigned },
    { label: 'Vendor signed', date: vendorSig?.signedAt, done: vendorSig?.isSigned },
    { label: 'Fully executed', date: contract.fullySignedAt, done: !!contract.fullySignedAt },
  ];

  return (
    <div className="p-6 animate-fade-up">
      {/* Back */}
      <Link href="/dashboard/contracts"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--dark)] mb-5 transition-colors">
        <ArrowLeft size={14} /> All Contracts
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-bold text-lg">{contract.title}</h1>
            <span style={{
              background: cfg.bg, color: cfg.color,
              padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
            }}>
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
            <span className="font-mono">{contract.reference}</span>
            <button
              onClick={() => { navigator.clipboard.writeText(contract.reference); toast.success('Copied!'); }}
              className="hover:text-[var(--accent)] transition-colors">
              <Copy size={11} />
            </button>
            <span>·</span>
            <span>{contract.templateType?.replace(/_/g, ' ')}</span>
            {contract.expiresAt && (
              <>
                <span>·</span>
                <span>Expires {formatDate(contract.expiresAt, 'MMM d, yyyy')}</span>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          {contract.status === 'DRAFT' && (
            <button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}
              className="btn-primary text-xs flex items-center gap-1.5">
              {sendMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Send for Signing
            </button>
          )}
          {['SENT', 'PARTIALLY_SIGNED'].includes(contract.status) && (
            contract.signatures?.filter((s: any) => !s.isSigned).map((s: any) => (
              <button key={s.signerRole}
                onClick={() => resendMutation.mutate(s.signerRole)}
                disabled={resendMutation.isPending}
                className="btn-secondary text-xs flex items-center gap-1.5">
                <RotateCcw size={12} /> Remind {s.signerRole === 'PLANNER' ? 'Client' : 'Vendor'}
              </button>
            ))
          )}
          <button onClick={downloadPdf} className="btn-secondary text-xs flex items-center gap-1.5">
            <Download size={12} /> Download PDF
          </button>
          {!['FULLY_SIGNED', 'VOID'].includes(contract.status) && (
            <button onClick={handleVoid} className="btn-secondary text-xs text-red-500 border-red-200 hover:bg-red-50 flex items-center gap-1.5">
              <Ban size={12} /> Void
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_300px] gap-5 items-start">
        {/* Left column */}
        <div className="space-y-4">
          {/* Parties & amounts */}
          <div className="card grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] mb-2">Client</div>
              <div className="font-bold text-sm">{contract.planner?.user?.firstName} {contract.planner?.user?.lastName}</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">{contract.planner?.user?.email}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] mb-2">Service Provider</div>
              <div className="font-bold text-sm">{contract.vendor?.businessName}</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">{contract.vendor?.user?.email}</div>
            </div>
            {contract.totalAmount && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] mb-1">Total Amount</div>
                <div className="font-bold text-lg text-[var(--accent)]">{formatNGN(Number(contract.totalAmount))}</div>
              </div>
            )}
            {contract.eventDate && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] mb-1">Event Date</div>
                <div className="font-semibold text-sm">{formatDate(contract.eventDate, 'MMM d, yyyy')}</div>
              </div>
            )}
            {contract.booking && (
              <div className="col-span-2 pt-3 border-t border-[var(--border)]">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] mb-1">Linked Booking</div>
                <Link href={`/dashboard`} className="text-xs font-mono text-[var(--accent)] hover:underline">
                  {contract.booking.reference}
                </Link>
              </div>
            )}
          </div>

          {/* Signature status cards */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] mb-2">Signatures</div>
            <div className="grid grid-cols-2 gap-3">
              {[plannerSig, vendorSig].map((s: any) => s && (
                <div key={s.signerRole} className="card">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                        {s.signerRole === 'PLANNER' ? 'Client' : 'Service Provider'}
                      </div>
                      <div className="font-semibold text-sm mt-0.5">{s.signerName}</div>
                      <div className="text-xs text-[var(--muted)]">{s.signerEmail}</div>
                    </div>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: s.isSigned ? '#D1FAE5' : '#FAF9FC',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {s.isSigned
                        ? <CheckCircle size={18} color="#059669" />
                        : <Clock size={18} color="#8B82A0" />}
                    </div>
                  </div>

                  {s.isSigned ? (
                    <div className="space-y-1">
                      <div className="text-xs text-[var(--muted)]">
                        <span className="font-semibold text-green-600">✓ Signed</span>
                        {' '}{s.signedAt ? formatDate(s.signedAt, 'MMM d, yyyy · HH:mm') : ''}
                      </div>
                      {s.ipAddress && (
                        <div className="text-xs text-[var(--muted)] font-mono">IP: {s.ipAddress}</div>
                      )}
                      {s.viewedAt && (
                        <div className="text-xs text-[var(--muted)]">Viewed: {formatDate(s.viewedAt, 'MMM d, HH:mm')}</div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-[var(--muted)]">
                        {s.viewedAt ? `👁 Viewed ${formatDate(s.viewedAt, 'MMM d')}` : '⏳ Not yet opened'}
                      </div>
                      {['SENT', 'PARTIALLY_SIGNED'].includes(contract.status) && (
                        <button
                          onClick={() => resendMutation.mutate(s.signerRole)}
                          className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1">
                          <RotateCcw size={10} /> Send reminder
                        </button>
                      )}
                      {['SENT', 'PARTIALLY_SIGNED'].includes(contract.status) && (
                        <div>
                          <div className="text-[10px] text-[var(--muted)] mb-0.5">Signing link</div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-[var(--muted)] truncate max-w-[180px]">
                              {BASE_URL}/contracts/sign/{s.signingToken?.slice(0, 16)}…
                            </span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(`${BASE_URL}/contracts/sign/${s.signingToken}`);
                                toast.success('Link copied!');
                              }}
                              className="text-[var(--muted)] hover:text-[var(--accent)] transition-colors flex-shrink-0">
                              <Copy size={10} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Contract body preview */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] mb-2">Contract Body</div>
            <div className="card max-h-[480px] overflow-y-auto p-0">
              <div
                className="p-1"
                style={{ fontSize: '90%' }}
                dangerouslySetInnerHTML={{ __html: contract.bodyHtml }}
              />
            </div>
          </div>
        </div>

        {/* Right: Timeline */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] mb-3">Activity Timeline</div>
          <div className="card">
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[11px] top-3 bottom-3 w-px bg-[var(--border)]" />

              <div className="space-y-5">
                {timeline.map((step, i) => (
                  <div key={step.label} className="flex gap-3">
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0, position: 'relative', zIndex: 1,
                      background: step.done ? '#6C2BD9' : '#FAF9FC',
                      border: `2px solid ${step.done ? '#6C2BD9' : '#E5E0F0'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {step.done && <CheckCircle size={12} color="#fff" />}
                    </div>
                    <div className="pb-1">
                      <div className={`text-sm font-semibold ${step.done ? 'text-[var(--dark)]' : 'text-[var(--muted)]'}`}>
                        {step.label}
                      </div>
                      {step.date && (
                        <div className="text-xs text-[var(--muted)] mt-0.5">
                          {formatDate(step.date, 'MMM d, yyyy · HH:mm')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick actions */}
          {contract.status === 'FULLY_SIGNED' && (
            <div className="card mt-4 bg-[#D1FAE5] border-[#A7F3D0]">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={16} color="#059669" />
                <span className="font-bold text-sm text-green-800">Fully Executed</span>
              </div>
              <p className="text-xs text-green-700 mb-3 leading-relaxed">
                All parties have signed. This is a legally binding agreement. A PDF copy was emailed to both parties.
              </p>
              <button onClick={downloadPdf}
                className="btn-primary text-xs w-full flex items-center justify-center gap-1.5"
                style={{ background: '#059669' }}>
                <Download size={12} /> Download Executed Copy
              </button>
            </div>
          )}

          {contract.status === 'DRAFT' && (
            <div className="card mt-4 bg-[var(--pill)]">
              <div className="font-bold text-sm mb-2">Ready to send?</div>
              <p className="text-xs text-[var(--muted)] mb-3 leading-relaxed">
                Once sent, the contract locks for editing and both parties receive unique signing links by email.
              </p>
              <button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}
                className="btn-primary text-xs w-full flex items-center justify-center gap-1.5">
                {sendMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Send for Signing
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
