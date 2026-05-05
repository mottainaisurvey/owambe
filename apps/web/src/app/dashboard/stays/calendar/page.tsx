'use client';
import { useEffect, useState, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Save, Loader2,
  Lock, Unlock, DollarSign, Calendar
} from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface Room {
  id: string;
  name: string;
  roomType: string;
  pricePerNight: number;
  currency: string;
}

interface Property {
  id: string;
  name: string;
  rooms: Room[];
}

interface CalendarEntry {
  id?: string;
  date: string; // YYYY-MM-DD
  roomId: string;
  isBlocked: boolean;
  blockReason?: string | null;
  overridePrice?: number | null;
  minimumNights?: number | null;
  notes?: string | null;
}

interface BookingSpan {
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  guestName: string;
  status: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function toYMD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export default function StaysCalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [bookings, setBookings] = useState<BookingSpan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editEntry, setEditEntry] = useState<Partial<CalendarEntry>>({});

  // Fetch properties
  useEffect(() => {
    api.get('/properties/host')
      .then(({ data }) => {
        const props: Property[] = data.data ?? [];
        setProperties(props);
        if (props.length > 0) {
          setSelectedPropertyId(props[0].id);
          if (props[0].rooms.length > 0) setSelectedRoomId(props[0].rooms[0].id);
        }
      })
      .catch(() => toast.error('Failed to load properties'))
      .finally(() => setLoading(false));
  }, []);

  // Fetch calendar entries and bookings when room/month changes
  useEffect(() => {
    if (!selectedRoomId) return;
    const start = toYMD(new Date(year, month, 1));
    const end = toYMD(new Date(year, month + 1, 0));
    Promise.all([
      api.get(`/properties/calendar-entries?roomId=${selectedRoomId}&start=${start}&end=${end}`).catch(() => ({ data: { data: [] } })),
      api.get(`/properties/host/bookings?roomId=${selectedRoomId}`).catch(() => ({ data: { data: [] } })),
    ]).then(([entriesRes, bookingsRes]) => {
      setEntries(entriesRes.data.data ?? []);
      setBookings(bookingsRes.data.data ?? []);
    });
  }, [selectedRoomId, year, month]);

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const entryMap = useMemo(() => {
    const map: Record<string, CalendarEntry> = {};
    entries.forEach(e => { map[e.date] = e; });
    return map;
  }, [entries]);

  const bookedDates = useMemo(() => {
    const set = new Set<string>();
    bookings.forEach(b => {
      if (!['CONFIRMED', 'CHECKED_IN'].includes(b.status)) return;
      if (b.roomId !== selectedRoomId) return;
      const d = new Date(b.checkInDate);
      const end = new Date(b.checkOutDate);
      while (d < end) {
        set.add(toYMD(d));
        d.setDate(d.getDate() + 1);
      }
    });
    return set;
  }, [bookings, selectedRoomId]);

  const selectedRoom = useMemo(
    () => properties.flatMap(p => p.rooms).find(r => r.id === selectedRoomId),
    [properties, selectedRoomId]
  );

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const handleDayClick = (date: Date) => {
    const ymd = toYMD(date);
    if (bookedDates.has(ymd)) return; // can't edit booked dates
    setSelectedDate(ymd);
    const existing = entryMap[ymd];
    setEditEntry(existing ?? { date: ymd, roomId: selectedRoomId, isBlocked: false });
  };

  const handleSave = async () => {
    if (!selectedDate || !selectedRoomId) return;
    setSaving(true);
    try {
      const payload = {
        ...editEntry,
        date: selectedDate,
        roomId: selectedRoomId,
      };
      if (editEntry.id) {
        await api.put(`/properties/calendar-entries/${editEntry.id}`, payload);
      } else {
        await api.post('/properties/calendar-entries', payload);
      }
      toast.success('Calendar updated');
      // Refresh entries
      const start = toYMD(new Date(year, month, 1));
      const end = toYMD(new Date(year, month + 1, 0));
      const { data } = await api.get(`/properties/calendar-entries?roomId=${selectedRoomId}&start=${start}&end=${end}`);
      setEntries(data.data ?? []);
      setSelectedDate(null);
    } catch {
      toast.error('Failed to save calendar entry');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="animate-pulse h-96 bg-[var(--border)] rounded-xl" />
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center py-16">
        <Calendar size={40} className="mx-auto text-[var(--muted)] mb-4" />
        <h3 className="font-semibold text-[var(--dark)] mb-2">No properties yet</h3>
        <p className="text-sm text-[var(--mid)]">Add a property first to manage its availability calendar.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--dark)]">Availability Calendar</h1>
          <p className="text-sm text-[var(--mid)] mt-0.5">Block dates, set price overrides, and manage minimum stays</p>
        </div>
      </div>

      {/* Property / Room selectors */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={selectedPropertyId}
          onChange={e => {
            setSelectedPropertyId(e.target.value);
            const prop = properties.find(p => p.id === e.target.value);
            if (prop?.rooms.length) setSelectedRoomId(prop.rooms[0].id);
          }}
          className="text-sm border border-[var(--border)] rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[var(--accent)]"
        >
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={selectedRoomId}
          onChange={e => setSelectedRoomId(e.target.value)}
          className="text-sm border border-[var(--border)] rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[var(--accent)]"
        >
          {properties.find(p => p.id === selectedPropertyId)?.rooms.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        {selectedRoom && (
          <span className="text-sm text-[var(--mid)] self-center">
            Base rate: {selectedRoom.currency} {Number(selectedRoom.pricePerNight).toLocaleString('en-NG')}/night
          </span>
        )}
      </div>

      <div className="flex gap-6">
        {/* Calendar */}
        <div className="flex-1">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-[var(--surface)]">
              <ChevronLeft size={18} />
            </button>
            <h2 className="font-semibold text-[var(--dark)]">{MONTHS[month]} {year}</h2>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[var(--surface)]">
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-xs font-medium text-[var(--muted)] py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {/* Empty cells for first day offset */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {days.map(day => {
              const ymd = toYMD(day);
              const entry = entryMap[ymd];
              const isBooked = bookedDates.has(ymd);
              const isBlocked = entry?.isBlocked;
              const isPast = day < today && toYMD(day) !== toYMD(today);
              const isSelected = selectedDate === ymd;
              const isToday = toYMD(day) === toYMD(today);

              let cellClass = 'relative rounded-lg p-1 text-center cursor-pointer transition-all text-xs ';
              if (isSelected) cellClass += 'ring-2 ring-[var(--accent)] bg-[var(--accent)]/10 ';
              else if (isBooked) cellClass += 'bg-blue-100 text-blue-800 cursor-default ';
              else if (isBlocked) cellClass += 'bg-red-100 text-red-700 ';
              else if (isPast) cellClass += 'opacity-40 cursor-default ';
              else if (entry?.overridePrice) cellClass += 'bg-yellow-50 text-yellow-800 ';
              else cellClass += 'hover:bg-[var(--surface)] text-[var(--dark)] ';

              if (isToday) cellClass += 'font-bold ';

              return (
                <div
                  key={ymd}
                  className={cellClass}
                  onClick={() => !isPast && !isBooked && handleDayClick(day)}
                >
                  <div>{day.getDate()}</div>
                  {isBooked && <div className="w-1 h-1 rounded-full bg-blue-500 mx-auto mt-0.5" />}
                  {isBlocked && !isBooked && <Lock size={8} className="mx-auto mt-0.5" />}
                  {entry?.overridePrice && !isBlocked && !isBooked && (
                    <div className="text-[9px] leading-none">₦{(entry.overridePrice / 1000).toFixed(0)}k</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 text-xs text-[var(--mid)]">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 inline-block" /> Booked</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block" /> Blocked</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-50 border border-yellow-200 inline-block" /> Price override</span>
          </div>
        </div>

        {/* Edit panel */}
        {selectedDate && (
          <div className="w-64 shrink-0">
            <div className="bg-white border border-[var(--border)] rounded-xl p-4">
              <h3 className="font-semibold text-[var(--dark)] mb-3 text-sm">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-NG', {
                  weekday: 'long', day: 'numeric', month: 'long'
                })}
              </h3>

              {/* Block toggle */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-[var(--dark)]">Block this date</span>
                <button
                  onClick={() => setEditEntry(e => ({ ...e, isBlocked: !e.isBlocked }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${editEntry.isBlocked ? 'bg-red-500' : 'bg-[var(--border)]'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${editEntry.isBlocked ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {editEntry.isBlocked && (
                <div className="mb-3">
                  <label className="text-xs text-[var(--mid)] block mb-1">Block reason</label>
                  <input
                    type="text"
                    value={editEntry.blockReason ?? ''}
                    onChange={e => setEditEntry(prev => ({ ...prev, blockReason: e.target.value }))}
                    placeholder="e.g. Owner stay, maintenance"
                    className="w-full text-sm border border-[var(--border)] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              )}

              {!editEntry.isBlocked && (
                <>
                  <div className="mb-3">
                    <label className="text-xs text-[var(--mid)] block mb-1">Price override (₦)</label>
                    <input
                      type="number"
                      value={editEntry.overridePrice ?? ''}
                      onChange={e => setEditEntry(prev => ({ ...prev, overridePrice: e.target.value ? Number(e.target.value) : null }))}
                      placeholder={selectedRoom ? String(selectedRoom.pricePerNight) : ''}
                      className="w-full text-sm border border-[var(--border)] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="text-xs text-[var(--mid)] block mb-1">Min. nights</label>
                    <input
                      type="number"
                      min={1}
                      value={editEntry.minimumNights ?? ''}
                      onChange={e => setEditEntry(prev => ({ ...prev, minimumNights: e.target.value ? Number(e.target.value) : null }))}
                      placeholder="1"
                      className="w-full text-sm border border-[var(--border)] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </>
              )}

              <div className="mb-4">
                <label className="text-xs text-[var(--mid)] block mb-1">Notes</label>
                <textarea
                  value={editEntry.notes ?? ''}
                  onChange={e => setEditEntry(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className="w-full text-sm border border-[var(--border)] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[var(--accent)] resize-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 btn-primary text-sm py-2 flex items-center justify-center gap-1.5"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Save
                </button>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--surface)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
