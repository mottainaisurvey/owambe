'use client';

import { useEffect, useMemo, useState } from 'react';
import { staysApi, type StayProperty, type StayPropertyRoom } from '@/lib/api';

type BookingState = {
  property: StayProperty;
  room: StayPropertyRoom;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
  specialRequests: string;
};

type BookingResult = {
  reference?: string;
  authorizationUrl?: string;
  depositAmount?: number;
  balanceAmount?: number;
};

type ReturningBooking = {
  id: string;
  reference: string;
  status: string;
  paymentStatus?: string;
  property?: { name?: string; city?: string; coverImageUrl?: string | null };
  room?: { name?: string; roomType?: string; pricePerNight?: string | number };
  checkInDate: string;
  checkOutDate: string;
  nights?: number;
  guestCount?: number;
  totalAmount?: string | number;
  depositAmount?: string | number;
  currency?: string;
};

type ReturningBookingError = {
  title: string;
  message: string;
  isAuthFailure: boolean;
};

const STAYS_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const todayIso = () => new Date().toISOString().slice(0, 10);

function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatMoney(value: string | number | undefined, currency = 'NGN') {
  const amount = Number(value ?? 0);
  return `${currency} ${amount.toLocaleString('en-NG')}`;
}

function selectedRoomTotal(room: StayPropertyRoom, nights: number): number {
  const effectiveTotal = Number(room.effectiveTotal);
  if (Number.isFinite(effectiveTotal) && effectiveTotal > 0) return effectiveTotal;
  return Number(room.pricePerNight) * nights;
}

function selectedRoomNightlyLabel(room: StayPropertyRoom): number {
  const effectiveRate = Number(room.effectiveRatePerNight);
  if (Number.isFinite(effectiveRate) && effectiveRate > 0) return effectiveRate;
  return Number(room.pricePerNight);
}

function selectedRoomUsesOverrides(room: StayPropertyRoom): boolean {
  return room.rateBreakdown?.some((night) => night.source === 'OVERRIDE') ?? false;
}

export function normalizeStayAvailabilityRooms(payload: unknown): StayPropertyRoom[] {
  const data = (payload as { data?: unknown } | null | undefined)?.data ?? payload;
  if (Array.isArray(data)) return data as StayPropertyRoom[];
  const rooms = (data as { rooms?: unknown } | null | undefined)?.rooms;
  return Array.isArray(rooms) ? (rooms as StayPropertyRoom[]) : [];
}

export default function StaysBookingClient() {
  const [city, setCity] = useState('');
  const [checkInDate, setCheckInDate] = useState(addDaysIso(7));
  const [checkOutDate, setCheckOutDate] = useState(addDaysIso(9));
  const [guestCount, setGuestCount] = useState(2);
  const [properties, setProperties] = useState<StayProperty[]>([]);
  const [selected, setSelected] = useState<BookingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [returningBooking, setReturningBooking] = useState<ReturningBooking | null>(null);
  const [returningBookingId, setReturningBookingId] = useState<string | null>(null);
  const [returningBookingError, setReturningBookingError] = useState<ReturningBookingError | null>(null);
  const [returningBookingLoading, setReturningBookingLoading] = useState(false);

  const nights = useMemo(() => {
    const start = new Date(`${checkInDate}T00:00:00Z`);
    const end = new Date(`${checkOutDate}T00:00:00Z`);
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Number.isFinite(diff) && diff > 0 ? diff : 0;
  }, [checkInDate, checkOutDate]);

  async function searchProperties(overrides?: { city?: string; checkInDate?: string; checkOutDate?: string; guestCount?: number }) {
    setError(null);
    setLoading(true);
    const searchCity = overrides?.city ?? city;
    const searchCheckIn = overrides?.checkInDate ?? checkInDate;
    const searchCheckOut = overrides?.checkOutDate ?? checkOutDate;
    const searchGuests = overrides?.guestCount ?? guestCount;
    try {
      const response = await staysApi.search({ city: searchCity || undefined, checkIn: searchCheckIn, checkOut: searchCheckOut, guests: searchGuests, limit: 24 });
      setProperties(response.data?.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not load stays. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function loadReturningBooking(bookingId: string) {
    setReturningBookingId(bookingId);
    setReturningBooking(null);
    setReturningBookingError(null);
    setReturningBookingLoading(true);

    try {
      const response = await fetch(`${STAYS_API_URL}/stay-bookings/${encodeURIComponent(bookingId)}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null);

      if (response.status === 401) {
        setReturningBookingError({
          title: 'Sign in to view this reservation',
          message: 'We could not verify an active guest session for this returned Stays reservation. Please sign in, then retry the reservation lookup.',
          isAuthFailure: true,
        });
        return;
      }

      if (!response.ok) {
        setReturningBookingError({
          title: 'Reservation lookup needs another try',
          message: payload?.message ?? payload?.error ?? 'Could not load the returned Stays reservation. Please retry the lookup.',
          isAuthFailure: false,
        });
        return;
      }

      const booking = payload?.data ?? null;
      if (!booking) {
        setReturningBookingError({
          title: 'Reservation not found',
          message: 'We could not find a Stays reservation for this return link. Please check the link or retry the lookup.',
          isAuthFailure: false,
        });
        return;
      }

      setReturningBooking(booking);
    } catch {
      setReturningBookingError({
        title: 'Reservation lookup needs another try',
        message: 'A network error stopped us from loading the returned Stays reservation. Please retry the lookup.',
        isAuthFailure: false,
      });
    } finally {
      setReturningBookingLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialCity = params.get('city') ?? '';
    const initialCheckIn = params.get('checkIn');
    const initialCheckOut = params.get('checkOut');
    const initialGuests = Number(params.get('guests'));
    const bookingId = params.get('booking');

    if (bookingId) {
      void loadReturningBooking(bookingId);
    }

    if (initialCity) setCity(initialCity);
    if (initialCheckIn) setCheckInDate(initialCheckIn);
    if (initialCheckOut) setCheckOutDate(initialCheckOut);
    if (Number.isInteger(initialGuests) && initialGuests > 0) setGuestCount(initialGuests);

    void searchProperties({
      city: initialCity || undefined,
      checkInDate: initialCheckIn || checkInDate,
      checkOutDate: initialCheckOut || checkOutDate,
      guestCount: Number.isInteger(initialGuests) && initialGuests > 0 ? initialGuests : guestCount,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectRoom(property: StayProperty, room: StayPropertyRoom) {
    setError(null);
    try {
      const response = await staysApi.availability(property.id, checkInDate, checkOutDate);
      const availability = normalizeStayAvailabilityRooms(response.data);
      const availableRoom = availability.find((candidate) => candidate.id === room.id);
      if (!availableRoom?.isAvailable) {
        setError('That room is no longer available for the selected dates. Please choose another room or date range.');
        return;
      }
      setSelected({ property, room: { ...room, ...availableRoom }, checkInDate, checkOutDate, guestCount, specialRequests: '' });
      setBookingResult(null);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not verify availability for this room.');
    }
  }

  async function createBooking() {
    if (!selected) return;
    setBookingLoading(true);
    setError(null);
    try {
      const response = await staysApi.createBooking({
        roomId: selected.room.id,
        checkInDate: selected.checkInDate,
        checkOutDate: selected.checkOutDate,
        guestCount: selected.guestCount,
        specialRequests: selected.specialRequests || undefined,
      });
      const payment = response.data?.payment;
      const result: BookingResult = {
        reference: payment?.reference ?? response.data?.data?.reference,
        authorizationUrl: payment?.authorizationUrl,
        depositAmount: payment?.depositAmount,
        balanceAmount: payment?.balanceAmount,
      };
      setBookingResult(result);
      if (payment?.authorizationUrl) {
        window.location.href = payment.authorizationUrl;
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        setError('Please sign in as a guest or consumer before creating a Stays booking.');
      } else {
        setError(err?.response?.data?.message ?? 'Could not create the booking. Please try again.');
      }
    } finally {
      setBookingLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F8F5F0] text-[#1A1612]">
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-[#2D6A4F] p-8 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#D8E7DD]">Owambe Stays</p>
          <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Find accommodation for the whole celebration weekend.</h1>
          <p className="mt-4 max-w-3xl text-lg text-[#EEF7F2]">Search approved Stays, verify room availability, create a reservation, and continue securely to deposit payment.</p>
        </div>

        <form
          className="-mt-8 grid gap-4 rounded-2xl bg-white p-5 shadow-xl md:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            searchProperties();
          }}
        >
          <label className="md:col-span-1">
            <span className="text-sm font-semibold text-gray-700">City</span>
            <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Lagos" className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 outline-none focus:border-[#2D6A4F]" />
          </label>
          <label>
            <span className="text-sm font-semibold text-gray-700">Check-in</span>
            <input type="date" min={todayIso()} value={checkInDate} onChange={(event) => setCheckInDate(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 outline-none focus:border-[#2D6A4F]" />
          </label>
          <label>
            <span className="text-sm font-semibold text-gray-700">Check-out</span>
            <input type="date" min={checkInDate} value={checkOutDate} onChange={(event) => setCheckOutDate(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 outline-none focus:border-[#2D6A4F]" />
          </label>
          <label>
            <span className="text-sm font-semibold text-gray-700">Guests</span>
            <input type="number" min={1} value={guestCount} onChange={(event) => setGuestCount(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 outline-none focus:border-[#2D6A4F]" />
          </label>
          <button type="submit" disabled={loading || nights === 0} className="self-end rounded-xl bg-[#E76F2A] px-5 py-3 font-bold text-white disabled:opacity-60">{loading ? 'Searching...' : 'Search stays'}</button>
        </form>

        {error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}

        {(returningBookingLoading || returningBooking || returningBookingError) && (
          <section className="mt-8 rounded-2xl border border-[#D8E7DD] bg-white p-6 shadow" aria-live="polite">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#2D6A4F]">Reservation status</p>
            {returningBookingLoading ? (
              <p className="mt-3 text-sm text-gray-600">Loading your returned reservation...</p>
            ) : returningBookingError ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <h2 className="text-lg font-bold text-red-900">{returningBookingError.title}</h2>
                <p className="mt-2">{returningBookingError.message}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {returningBookingError.isAuthFailure ? (
                    <a className="rounded-lg bg-[#2D6A4F] px-4 py-2 font-semibold text-white" href={`/login?redirect=${encodeURIComponent(returningBookingId ? `/stays?booking=${returningBookingId}` : '/stays')}`}>Sign in to continue</a>
                  ) : null}
                  <button type="button" onClick={() => returningBookingId && loadReturningBooking(returningBookingId)} className="rounded-lg border border-red-300 bg-white px-4 py-2 font-semibold text-red-800">Retry reservation lookup</button>
                </div>
              </div>
            ) : returningBooking ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
                <div>
                  <h2 className="text-2xl font-bold">{returningBooking.property?.name ?? 'Your Stays reservation'}</h2>
                  <p className="mt-1 text-sm text-gray-600">Reference {returningBooking.reference} · {returningBooking.room?.name ?? 'Selected room'}</p>
                  <p className="mt-3 text-sm text-gray-700">{String(returningBooking.checkInDate).slice(0, 10)} to {String(returningBooking.checkOutDate).slice(0, 10)} · {returningBooking.nights ?? nights} night{returningBooking.nights === 1 ? '' : 's'}</p>
                  <p className="mt-2 text-sm text-gray-700">Payment status: <strong>{returningBooking.paymentStatus ?? 'PENDING'}</strong>. Booking status: <strong>{returningBooking.status}</strong>.</p>
                  <p className="mt-2 text-sm text-gray-600">Use this page to confirm the reservation state after deposit payment, then watch your email for pre-arrival instructions and host updates.</p>
                </div>
                <div className="rounded-xl bg-[#EEF7F2] p-4 text-sm text-[#2D6A4F]">
                  <p className="font-semibold">Total: {formatMoney(returningBooking.totalAmount, returningBooking.currency)}</p>
                  <p>Deposit: {formatMoney(returningBooking.depositAmount, returningBooking.currency)}</p>
                </div>
              </div>
            ) : null}
          </section>
        )}

        <section className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Available stays</h2>
              <p className="text-sm text-gray-600">{nights} night{nights === 1 ? '' : 's'} selected</p>
            </div>
            {properties.length === 0 && !loading ? (
              <div className="rounded-2xl bg-white p-8 text-gray-600 shadow">No approved Stays matched this search yet. Try another city or date range.</div>
            ) : null}
            {properties.map((property) => (
              <article key={property.id} className="overflow-hidden rounded-2xl bg-white shadow">
                <div className="grid gap-0 md:grid-cols-[220px_1fr]">
                  <div className="min-h-48 bg-[#D8E7DD]">
                    {property.coverImageUrl ? <img src={property.coverImageUrl} alt={property.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center p-8 text-center text-sm text-[#2D6A4F]">Owambe Stays</div>}
                  </div>
                  <div className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-bold">{property.name}</h3>
                        <p className="mt-1 text-sm text-gray-600">{property.city}{property.state ? `, ${property.state}` : ''}</p>
                      </div>
                      <span className="rounded-full bg-[#EEF7F2] px-3 py-1 text-xs font-semibold text-[#2D6A4F]">{property.propertyType?.replaceAll('_', ' ')}</span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-gray-700">{property.description ?? 'Approved Owambe accommodation with bookable rooms.'}</p>
                    <div className="mt-4 space-y-3">
                      {property.rooms?.map((room) => (
                        <div key={room.id} className="flex flex-col justify-between gap-3 rounded-xl border border-gray-100 p-4 sm:flex-row sm:items-center">
                          <div>
                            <p className="font-semibold">{room.name}</p>
                            <p className="text-sm text-gray-600">Sleeps {room.capacity} · {room.roomType?.replaceAll('_', ' ')}</p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="font-bold">{formatMoney(room.pricePerNight, room.currency)} <span className="text-xs font-normal text-gray-500">/ night</span></p>
                            <button onClick={() => selectRoom(property, room)} disabled={room.capacity < guestCount || nights === 0} className="mt-2 rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Select room</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <aside className="h-fit rounded-2xl bg-white p-5 shadow lg:sticky lg:top-6">
            <h2 className="text-xl font-bold">Booking summary</h2>
            {selected ? (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="font-semibold">{selected.property.name}</p>
                  <p className="text-sm text-gray-600">{selected.room.name}</p>
                </div>
                <div className="rounded-xl bg-[#F8F5F0] p-4 text-sm">
                  <p>{selected.checkInDate} to {selected.checkOutDate}</p>
                  <p>{selected.guestCount} guest{selected.guestCount === 1 ? '' : 's'} · {nights} night{nights === 1 ? '' : 's'}</p>
                  <p className="mt-2 text-gray-700">Effective rate: {formatMoney(selectedRoomNightlyLabel(selected.room), selected.room.currency)} <span className="text-xs text-gray-500">/ night average</span></p>
                  <p className="mt-2 font-bold">Total: {formatMoney(selectedRoomTotal(selected.room, nights), selected.room.currency)}</p>
                  <p className="text-gray-600">Deposit today: {formatMoney(selectedRoomTotal(selected.room, nights) * 0.3, selected.room.currency)}</p>
                  {selectedRoomUsesOverrides(selected.room) ? <p className="text-xs font-medium text-[#2D6A4F]">Includes date-specific host rate overrides for the selected stay.</p> : null}
                </div>
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">Special requests</span>
                  <textarea value={selected.specialRequests} onChange={(event) => setSelected({ ...selected, specialRequests: event.target.value })} rows={4} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 outline-none focus:border-[#2D6A4F]" />
                </label>
                <button onClick={createBooking} disabled={bookingLoading} className="w-full rounded-xl bg-[#E76F2A] px-5 py-3 font-bold text-white disabled:opacity-60">{bookingLoading ? 'Creating booking...' : 'Reserve and pay deposit'}</button>
                {bookingResult && (
                  <div className="rounded-xl border border-[#D8E7DD] bg-[#EEF7F2] p-4 text-sm text-[#2D6A4F]">
                    <p className="font-semibold">Reservation created: {bookingResult.reference}</p>
                    {bookingResult.authorizationUrl ? <a className="mt-2 inline-block underline" href={bookingResult.authorizationUrl}>Continue to secure payment</a> : <p>Payment link is being prepared.</p>}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-600">Select an available room to create a reservation and continue to secure deposit payment.</p>
            )}
          </aside>
        </section>
      </section>
    </main>
  );
}
