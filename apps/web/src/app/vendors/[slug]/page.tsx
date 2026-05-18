'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { vendorsApi, bookingsApi } from '@/lib/api';
import { formatNGN, VENDOR_CATEGORY_LABELS, VENDOR_CATEGORY_EMOJIS, formatDate } from '@/lib/utils';
import { useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';
import { Star, MapPin, Zap, CheckCircle, MessageSquare, Calendar, Shield } from 'lucide-react';

export default function VendorProfilePage() {
  const params = useParams();
  const slug = params.slug as string;
  const [selectedDate, setSelectedDate] = useState('');
  const { user } = useAuthStore();
  const [showBookModal, setShowBookModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-public', slug],
    queryFn: () => vendorsApi.getProfile(slug).then(r => r.data),
  });

  const vendor = data?.vendor;

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-5 py-12">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-4">
            <div className="h-8 bg-[var(--border)] rounded animate-pulse" />
            <div className="h-4 bg-[var(--border)] rounded w-1/2 animate-pulse" />
            <div className="h-64 bg-[var(--border)] rounded-xl animate-pulse" />
          </div>
          <div className="h-96 bg-[var(--border)] rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="max-w-5xl mx-auto px-5 py-20 text-center">
        <div className="text-4xl mb-3">🔍</div>
        <h1 className="font-bold text-xl mb-2">Vendor not found</h1>
        <Link href="/vendors" className="text-[var(--accent)] hover:underline">← Back to vendors</Link>
      </div>
    );
  }

  const mainPhoto = vendor.portfolioItems?.find((p: any) => p.isMain) || vendor.portfolioItems?.[0];

  return (
    <div className="max-w-5xl mx-auto px-5 py-8">
      <div className="grid grid-cols-[1fr_320px] gap-6">
        {/* Left */}
        <div>
          {/* Header */}
          <div className="mb-5">
            <div className="text-sm text-[var(--muted)] mb-1">
              {VENDOR_CATEGORY_EMOJIS[vendor.category]} {VENDOR_CATEGORY_LABELS[vendor.category]}
            </div>
            <h1 className="font-bold text-2xl text-[var(--dark)] mb-2">{vendor.businessName}</h1>
            <div className="flex items-center gap-4 text-sm text-[var(--muted)]">
              <div className="flex items-center gap-1">
                <Star size={14} className="text-yellow-400 fill-yellow-400" />
                <span className="font-semibold text-[var(--dark)]">{Number(vendor.rating).toFixed(1)}</span>
                <span>({vendor.reviewCount} reviews)</span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin size={13} /> {vendor.city}, Nigeria
              </div>
              {vendor.isInstantBook && (
                <div className="flex items-center gap-1 text-[var(--accent)] font-semibold">
                  <Zap size={13} /> Instant Book
                </div>
              )}
            </div>
          </div>

          {/* Main photo */}
          {mainPhoto ? (
            <div className="rounded-2xl overflow-hidden aspect-[16/9] mb-4">
              <img src={mainPhoto.url} alt={vendor.businessName} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="rounded-2xl bg-[var(--bg)] aspect-[16/9] mb-4 flex items-center justify-center text-6xl border border-[var(--border)]">
              {VENDOR_CATEGORY_EMOJIS[vendor.category]}
            </div>
          )}

          {/* Portfolio grid */}
          {vendor.portfolioItems?.length > 1 && (
            <div className="grid grid-cols-4 gap-2 mb-6">
              {vendor.portfolioItems.slice(1, 5).map((p: any) => (
                <div key={p.id} className="aspect-square rounded-xl overflow-hidden bg-[var(--bg)]">
                  <img src={p.url} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}

          {/* About */}
          <div className="card p-5 mb-4">
            <h2 className="font-bold text-base mb-3">About {vendor.businessName}</h2>
            <p className="text-sm text-[var(--mid)] leading-relaxed">
              {vendor.description || vendor.shortBio || 'Professional event vendor based in Lagos, Nigeria.'}
            </p>
          </div>

          {/* Tags (AC-2) */}
          {vendor.tags?.length > 0 && (
            <div className="card p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-base">Service Tags</h2>
                {/* AC-2: Edit affordance for vendor's own view */}
                {user?.role === 'VENDOR' && (
                  <Link href="/vendor/settings?tab=tags" className="text-xs text-[var(--accent)] hover:underline">Edit tags →</Link>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {vendor.tags.map((tag: any) => (
                  /* AC-2: Tag chips clickable; navigates to /vendors?tags=<tag> */
                  <Link
                    key={tag.id}
                    href={`/vendors?tags=${encodeURIComponent(tag.label)}`}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors cursor-pointer"
                  >
                    🏷 {tag.label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Packages */}
          {vendor.packages?.length > 0 && (
            <div className="card p-5 mb-4">
              <h2 className="font-bold text-base mb-4">Packages</h2>
              <div className="space-y-3">
                {vendor.packages.map((pkg: any) => (
                  <div key={pkg.id} className="flex items-start justify-between p-4 bg-[var(--bg)] rounded-xl border border-[var(--border)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                    onClick={() => setShowBookModal(true)}>
                    <div className="flex-1">
                      <div className="font-semibold text-sm mb-1">{pkg.name}</div>
                      {pkg.description && <div className="text-xs text-[var(--muted)] mb-2">{pkg.description}</div>}
                      {pkg.includes?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {pkg.includes.map((inc: string) => (
                            <span key={inc} className="text-[10px] bg-white border border-[var(--border)] px-2 py-0.5 rounded-full">{inc}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="font-bold text-[var(--accent)] ml-4 whitespace-nowrap">
                      {formatNGN(pkg.price)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reviews */}
          {vendor.reviews?.length > 0 && (
            <div className="card p-5">
              <h2 className="font-bold text-base mb-4">
                Reviews ({vendor.reviewCount})
              </h2>
              <div className="space-y-4">
                {vendor.reviews.map((r: any) => (
                  <div key={r.id} className="pb-4 border-b border-[var(--border)] last:border-0">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={13} className={i < r.rating ? 'text-yellow-400 fill-yellow-400' : 'text-[var(--border)]'} />
                        ))}
                      </div>
                      <span className="text-xs text-[var(--muted)]">{r.booking?.eventDate ? formatDate(r.booking.eventDate, 'MMM yyyy') : ''}</span>
                      <div className="ml-auto">
                        <div className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">Verified Booking</div>
                      </div>
                    </div>
                    {r.title && <div className="font-semibold text-sm mb-1">{r.title}</div>}
                    {r.body && <div className="text-sm text-[var(--mid)] leading-relaxed">{r.body}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Booking panel */}
        <div className="sticky top-20">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs text-[var(--muted)]">Starting from</div>
                <div className="font-bold text-2xl text-[var(--accent)]">{formatNGN(vendor.minPrice, true)}</div>
              </div>
              {vendor.isInstantBook && (
                <div className="flex items-center gap-1 text-xs font-bold text-[var(--accent)] bg-[var(--pill)] px-2.5 py-1 rounded-full">
                  <Zap size={11} /> Instant
                </div>
              )}
            </div>

            <div className="mb-3">
              <label className="label">Event Date</label>
              <input type="date" className="input text-sm" value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]} />
            </div>

            <button
              onClick={() => setShowBookModal(true)}
              className="btn-accent w-full py-3 flex items-center justify-center gap-2 font-semibold">
              {vendor.isInstantBook ? (
                <><Zap size={15} /> Book Instantly</>
              ) : (
                <><MessageSquare size={15} /> Request Quote</>
              )}
            </button>

            <div className="mt-4 space-y-2 text-xs text-[var(--muted)]">
              <div className="flex items-center gap-2">
                <Shield size={12} className="text-[var(--accent)]" /> Secure payment via Paystack
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle size={12} className="text-[var(--accent)]" /> 30% deposit, balance after event
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={12} className="text-[var(--accent)]" /> Free cancellation policy
              </div>
            </div>
          </div>

          {/* Vendor stats */}
          <div className="card p-4 mt-3">
            <div className="grid grid-cols-3 text-center divide-x divide-[var(--border)]">
              <div className="px-2">
                <div className="font-bold text-sm">{vendor.bookingCount}+</div>
                <div className="text-[10px] text-[var(--muted)]">Bookings</div>
              </div>
              <div className="px-2">
                <div className="font-bold text-sm">{Number(vendor.rating).toFixed(1)}</div>
                <div className="text-[10px] text-[var(--muted)]">Rating</div>
              </div>
              <div className="px-2">
                <div className="font-bold text-sm">{vendor.serviceRadius}km</div>
                <div className="text-[10px] text-[var(--muted)]">Radius</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showBookModal && (
        <BookModal
          vendor={vendor}
          defaultDate={selectedDate}
          onClose={() => setShowBookModal(false)}
        />
      )}
    </div>
  );
}

function BookModal({ vendor, defaultDate, onClose }: any) {
  const [form, setForm] = useState({
    eventDate: defaultDate, eventDescription: '', guestCount: 100,
    totalAmount: Number(vendor.minPrice) || 0, notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (vendor.isInstantBook) {
        const res = await bookingsApi.createInstant({
          vendorId: vendor.id,
          ...form,
          bookerEmail: 'user@email.com',
        });
        window.location.href = res.data.payment.authorizationUrl;
      } else {
        await bookingsApi.createRfq({ vendorId: vendor.id, ...form });
        toast.success('Quote request sent! The vendor will respond within 24h.');
        onClose();
      }
    } finally { setIsSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-lg animate-fade-up">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h2 className="font-bold text-base">
            {vendor.isInstantBook ? 'Book Now' : 'Request Quote'} — {vendor.businessName}
          </h2>
          <button onClick={onClose} className="text-[var(--muted)] text-lg px-2">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Event Date *</label>
              <input type="date" className="input text-sm" required value={form.eventDate}
                onChange={e => setForm(p => ({ ...p, eventDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">Guest Count</label>
              <input type="number" className="input text-sm" value={form.guestCount}
                onChange={e => setForm(p => ({ ...p, guestCount: Number(e.target.value) }))} />
            </div>
          </div>
          <div>
            <label className="label">Event Description *</label>
            <textarea className="input text-sm min-h-[70px] resize-none" required value={form.eventDescription}
              onChange={e => setForm(p => ({ ...p, eventDescription: e.target.value }))}
              placeholder="Tell the vendor about your event..." />
          </div>
          {vendor.isInstantBook && (
            <div>
              <label className="label">Total Amount (₦)</label>
              <input type="number" className="input text-sm" value={form.totalAmount}
                onChange={e => setForm(p => ({ ...p, totalAmount: Number(e.target.value) }))} />
            </div>
          )}
          <div>
            <label className="label">Additional Notes</label>
            <input className="input text-sm" value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Any special requirements..." />
          </div>
          {vendor.isInstantBook && (
            <div className="bg-[var(--pill)] rounded-lg p-3 text-xs text-[var(--accent)]">
              💰 Deposit: {formatNGN(form.totalAmount * 0.3)} · Balance released after your event
            </div>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={isSubmitting || !form.eventDate || !form.eventDescription}
              className="btn-accent flex-1 flex items-center justify-center gap-2">
              {isSubmitting && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {vendor.isInstantBook ? 'Pay Deposit via Paystack' : 'Send Quote Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
