'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingsApi } from '@/lib/api';
import { formatNGN, formatEventDate, formatTimeAgo } from '@/lib/utils';
import toast from 'react-hot-toast';
import { CheckCircle, XCircle, FileText, FileSignature, MessageSquare, ChevronDown, Loader2 } from 'lucide-react';

const STATUS_TABS = ['ALL', 'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];

export default function VendorBookingsPage() {
  const [activeTab, setActiveTab] = useState('ALL');
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-bookings', activeTab],
    queryFn: () => bookingsApi.list({
      status: activeTab === 'ALL' ? undefined : activeTab
    }).then(r => r.data),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => bookingsApi.confirm(id),
    onSuccess: () => {
      toast.success('Booking confirmed!');
      queryClient.invalidateQueries({ queryKey: ['vendor-bookings'] });
      setSelectedBooking(null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      bookingsApi.cancel(id, reason),
    onSuccess: () => {
      toast.success('Booking cancelled');
      queryClient.invalidateQueries({ queryKey: ['vendor-bookings'] });
      setSelectedBooking(null);
    },
  });

  const bookings = data?.bookings || [];

  return (
    <div className="p-6 animate-fade-up">
      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-white border border-[var(--border)] rounded-lg p-1 w-fit">
        {STATUS_TABS.map(tab => (
          <button key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === tab
                ? 'bg-[var(--dark)] text-white'
                : 'text-[var(--muted)] hover:text-[var(--dark)]'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-5">
        {/* Bookings list */}
        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-[var(--muted)]" />
            </div>
          ) : bookings.length === 0 ? (
            <div className="text-center py-12 text-sm text-[var(--muted)]">
              No {activeTab !== 'ALL' ? activeTab.toLowerCase() : ''} bookings found
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="table-header">Event Details</th>
                  <th className="table-header">Date</th>
                  <th className="table-header">Amount</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b: any) => (
                  <tr key={b.id}
                    className={`table-row cursor-pointer ${selectedBooking?.id === b.id ? 'bg-[var(--pill)]' : ''}`}
                    onClick={() => setSelectedBooking(b)}>
                    <td className="table-cell">
                      <div className="font-semibold text-sm truncate max-w-[200px]">
                        {b.eventDescription || 'Event booking'}
                      </div>
                      <div className="text-xs text-[var(--muted)] font-mono">{b.reference}</div>
                    </td>
                    <td className="table-cell text-sm">{formatEventDate(b.eventDate)}</td>
                    <td className="table-cell font-semibold text-sm">{formatNGN(b.totalAmount)}</td>
                    <td className="table-cell">
                      <span className="text-xs bg-[var(--bg)] border border-[var(--border)] px-2 py-0.5 rounded-full">
                        {b.bookingType}
                      </span>
                    </td>
                    <td className="table-cell">
                      <StatusPill status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        <div>
          {selectedBooking ? (
            <BookingDetail
              booking={selectedBooking}
              onConfirm={() => confirmMutation.mutate(selectedBooking.id)}
              onCancel={(reason: string) => cancelMutation.mutate({ id: selectedBooking.id, reason })}
              onQuote={() => setShowQuoteModal(true)}
              isConfirming={confirmMutation.isPending}
              isCancelling={cancelMutation.isPending}
            />
          ) : (
            <div className="card p-8 text-center text-sm text-[var(--muted)]">
              <FileText size={32} className="mx-auto mb-3 text-[var(--border)]" />
              Select a booking to view details
            </div>
          )}
        </div>
      </div>

      {showQuoteModal && selectedBooking && (
        <QuoteModal
          booking={selectedBooking}
          onClose={() => setShowQuoteModal(false)}
          onSubmit={() => {
            setShowQuoteModal(false);
            queryClient.invalidateQueries({ queryKey: ['vendor-bookings'] });
            toast.success('Quote sent to client!');
          }}
        />
      )}
    </div>
  );
}

function BookingDetail({ booking, onConfirm, onCancel, onQuote, isConfirming, isCancelling }: any) {
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="font-bold text-sm text-[var(--dark)] mb-1">Booking Details</div>
        <div className="text-xs font-mono text-[var(--muted)]">{booking.reference}</div>
      </div>
      <div className="p-5 space-y-3">
        <Row label="Event Date" value={formatEventDate(booking.eventDate)} />
        <Row label="Guest Count" value={booking.guestCount ? `${booking.guestCount} guests` : '—'} />
        <Row label="Total Amount" value={formatNGN(booking.totalAmount)} bold />
        <Row label="Your Payout" value={formatNGN(booking.vendorAmount)} bold accent />
        <Row label="Deposit Paid" value={booking.depositPaidAt ? '✓ Paid' : 'Pending'} />
        <Row label="Booking Type" value={booking.bookingType} />
        <Row label="Status" value={<StatusPill status={booking.status} />} />
        {booking.notes && (
          <div>
            <div className="text-xs text-[var(--muted)] mb-1">Client Notes</div>
            <div className="text-sm bg-[var(--bg)] rounded-lg p-3 leading-relaxed">{booking.notes}</div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 py-4 border-t border-[var(--border)] space-y-2">
        {booking.status === 'PENDING' && booking.bookingType === 'INSTANT' && (
          <button
            onClick={onConfirm}
            disabled={isConfirming}
            className="btn-primary w-full flex items-center justify-center gap-2">
            {isConfirming ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Confirm Booking
          </button>
        )}
        {booking.status === 'PENDING' && booking.bookingType === 'RFQ' && (
          <button onClick={onQuote} className="btn-accent w-full flex items-center justify-center gap-2">
            <FileText size={14} /> Submit Quote
          </button>
        )}
        <button className="btn-secondary w-full flex items-center justify-center gap-2">
          <MessageSquare size={14} /> Message Client
        </button>
        {booking.status === 'CONFIRMED' && (
          <a href={`/dashboard/contracts/new?bookingId=${booking.id}`}
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
            <FileSignature size={14} /> Generate Contract
          </a>
        )}
        {booking.status !== 'CANCELLED' && booking.status !== 'COMPLETED' && (
          showCancel ? (
            <div className="space-y-2">
              <textarea
                className="input text-xs min-h-[60px] resize-none"
                placeholder="Reason for cancellation..."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={() => setShowCancel(false)} className="btn-secondary flex-1 text-xs">
                  Back
                </button>
                <button
                  onClick={() => onCancel(cancelReason)}
                  disabled={!cancelReason || isCancelling}
                  className="btn-danger flex-1 text-xs flex items-center justify-center gap-1">
                  {isCancelling ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                  Cancel Booking
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowCancel(true)}
              className="w-full text-xs text-[var(--danger)] hover:underline py-1">
              Cancel this booking
            </button>
          )
        )}
      </div>
    </div>
  );
}

function QuoteModal({ booking, onClose, onSubmit }: any) {
  const [lines, setLines] = useState([{ description: '', amount: 0 }]);
  const [notes, setNotes] = useState('');
  const [validDays, setValidDays] = useState(7);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const total = lines.reduce((s, l) => s + Number(l.amount), 0);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + validDays);
      await bookingsApi.submitQuote(booking.id, {
        lineItems: lines,
        totalAmount: total,
        validUntil: validUntil.toISOString(),
        notes,
      });
      onSubmit();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-lg animate-fade-up">
        <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
          <h2 className="font-bold text-lg">Submit Quote</h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--dark)] text-lg px-2">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <div className="label mb-2">Line Items</div>
            {lines.map((line, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input className="input flex-1 text-sm" placeholder="Description"
                  value={line.description}
                  onChange={e => setLines(prev => prev.map((l, idx) => idx === i ? { ...l, description: e.target.value } : l))} />
                <input type="number" className="input w-32 text-sm" placeholder="₦ Amount"
                  value={line.amount}
                  onChange={e => setLines(prev => prev.map((l, idx) => idx === i ? { ...l, amount: Number(e.target.value) } : l))} />
                {lines.length > 1 && (
                  <button onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))}
                    className="text-[var(--muted)] hover:text-[var(--danger)] px-1">✕</button>
                )}
              </div>
            ))}
            <button onClick={() => setLines(prev => [...prev, { description: '', amount: 0 }])}
              className="text-xs text-[var(--accent)] font-semibold hover:underline">
              + Add line item
            </button>
          </div>
          <div className="flex items-center justify-between py-3 border-t border-[var(--border)]">
            <span className="font-bold">Total</span>
            <span className="font-bold text-lg text-[var(--accent)]">{formatNGN(total)}</span>
          </div>
          <div className="fg">
            <label className="label">Notes</label>
            <textarea className="input text-sm min-h-[60px] resize-none" placeholder="Terms, inclusions, requirements..."
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="fg">
            <label className="label">Quote valid for</label>
            <select className="input text-sm" value={validDays} onChange={e => setValidDays(Number(e.target.value))}>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t border-[var(--border)]">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSubmit} disabled={isSubmitting || total === 0}
            className="btn-primary flex-1 flex items-center justify-center gap-2">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            Send Quote
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, accent }: any) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <span className={`text-sm ${bold ? 'font-bold' : ''} ${accent ? 'text-[var(--accent)]' : 'text-[var(--dark)]'}`}>
        {value}
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: 'badge-pending', CONFIRMED: 'badge-confirmed',
    COMPLETED: 'badge-live', CANCELLED: 'badge-cancelled',
  };
  return <span className={map[status] || 'badge-draft'}>{status}</span>;
}
