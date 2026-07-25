'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { experiencesApi, type Experience, type ExperienceSlotInstance, type ExperienceBooking } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

// ─── C3 INVARIANT: publication gate ─────────────────
// Only experiences where isApproved && isActive are returned by the public listing endpoint.
// This component does not re-enforce the gate — the API is the authority.

const EXP_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

function formatMoney(value: string | number | undefined, currency = 'NGN') {
  const amount = Number(value ?? 0);
  return `${currency} ${amount.toLocaleString('en-NG')}`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-NG', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
  };
}

function slotsAvailable(slot: ExperienceSlotInstance): number {
  return Math.max(0, slot.capacity - slot.bookedCount);
}

// ─── BOOKING RESULT STATE ────────────────────────────
type BookingResult = {
  bookingId: string;
  reference: string;
  authorizationUrl: string | null;
};

// ─── RETURNING BOOKING STATE (post-payment callback) ─
type ReturningBooking = {
  booking: ExperienceBooking;
  meetingDetails: string | null;
};

export default function ExperiencesBookingClient() {
  // ─── C3-a: Discovery state ───────────────────────
  const [city, setCity] = useState('');
  const [type, setType] = useState('');
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── C3-b: Slot selection state ──────────────────
  const [selected, setSelected] = useState<Experience | null>(null);
  const [slots, setSlots] = useState<ExperienceSlotInstance[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<ExperienceSlotInstance | null>(null);
  const [guestCount, setGuestCount] = useState(1);
  const [specialRequests, setSpecialRequests] = useState('');

  // ─── C3-c: Booking + payment state ───────────────
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);

  // ─── C3-d: Returning booking state ───────────────
  const [returningBookingId, setReturningBookingId] = useState<string | null>(null);
  const [returningBooking, setReturningBooking] = useState<ReturningBooking | null>(null);
  const [returningLoading, setReturningLoading] = useState(false);
  const [returningError, setReturningError] = useState<string | null>(null);

  // ─── On mount: check for ?booking= query param ───
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get('booking');
    if (bookingId) {
      setReturningBookingId(bookingId);
      handleReturningBooking(bookingId);
    }
  }, []);

  // ─── C3-d: Verify payment and load booking ───────
  const handleReturningBooking = useCallback(async (bookingId: string) => {
    setReturningLoading(true);
    setReturningError(null);
    try {
      // First attempt to verify (triggers Paystack verification)
      const verifyRes = await experiencesApi.verifyBooking(bookingId);
      const booking: ExperienceBooking = verifyRes.data?.data ?? verifyRes.data;
      const meetingDetails = booking.experience?.meetingDetails ?? null;
      setReturningBooking({ booking, meetingDetails });
    } catch (err: any) {
      // If verify returns 402 (payment not yet confirmed), fall back to GET
      if (err?.response?.status === 402) {
        try {
          const getRes = await experiencesApi.getBooking(bookingId);
          const booking: ExperienceBooking = getRes.data?.data ?? getRes.data;
          setReturningBooking({ booking, meetingDetails: null });
        } catch {
          setReturningError('Unable to load booking details. Please check your bookings page.');
        }
      } else if (err?.response?.status === 403) {
        setReturningError('Please log in to view this booking.');
      } else {
        setReturningError('Unable to load booking details. Please try again.');
      }
    } finally {
      setReturningLoading(false);
    }
  }, []);

  // ─── C3-a: Search experiences ────────────────────
  const handleSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(null);
    setSlots([]);
    setSelectedSlot(null);
    setBookingResult(null);
    try {
      const params: Record<string, string | number | undefined> = {};
      if (city.trim()) params.city = city.trim();
      if (type.trim()) params.type = type.trim();
      const res = await experiencesApi.list(params);
      const data = res.data?.data ?? res.data;
      setExperiences(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to load experiences. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [city, type]);

  useEffect(() => {
    handleSearch();
  }, []);

  // ─── G-4(i): Restore slot selection from URL after slots load ───────────────
  useEffect(() => {
    if (pendingSlotId && slots.length > 0) {
      const slot = slots.find((s) => s.id === pendingSlotId);
      if (slot) {
        setSelectedSlot(slot);
        setPendingSlotId(null);
      }
    }
  }, [slots, pendingSlotId]);

  // ─── C3-b: Load slots for selected experience ────
  const handleSelectExperience = useCallback(async (exp: Experience) => {
    setSelected(exp);
    setSlots([]);
    setSelectedSlot(null);
    setBookingResult(null);
    setSlotsLoading(true);
    try {
      const res = await experiencesApi.getSlots(exp.id);
      const data = res.data?.data ?? res.data;
      const slotList: ExperienceSlotInstance[] = Array.isArray(data) ? data : [];
      // Filter to future, active slots with availability
      const now = new Date();
      const available = slotList.filter(
        (s) => s.isActive && new Date(s.startTime) > now && slotsAvailable(s) > 0
      );
      setSlots(available);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  // ─── C3-c: Create booking + Paystack handoff ─────
  const handleBook = useCallback(async () => {
    if (!selectedSlot) return;
    // G-2: Validate guest fields when unauthenticated
    if (!isAuthenticated) {
      if (!guestName.trim()) { setError('Please enter your name.'); return; }
      if (!guestEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
        setError('Please enter a valid email address.'); return;
      }
    }
    setBookingLoading(true);
    setError(null);
    try {
      const payload: Parameters<typeof experiencesApi.createBooking>[0] = {
        slotId: selectedSlot.id,
        guestCount,
        specialRequests: specialRequests.trim() || undefined,
      };
      // G-2: Add guest PII for unauthenticated callers
      if (!isAuthenticated) {
        payload.guestName = guestName.trim();
        payload.guestEmail = guestEmail.trim().toLowerCase();
        if (guestPhone.trim()) payload.guestPhone = guestPhone.trim();
      }
      const res = await experiencesApi.createBooking(payload);
      const data = res.data;
      const booking = data?.data;
      const payment = data?.payment;

      if (payment?.authorizationUrl) {
        // Paystack redirect — standard handoff
        window.location.href = payment.authorizationUrl;
        return;
      }

      // Paystack init failed but booking was persisted (matches Stays precedent)
      setBookingResult({
        bookingId: booking?.id ?? '',
        reference: booking?.reference ?? '',
        authorizationUrl: null,
      });
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error;
      if (status === 409) {
        setError(msg ?? 'This slot is no longer available. Please choose another time.');
      } else if (status === 401) {
        // E-3 / G-4(i): redirect to login with ?exp= and ?slot= preserved for restoration
        const expParam = selected ? `&exp=${selected.id}` : '';
        const slotParam = selectedSlot ? `&slot=${selectedSlot.id}` : '';
        window.location.href = `/login?redirect=${encodeURIComponent(`/experiences?${expParam.slice(1)}${slotParam}`)}`;
        return;
      } else {
        setError(msg ?? 'Booking failed. Please try again.');
      }
    } finally {
      setBookingLoading(false);
    }
  }, [selectedSlot, guestCount, specialRequests]);

  const totalAmount = useMemo(() => {
    if (!selected || !selectedSlot) return 0;
    return Number(selected.pricePerPerson) * guestCount;
  }, [selected, selectedSlot, guestCount]);

  // ─── RETURNING BOOKING VIEW ──────────────────────
  if (returningBookingId) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            {returningLoading && (
              <div className="text-center py-8">
                <div className="animate-spin h-8 w-8 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-gray-600">Verifying your payment…</p>
              </div>
            )}
            {returningError && (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">⚠️</div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Unable to load booking</h2>
                <p className="text-gray-600 mb-6">{returningError}</p>
                <a href="/experiences" className="text-green-700 underline">Browse experiences</a>
              </div>
            )}
            {returningBooking && !returningLoading && (
              <div>
                {returningBooking.booking.paymentStatus === 'PAID' ? (
                  <>
                    <div className="text-center mb-6">
                      <div className="text-5xl mb-3">🎟</div>
                      <h2 className="text-2xl font-bold text-gray-900">Booking Confirmed!</h2>
                      <p className="text-gray-600 mt-1">Your experience is booked. See you there!</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-5 mb-4 space-y-2 text-sm">
                      <p><span className="font-semibold">Experience:</span> {returningBooking.booking.experience?.name}</p>
                      {returningBooking.booking.slot && (
                        <>
                          <p><span className="font-semibold">Date:</span> {formatDateTime(returningBooking.booking.slot.startTime).date}</p>
                          <p><span className="font-semibold">Time:</span> {formatDateTime(returningBooking.booking.slot.startTime).time}</p>
                        </>
                      )}
                      <p><span className="font-semibold">Guests:</span> {returningBooking.booking.guestCount}</p>
                      <p><span className="font-semibold">Total paid:</span> {formatMoney(returningBooking.booking.totalAmount, returningBooking.booking.currency)}</p>
                      <p><span className="font-semibold">Reference:</span> {returningBooking.booking.reference}</p>
                    </div>
                    {/* C3-d: meetingDetails disclosure — only when PAID */}
                    {returningBooking.meetingDetails && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-4">
                        <h3 className="font-semibold text-amber-900 mb-2">📍 Meeting Details</h3>
                        <p className="text-amber-800 text-sm whitespace-pre-wrap">{returningBooking.meetingDetails}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-center mb-6">
                      <div className="text-5xl mb-3">⏳</div>
                      <h2 className="text-2xl font-bold text-gray-900">Payment Pending</h2>
                      <p className="text-gray-600 mt-1">Your booking has been created but payment has not been confirmed yet.</p>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-5 mb-4 space-y-2 text-sm">
                      <p><span className="font-semibold">Reference:</span> {returningBooking.booking.reference}</p>
                      <p><span className="font-semibold">Status:</span> {returningBooking.booking.paymentStatus}</p>
                    </div>
                    <p className="text-gray-500 text-sm text-center">Meeting details will be shared once payment is confirmed.</p>
                  </>
                )}
                <div className="text-center mt-6">
                  <a href="/experiences" className="text-green-700 underline text-sm">Browse more experiences</a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── BOOKING RESULT VIEW (Paystack init failed) ──
  if (bookingResult) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="text-5xl mb-4">🎟</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Booking Created</h2>
            <p className="text-gray-600 mb-4">
              Your booking has been created but payment could not be initialised automatically.
            </p>
            <div className="bg-gray-50 rounded-xl p-4 text-sm text-left mb-6">
              <p><span className="font-semibold">Reference:</span> {bookingResult.reference}</p>
            </div>
            <p className="text-gray-500 text-sm">Please contact support with your reference to complete payment.</p>
            <button
              onClick={() => { setBookingResult(null); setSelected(null); }}
              className="mt-6 text-green-700 underline text-sm"
            >
              Browse more experiences
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── SLOT SELECTION + BOOKING FORM ───────────────
  if (selected) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => { setSelected(null); setSlots([]); setSelectedSlot(null); setError(null); }}
            className="text-green-700 underline text-sm mb-6 block"
          >
            ← Back to experiences
          </button>
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {selected.coverImageUrl && (
              <img src={selected.coverImageUrl} alt={selected.name} className="w-full h-56 object-cover" />
            )}
            <div className="p-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">{selected.name}</h1>
              <p className="text-gray-500 text-sm mb-2">{selected.city} · {selected.type}</p>
              <p className="text-green-700 font-semibold text-lg mb-4">
                {formatMoney(selected.pricePerPerson, selected.currency)} per person
              </p>
              <p className="text-gray-700 mb-6">{selected.description}</p>

              {/* C3-b: Slot selection */}
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Choose a date & time</h2>
              {slotsLoading ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
                  <div className="animate-spin h-4 w-4 border-2 border-green-600 border-t-transparent rounded-full" />
                  Loading available slots…
                </div>
              ) : slots.length === 0 ? (
                <p className="text-gray-500 text-sm py-4">No available slots at this time. Check back soon.</p>
              ) : (
                <div className="space-y-2 mb-6">
                  {slots.map((slot) => {
                    const { date, time } = formatDateTime(slot.startTime);
                    const available = slotsAvailable(slot);
                    const isSelected = selectedSlot?.id === slot.id;
                    return (
                      <button
                        key={slot.id}
                        onClick={() => setSelectedSlot(slot)}
                        className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                          isSelected
                            ? 'border-green-600 bg-green-50'
                            : 'border-gray-200 hover:border-green-400 bg-white'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-medium text-gray-900">{date}</span>
                            <span className="text-gray-500 ml-2 text-sm">at {time}</span>
                          </div>
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            available <= 3
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {available} spot{available !== 1 ? 's' : ''} left
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Guest count + special requests */}
              {selectedSlot && (
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Number of guests</label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
                        className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center text-lg font-bold text-gray-700 hover:bg-gray-100"
                      >−</button>
                      <span className="text-xl font-semibold w-8 text-center">{guestCount}</span>
                      <button
                        onClick={() => setGuestCount(Math.min(slotsAvailable(selectedSlot), guestCount + 1))}
                        className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center text-lg font-bold text-gray-700 hover:bg-gray-100"
                      >+</button>
                    </div>
                    {selected.minGroupSize && guestCount < selected.minGroupSize && (
                      <p className="text-amber-600 text-xs mt-1">Minimum group size: {selected.minGroupSize}</p>
                    )}
                    {selected.maxGroupSize && guestCount > selected.maxGroupSize && (
                      <p className="text-red-600 text-xs mt-1">Maximum group size: {selected.maxGroupSize}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Special requests (optional)</label>
                    <textarea
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                      rows={3}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Any dietary requirements, accessibility needs, or questions?"
                    />
                  </div>
                </div>
              )}

              {/* Booking summary + CTA */}
              {selectedSlot && (
                <div className="bg-green-50 rounded-xl p-4 mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{formatMoney(selected.pricePerPerson, selected.currency)} × {guestCount} guest{guestCount !== 1 ? 's' : ''}</span>
                    <span className="font-semibold text-gray-900">{formatMoney(totalAmount, selected.currency)}</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-red-700 text-sm">{error}</div>
              )}

              <button
                onClick={handleBook}
                disabled={!selectedSlot || bookingLoading || (!!selected.minGroupSize && guestCount < selected.minGroupSize)}
                className="w-full bg-green-700 hover:bg-green-800 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {bookingLoading ? 'Creating booking…' : selectedSlot ? `Book & Pay ${formatMoney(totalAmount, selected.currency)}` : 'Select a slot to continue'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── C3-a: Discovery view ────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Experiences</h1>
          <p className="text-gray-600 text-lg">Discover curated experiences — cooking classes, cultural tours, art workshops and more.</p>
        </div>

        {/* Search bar */}
        <div className="bg-white rounded-2xl shadow p-4 mb-8 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City (e.g. Lagos, Abuja)"
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All types</option>
            <option value="COOKING_CLASS">Cooking Class</option>
            <option value="CULTURAL_TOUR">Cultural Tour</option>
            <option value="ART_WORKSHOP">Art Workshop</option>
            <option value="MUSIC_EXPERIENCE">Music Experience</option>
            <option value="FOOD_TOUR">Food Tour</option>
            <option value="OUTDOOR_ADVENTURE">Outdoor Adventure</option>
            <option value="WELLNESS">Wellness</option>
            <option value="OTHER">Other</option>
          </select>
          <button
            onClick={handleSearch}
            className="bg-green-700 hover:bg-green-800 text-white font-semibold px-6 py-2 rounded-xl transition-colors"
          >
            Search
          </button>
        </div>

        {loading && (
          <div className="text-center py-16">
            <div className="animate-spin h-10 w-10 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500">Loading experiences…</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-6">{error}</div>
        )}

        {!loading && experiences.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <div className="text-5xl mb-4">🎭</div>
            <p className="text-lg font-medium">No experiences found</p>
            <p className="text-sm mt-1">Try adjusting your search or check back soon.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {experiences.map((exp) => (
            <button
              key={exp.id}
              onClick={() => handleSelectExperience(exp)}
              className="bg-white rounded-2xl shadow hover:shadow-md transition-shadow text-left overflow-hidden group"
            >
              {exp.coverImageUrl ? (
                <img
                  src={exp.coverImageUrl}
                  alt={exp.name}
                  className="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-44 bg-green-100 flex items-center justify-center text-4xl">🎟</div>
              )}
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">{exp.name}</h3>
                <p className="text-gray-500 text-xs mb-2">{exp.city} · {exp.type?.replace(/_/g, ' ')}</p>
                <p className="text-green-700 font-semibold text-sm">
                  {formatMoney(exp.pricePerPerson, exp.currency)} <span className="text-gray-400 font-normal">/ person</span>
                </p>
                {exp.durationMinutes && (
                  <p className="text-gray-400 text-xs mt-1">{exp.durationMinutes} min</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
