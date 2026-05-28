'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { instalmentApi, bookingsApi } from '@/lib/api';
import { formatNGN, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import Link from 'next/link';
import {
  Calendar, CheckCircle, XCircle, Clock, AlertTriangle,
  RefreshCw, Plus, ChevronRight, Loader2, TrendingUp,
  CreditCard, Info, ArrowRight, Ban, Lock,
} from 'lucide-react';
import { useAuthStore, getPlanTier, planAtLeast } from '@/store/auth.store';

// ─── CONFIG ──────────────────────────────────────────
const PLAN_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  ACTIVE:     { label: 'Active',     color: '#065F46', bg: '#D1FAE5', dot: '#10B981' },
  COMPLETED:  { label: 'Complete',   color: '#1D4ED8', bg: '#DBEAFE', dot: '#3B82F6' },
  DEFAULTED:  { label: 'Defaulted',  color: '#991B1B', bg: '#FEE2E2', dot: '#EF4444' },
  CANCELLED:  { label: 'Cancelled',  color: '#6B7280', bg: '#F3F4F6', dot: '#9CA3AF' },
  PAUSED:     { label: 'Paused',     color: '#92400E', bg: '#FEF3C7', dot: '#F59E0B' },
};

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  SCHEDULED:   { label: 'Scheduled',   icon: Clock,         color: '#8B82A0' },
  PENDING:     { label: 'Due soon',     icon: AlertTriangle, color: '#D97706' },
  PROCESSING:  { label: 'Processing',  icon: RefreshCw,     color: '#3B82F6' },
  PAID:        { label: 'Paid',         icon: CheckCircle,   color: '#059669' },
  FAILED:      { label: 'Failed',       icon: XCircle,       color: '#DC2626' },
  WAIVED:      { label: 'Waived',       icon: Ban,           color: '#9CA3AF' },
};

const FEE_RATES: Record<number, number> = { 3: 3.5, 6: 5.0 };

// ─── INSTALMENT CALCULATOR WIDGET ────────────────────
function InstalmentCalculator({ bookingId, totalAmount, bookingRef, vendorName, onCreated }: {
  bookingId: string; totalAmount: number; bookingRef: string;
  vendorName: string; onCreated: () => void;
}) {
  const [count, setCount] = useState<3 | 6>(3);
  const [step, setStep] = useState<'select' | 'confirm'>('select');
  const { user } = useAuthStore();
  const isGrowthPlus = planAtLeast(user, 'GROWTH');

  const { data: previewData, isLoading: previewing } = useQuery({
    queryKey: ['instalment-preview', bookingId, count],
    queryFn: () => instalmentApi.preview({ totalAmount, instalmentCount: count }).then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => instalmentApi.create({ bookingId, instalmentCount: count }),
    onSuccess: (res) => {
      const { payment } = res.data;
      toast.success('Plan created! Redirecting to first payment…');
      setTimeout(() => {
        window.location.href = payment.authorizationUrl;
      }, 1200);
      onCreated();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create plan'),
  });

  const preview = previewData?.preview;

  return (
    <div className="card p-6 max-w-lg">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-[var(--pill)] flex items-center justify-center">
          <CreditCard size={18} className="text-[var(--accent)]" />
        </div>
        <div>
          <h3 className="font-bold text-base">Split into instalments</h3>
          <p className="text-xs text-[var(--muted)]">{vendorName} · {bookingRef}</p>
        </div>
      </div>

      {/* Total */}
      <div className="bg-[var(--bg)] rounded-xl p-4 mb-5 flex items-center justify-between">
        <div>
          <div className="text-xs text-[var(--muted)] mb-1">Total booking amount</div>
          <div className="font-bold text-2xl text-[var(--dark)]">{formatNGN(totalAmount)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-[var(--muted)] mb-1">No credit check</div>
          <div className="text-xs font-bold text-green-600 flex items-center gap-1">
            <CheckCircle size={11} /> Instant approval
          </div>
        </div>
      </div>

      {/* Plan selector */}
      <div className="mb-5">
        <label className="label mb-2 block">Choose your plan</label>
        <div className="grid grid-cols-2 gap-3">
          {([3, 6] as const).map(n => {
            const feeRate = FEE_RATES[n];
            const feeAmount = Math.ceil(totalAmount * (feeRate / 100));
            const monthly = Math.round((totalAmount + feeAmount) / n);
            const locked = n === 6 && !isGrowthPlus;
            return (
              <button key={n}
                onClick={() => {
                  if (locked) {
                    window.location.href = '/dashboard/pricing';
                    return;
                  }
                  setCount(n);
                }}
                className={`p-4 rounded-xl border-2 text-left transition-all relative ${
                  locked
                    ? 'border-[var(--border)] opacity-60 cursor-not-allowed bg-[var(--bg)]'
                    : count === n
                    ? 'border-[var(--accent)] bg-[var(--pill)]'
                    : 'border-[var(--border)] hover:border-[var(--accent)] bg-white'
                }`}>
                {locked && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold text-[var(--muted)] bg-[var(--border)] px-1.5 py-0.5 rounded-full">
                    <Lock size={9} /> Growth+
                  </div>
                )}
                <div className="font-bold text-sm mb-0.5">{n} months</div>
                <div className="font-bold text-lg" style={{ color: locked ? 'var(--muted)' : count === n ? 'var(--accent)' : 'var(--dark)' }}>
                  {formatNGN(monthly)}<span className="text-xs font-normal text-[var(--muted)]">/mo</span>
                </div>
                <div className="text-[11px] text-[var(--muted)] mt-1">
                  {locked ? 'Requires Growth plan' : `${feeRate}% service fee`}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Schedule preview */}
      {preview && (
        <div className="mb-5">
          <div className="text-xs font-bold text-[var(--muted)] uppercase tracking-wide mb-3">Payment Schedule</div>
          <div className="space-y-2">
            {preview.schedule.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  i === 0 ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg)] text-[var(--muted)]'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-[var(--dark)]">{item.label}</div>
                  <div className="text-[11px] text-[var(--muted)]">
                    {formatDate(item.dueDate, 'MMM d, yyyy')}
                    {i === 0 && <span className="ml-2 text-[var(--accent)] font-bold">Pay today →</span>}
                  </div>
                </div>
                <div className="font-bold text-sm">{formatNGN(item.amount)}</div>
              </div>
            ))}
          </div>

          {/* Fee breakdown */}
          <div className="mt-4 p-3 bg-[var(--bg)] rounded-lg text-xs">
            <div className="flex justify-between mb-1">
              <span className="text-[var(--muted)]">Booking amount</span>
              <span className="font-semibold">{formatNGN(preview.schedule.reduce((s: number, p: any) => s + p.amount, 0) - preview.serviceFeeAmount)}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-[var(--muted)]">Service fee ({preview.feeRate}%)</span>
              <span className="font-semibold">{formatNGN(preview.serviceFeeAmount)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-[var(--border)] font-bold">
              <span>Total</span>
              <span className="text-[var(--accent)]">{formatNGN(preview.grandTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Terms */}
      <div className="flex items-start gap-2 mb-5 p-3 bg-blue-50 rounded-lg">
        <Info size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-blue-700 leading-relaxed">
          Your card is saved securely after the first payment. Subsequent instalments are charged automatically on schedule. No credit check, no interest — just a flat service fee.
        </p>
      </div>

      <button
        onClick={() => createMutation.mutate()}
        disabled={createMutation.isPending || previewing}
        className="btn-primary w-full justify-center py-3 text-sm">
        {createMutation.isPending
          ? <><Loader2 size={14} className="animate-spin" /> Creating plan…</>
          : <><CreditCard size={14} /> Pay first instalment {preview ? formatNGN(preview.schedule[0]?.amount) : ''} →</>
        }
      </button>
    </div>
  );
}

// ─── PLAN CARD ────────────────────────────────────────
function PlanCard({ plan, onRetry }: { plan: any; onRetry: (planId: string, paymentId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = PLAN_STATUS_CONFIG[plan.status] || PLAN_STATUS_CONFIG.ACTIVE;
  const progressPct = Math.min(100, (Number(plan.amountPaid) / Number(plan.grandTotal)) * 100);
  const paidCount = plan.payments?.filter((p: any) => p.status === 'PAID').length || 0;

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-5 pb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-sm">{plan.booking?.vendor?.businessName}</span>
            <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
              {cfg.label}
            </span>
          </div>
          <div className="text-[11px] text-[var(--muted)] font-mono">{plan.reference}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-bold text-base">{formatNGN(plan.amountPaid, true)}</div>
          <div className="text-[11px] text-[var(--muted)]">of {formatNGN(plan.grandTotal, true)}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between mb-1.5 text-[11px] text-[var(--muted)]">
          <span>{paidCount} of {plan.instalmentCount} paid</span>
          <span>{Math.round(progressPct)}%</span>
        </div>
        <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-700"
            style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Next due */}
      {plan.status === 'ACTIVE' && plan.nextDueDate && (
        <div className="mx-5 mb-4 p-3 bg-[var(--pill)] rounded-lg flex items-center gap-2">
          <Calendar size={13} className="text-[var(--accent)] flex-shrink-0" />
          <span className="text-xs text-[var(--mid)]">
            Next payment: <strong>{formatDate(plan.nextDueDate, 'MMM d, yyyy')}</strong>
          </span>
          {plan.failureCount > 0 && (
            <span className="ml-auto text-xs font-bold text-red-600">
              {plan.failureCount} failed attempt{plan.failureCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {plan.status === 'COMPLETED' && (
        <div className="mx-5 mb-4 p-3 bg-green-50 rounded-lg flex items-center gap-2">
          <CheckCircle size={13} className="text-green-600 flex-shrink-0" />
          <span className="text-xs text-green-700 font-semibold">
            All {plan.instalmentCount} payments complete · {formatDate(plan.completedAt, 'MMM d, yyyy')}
          </span>
        </div>
      )}

      {/* Expand: payment schedule */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 border-t border-[var(--border)] text-xs font-semibold text-[var(--muted)] hover:text-[var(--dark)] hover:bg-[var(--bg)] transition-colors">
        <span>Payment schedule</span>
        <ChevronRight size={13} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)]">
          {plan.payments?.map((payment: any) => {
            const payConfig = PAYMENT_STATUS_CONFIG[payment.status] || PAYMENT_STATUS_CONFIG.SCHEDULED;
            const Icon = payConfig.icon;
            const isFailed = payment.status === 'FAILED';
            return (
              <div key={payment.id}
                className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border)] last:border-0">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: `${payConfig.color}18` }}>
                  <Icon size={12} style={{ color: payConfig.color }}
                    className={payment.status === 'PROCESSING' ? 'animate-spin' : ''} />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-[var(--dark)]">
                    Instalment {payment.instalmentNumber} of {plan.instalmentCount}
                  </div>
                  <div className="text-[11px] text-[var(--muted)]">
                    Due {formatDate(payment.dueDate, 'MMM d, yyyy')}
                    {payment.paidAt && ` · Paid ${formatDate(payment.paidAt, 'MMM d')}`}
                    {payment.failureReason && ` · ${payment.failureReason}`}
                  </div>
                </div>
                <div className="font-bold text-sm text-right flex-shrink-0">
                  <div>{formatNGN(payment.amount)}</div>
                  <div className="text-[11px]" style={{ color: payConfig.color }}>{payConfig.label}</div>
                </div>
                {isFailed && (
                  <button
                    onClick={() => onRetry(plan.id, payment.id)}
                    className="ml-2 text-xs font-bold text-[var(--accent)] hover:underline flex-shrink-0 flex items-center gap-1">
                    <RefreshCw size={10} /> Retry
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────
export default function InstalmentsPage() {
  const queryClient = useQueryClient();
  const [showCreator, setShowCreator] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState('');

  const { data: plansData, isLoading } = useQuery({
    queryKey: ['instalment-plans'],
    queryFn: () => instalmentApi.list().then(r => r.data),
  });

  const { data: bookingsData } = useQuery({
    queryKey: ['my-bookings-confirmed'],
    queryFn: () => bookingsApi.list({ status: 'CONFIRMED', limit: 50 }).then(r => r.data),
    enabled: showCreator,
  });

  const retryMutation = useMutation({
    mutationFn: ({ planId, paymentId }: { planId: string; paymentId: string }) =>
      instalmentApi.retry(planId, paymentId),
    onSuccess: (res) => {
      if (res.data.authorizationUrl) {
        window.location.href = res.data.authorizationUrl;
      } else {
        toast.success(res.data.message || 'Retry initiated');
        queryClient.invalidateQueries({ queryKey: ['instalment-plans'] });
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Retry failed'),
  });

  const plans = plansData?.plans || [];
  const bookings = bookingsData?.bookings || [];

  // Find confirmed bookings without an active instalment plan
  const eligibleBookings = bookings.filter((b: any) =>
    Number(b.totalAmount) >= 100000 &&
    !plans.some((p: any) => p.bookingId === b.id && ['ACTIVE', 'PAUSED'].includes(p.status))
  );

  const selectedBooking = bookings.find((b: any) => b.id === selectedBookingId);

  // Stats
  const totalCommitted = plans.reduce((s: number, p: any) => s + Number(p.grandTotal), 0);
  const totalPaid = plans.reduce((s: number, p: any) => s + Number(p.amountPaid), 0);
  const activePlans = plans.filter((p: any) => p.status === 'ACTIVE').length;
  const failedPayments = plans.reduce((s: number, p: any) =>
    s + (p.payments?.filter((pmt: any) => pmt.status === 'FAILED').length || 0), 0);

  return (
    <div className="p-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-bold text-lg flex items-center gap-2">
            <CreditCard size={18} className="text-[var(--accent)]" />
            Instalment Plans
          </h1>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Split large event costs over 3 or 6 months · No credit check · Flat service fee
          </p>
        </div>
        <button
          onClick={() => setShowCreator(!showCreator)}
          className="btn-primary text-sm flex items-center gap-1.5">
          <Plus size={14} /> New Plan
        </button>
      </div>

      {/* Stats */}
      {plans.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Active Plans', value: activePlans, color: '#6C2BD9' },
            { label: 'Total Committed', value: formatNGN(totalCommitted, true), color: '#7B61FF' },
            { label: 'Amount Paid', value: formatNGN(totalPaid, true), color: '#059669' },
            { label: 'Failed Payments', value: failedPayments, color: failedPayments > 0 ? '#DC2626' : '#8B82A0' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: s.color }} />
              <div className="stat-label">{s.label}</div>
              <div className="stat-number" style={{ color: s.color, fontSize: 20 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Create plan flow */}
      {showCreator && (
        <div className="mb-6">
          <div className="mb-4">
            <label className="label">Select a confirmed booking to split</label>
            <select className="input text-sm max-w-md"
              value={selectedBookingId}
              onChange={e => setSelectedBookingId(e.target.value)}>
              <option value="">Choose booking…</option>
              {eligibleBookings.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.vendor?.businessName} · {b.reference} · {formatNGN(Number(b.totalAmount), true)}
                </option>
              ))}
            </select>
            {eligibleBookings.length === 0 && bookingsData && (
              <p className="text-xs text-[var(--muted)] mt-2">
                No eligible bookings found. A booking must be confirmed and over ₦100,000 to split.
              </p>
            )}
          </div>

          {selectedBooking && (
            <InstalmentCalculator
              bookingId={selectedBooking.id}
              totalAmount={Number(selectedBooking.totalAmount)}
              bookingRef={selectedBooking.reference}
              vendorName={selectedBooking.vendor?.businessName}
              onCreated={() => {
                queryClient.invalidateQueries({ queryKey: ['instalment-plans'] });
                setShowCreator(false);
              }}
            />
          )}
        </div>
      )}

      {/* How it works (empty state) */}
      {!isLoading && plans.length === 0 && !showCreator && (
        <div className="card p-8 mb-5">
          <div className="max-w-lg mx-auto text-center">
            <div className="w-14 h-14 rounded-2xl bg-[var(--pill)] flex items-center justify-center mx-auto mb-4">
              <CreditCard size={28} className="text-[var(--accent)]" />
            </div>
            <h2 className="font-bold text-xl mb-2">Pay in instalments</h2>
            <p className="text-sm text-[var(--muted)] mb-8 leading-relaxed">
              Split your event costs into manageable monthly payments — no credit check, no interest. Just a small service fee.
            </p>
            <div className="grid grid-cols-3 gap-4 text-left mb-8">
              {[
                { icon: '✅', title: 'No credit check', desc: 'Approval is instant — no score required' },
                { icon: '📅', title: '3 or 6 months', desc: '3.5% or 5% flat service fee' },
                { icon: '🔒', title: 'Card saved securely', desc: 'Auto-charged monthly via Paystack' },
              ].map(f => (
                <div key={f.title} className="bg-[var(--bg)] rounded-xl p-4 border border-[var(--border)]">
                  <div className="text-2xl mb-2">{f.icon}</div>
                  <div className="font-bold text-xs mb-1">{f.title}</div>
                  <div className="text-[11px] text-[var(--muted)]">{f.desc}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowCreator(true)}
              className="btn-primary text-sm px-8 py-3 inline-flex items-center gap-2">
              <Plus size={14} /> Set up a plan
            </button>
          </div>
        </div>
      )}

      {/* Plans list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--muted)]" />
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map((plan: any) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onRetry={(planId, paymentId) => retryMutation.mutate({ planId, paymentId })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
