'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, vendorsApi, bookingsApi } from '@/lib/api';
import { formatNGN } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Loader2, FileText, Building, Camera, Utensils, Sparkles } from 'lucide-react';

const TEMPLATES = [
  {
    id: 'SERVICE_AGREEMENT',
    icon: <FileText size={22} />,
    label: 'Service Agreement',
    desc: 'General-purpose contract for any vendor service',
    color: '#6C2BD9',
  },
  {
    id: 'VENUE_HIRE',
    icon: <Building size={22} />,
    label: 'Venue Hire Agreement',
    desc: 'For venue bookings — capacity, noise, damage clauses',
    color: '#7B61FF',
  },
  {
    id: 'PHOTOGRAPHY',
    icon: <Camera size={22} />,
    label: 'Photography & Video',
    desc: 'Copyright, deliverables, equipment failure terms',
    color: '#C9A227',
  },
  {
    id: 'CATERING',
    icon: <Utensils size={22} />,
    label: 'Catering Agreement',
    desc: 'Menu, quantities, dietary requirements, service standards',
    color: '#059669',
  },
];

type Step = 'template' | 'details' | 'preview';

export default function NewContractPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('template');
  const [form, setForm] = useState({
    templateType: '',
    vendorId: '',
    bookingId: '',
    title: '',
    totalAmount: '',
    eventDate: '',
    eventVenue: '',
    guestCount: '',
    eventDescription: '',
    customClauses: '',
    expiresInDays: '30',
  });
  const [preview, setPreview] = useState('');
  const [generating, setGenerating] = useState(false);

  const { data: vendorsData } = useQuery({
    queryKey: ['vendors-for-contract'],
    queryFn: () => vendorsApi.search({ city: 'Lagos', limit: 50 }).then(r => r.data),
  });

  const { data: bookingsData } = useQuery({
    queryKey: ['bookings-confirmed'],
    queryFn: () => bookingsApi.list({ status: 'CONFIRMED', limit: 50 }).then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/contracts', data),
    onSuccess: (res) => {
      toast.success('✅ Contract created!');
      router.push(`/dashboard/contracts/${res.data.contract.id}`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create contract'),
  });

  const vendors = vendorsData?.vendors || [];
  const bookings = bookingsData?.bookings || [];

  // Auto-fill from selected booking
  function applyBooking(bookingId: string) {
    const booking = bookings.find((b: any) => b.id === bookingId);
    if (!booking) return;
    setForm(p => ({
      ...p,
      bookingId,
      vendorId: booking.vendor?.id || p.vendorId,
      totalAmount: String(Number(booking.totalAmount)),
      eventDate: booking.eventDate ? new Date(booking.eventDate).toISOString().split('T')[0] : p.eventDate,
      eventDescription: booking.eventDescription || p.eventDescription,
      title: p.title || `Event Services Agreement — ${booking.reference}`,
    }));
  }

  async function generatePreview() {
    if (!form.templateType || !form.vendorId) {
      toast.error('Select a template and vendor first');
      return;
    }
    setGenerating(true);
    try {
      // Preview via local generation — we'll show the full editor
      const vendor = vendors.find((v: any) => v.id === form.vendorId);
      setPreview(`
        <div style="padding:20px; font-family:Georgia,serif; color:#1C1528; line-height:1.7">
          <h2 style="margin-bottom:8px;">${form.title || 'Event Services Agreement'}</h2>
          <p style="color:#8B82A0; font-size:13px; margin-bottom:20px;">Template: ${form.templateType} · Vendor: ${vendor?.businessName || '—'}</p>
          <p>This contract will be generated automatically using the <strong>${form.templateType.replace(/_/g, ' ')}</strong> template 
          with all your event details, payment schedule, and legally-compliant terms for ${vendor?.category || 'vendor services'}.</p>
          <p style="margin-top:16px; color:#8B82A0; font-size:13px;">The full contract will include: scope of services, payment schedule with Paystack escrow terms, 
          cancellation policy, liability limitations, governing law (Nigerian), and signature blocks for both parties.</p>
        </div>
      `);
      setStep('preview');
    } finally {
      setGenerating(false);
    }
  }

  function handleCreate() {
    if (!form.templateType || !form.vendorId || !form.title) {
      toast.error('Please fill in all required fields');
      return;
    }
    createMutation.mutate({
      ...form,
      totalAmount: form.totalAmount ? Number(form.totalAmount) : undefined,
      guestCount: form.guestCount ? Number(form.guestCount) : undefined,
      expiresInDays: Number(form.expiresInDays),
    });
  }

  return (
    <div className="p-6 animate-fade-up max-w-3xl">
      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-6">
        {(['template', 'details', 'preview'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step === s ? 'bg-[var(--dark)] text-white' :
              ['template', 'details', 'preview'].indexOf(step) > i ? 'bg-[var(--accent)] text-white' : 'bg-[var(--border)] text-[var(--muted)]'
            }`}>
              {i + 1}
            </div>
            <span className={`text-sm font-semibold capitalize ${step === s ? 'text-[var(--dark)]' : 'text-[var(--muted)]'}`}>
              {s}
            </span>
            {i < 2 && <div className="w-8 h-px bg-[var(--border)]" />}
          </div>
        ))}
      </div>

      {/* Step 1: Template */}
      {step === 'template' && (
        <div>
          <h2 className="font-bold text-base mb-1">Choose a template</h2>
          <p className="text-sm text-[var(--muted)] mb-5">
            Select the type that best matches your vendor service. All templates are legally reviewed for Nigerian contract law.
          </p>

          {/* From booking shortcut */}
          {bookings.length > 0 && (
            <div className="card p-4 mb-5 bg-[var(--pill)]">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={14} className="text-[var(--accent)]" />
                <span className="text-sm font-bold">Generate from a confirmed booking</span>
              </div>
              <p className="text-xs text-[var(--muted)] mb-3">
                Auto-fills vendor, amount, event date, and description from your booking.
              </p>
              <select className="input text-sm" value={form.bookingId}
                onChange={e => { applyBooking(e.target.value); }}>
                <option value="">Select a confirmed booking...</option>
                {bookings.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.vendor?.businessName} · {b.reference} · {formatNGN(Number(b.totalAmount), true)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {TEMPLATES.map(t => (
              <button key={t.id} onClick={() => setForm(p => ({ ...p, templateType: t.id }))}
                className={`card p-4 text-left transition-all hover:shadow-card ${
                  form.templateType === t.id ? 'border-2 border-[var(--accent)]' : ''
                }`}>
                <div style={{ color: t.color, marginBottom: 8 }}>{t.icon}</div>
                <div className="font-bold text-sm mb-1">{t.label}</div>
                <div className="text-xs text-[var(--muted)] leading-relaxed">{t.desc}</div>
                {form.templateType === t.id && (
                  <div className="mt-2 text-xs font-bold text-[var(--accent)]">✓ Selected</div>
                )}
              </button>
            ))}
          </div>

          <div className="flex justify-end mt-5">
            <button onClick={() => form.templateType && setStep('details')}
              disabled={!form.templateType}
              className="btn-primary text-sm">
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Details */}
      {step === 'details' && (
        <div>
          <h2 className="font-bold text-base mb-1">Contract details</h2>
          <p className="text-sm text-[var(--muted)] mb-5">
            These fill in your contract automatically. Leave blank if not applicable.
          </p>

          <div className="space-y-4">
            <div>
              <label className="label">Contract title *</label>
              <input className="input text-sm" value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Photography Services Agreement — Lagos Wedding 2026" />
            </div>

            <div>
              <label className="label">Vendor *</label>
              <select className="input text-sm" value={form.vendorId}
                onChange={e => setForm(p => ({ ...p, vendorId: e.target.value }))}>
                <option value="">Select vendor...</option>
                {vendors.map((v: any) => (
                  <option key={v.id} value={v.id}>{v.businessName} ({v.category})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Event Date</label>
                <input type="date" className="input text-sm" value={form.eventDate}
                  onChange={e => setForm(p => ({ ...p, eventDate: e.target.value }))} />
              </div>
              <div>
                <label className="label">Expected Guests</label>
                <input type="number" className="input text-sm" value={form.guestCount}
                  onChange={e => setForm(p => ({ ...p, guestCount: e.target.value }))}
                  placeholder="150" />
              </div>
            </div>

            <div>
              <label className="label">Venue / Location</label>
              <input className="input text-sm" value={form.eventVenue}
                onChange={e => setForm(p => ({ ...p, eventVenue: e.target.value }))}
                placeholder="Eko Hotel & Suites, Victoria Island, Lagos" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Total Amount (₦)</label>
                <input type="number" className="input text-sm" value={form.totalAmount}
                  onChange={e => setForm(p => ({ ...p, totalAmount: e.target.value }))}
                  placeholder="500000" />
              </div>
              <div>
                <label className="label">Link to Booking (optional)</label>
                <select className="input text-sm" value={form.bookingId}
                  onChange={e => setForm(p => ({ ...p, bookingId: e.target.value }))}>
                  <option value="">No booking</option>
                  {bookings.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.reference}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Custom clauses (optional)</label>
              <textarea className="input text-sm min-h-[80px] resize-none" value={form.customClauses}
                onChange={e => setForm(p => ({ ...p, customClauses: e.target.value }))}
                placeholder="Any additional terms specific to this agreement..." />
            </div>

            <div>
              <label className="label">Expires in (days)</label>
              <select className="input text-sm" value={form.expiresInDays}
                onChange={e => setForm(p => ({ ...p, expiresInDays: e.target.value }))}>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="60">60 days</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep('template')} className="btn-secondary text-sm">← Back</button>
            <button onClick={generatePreview} disabled={generating || !form.vendorId || !form.title}
              className="btn-primary text-sm flex items-center gap-2">
              {generating && <Loader2 size={13} className="animate-spin" />}
              Preview Contract →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview + Create */}
      {step === 'preview' && (
        <div>
          <h2 className="font-bold text-base mb-1">Preview &amp; Create</h2>
          <p className="text-sm text-[var(--muted)] mb-4">
            Review the contract before creating. Once sent, it locks for editing.
          </p>

          <div className="card p-5 mb-5 border-2 border-[var(--border)] max-h-72 overflow-y-auto"
            dangerouslySetInnerHTML={{ __html: preview }} />

          <div className="card p-4 bg-[var(--pill)] mb-5">
            <div className="text-xs font-bold text-[var(--dark)] mb-2">What happens next</div>
            <div className="space-y-1.5 text-xs text-[var(--muted)]">
              <div className="flex gap-2"><span className="text-[var(--accent)] font-bold">1.</span> Contract created as a <strong>Draft</strong> — you can still edit it</div>
              <div className="flex gap-2"><span className="text-[var(--accent)] font-bold">2.</span> Click <strong>Send</strong> to lock and email unique signing links to both parties</div>
              <div className="flex gap-2"><span className="text-[var(--accent)] font-bold">3.</span> Each party signs via their browser — no account required</div>
              <div className="flex gap-2"><span className="text-[var(--accent)] font-bold">4.</span> Fully executed PDF auto-generated and emailed to both parties</div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep('details')} className="btn-secondary text-sm">← Edit details</button>
            <button onClick={handleCreate} disabled={createMutation.isPending}
              className="btn-accent text-sm flex items-center gap-2 flex-1 justify-center">
              {createMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
              Create Contract
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
