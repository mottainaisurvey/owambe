'use client';
// C2: Experience Slot Scheduling — Operator Portal
// OWB-C2-EXPERIENCES-SLOT-SCHEDULING-01
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Plus, Loader2, Users, Repeat, Trash2, Edit2, AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface Experience { id: string; name: string; city: string; capacity: number; isActive: boolean; isApproved: boolean; }
interface SlotInstance { id: string; experienceId: string; startTime: string; endTime: string; capacity: number; bookedCount: number; isActive: boolean; rruleString?: string; timezone?: string; parentSlotId?: string; availableSpots?: number; isSoldOut?: boolean; }

const WEEKDAYS = [{ label: 'Mon', value: 'MO' }, { label: 'Tue', value: 'TU' }, { label: 'Wed', value: 'WE' }, { label: 'Thu', value: 'TH' }, { label: 'Fri', value: 'FR' }, { label: 'Sat', value: 'SA' }, { label: 'Sun', value: 'SU' }];

function buildRRule(freq: 'DAILY' | 'WEEKLY', byday: string[], boundType: 'COUNT' | 'UNTIL', count: number, until: string): string {
  let rule = `FREQ=${freq}`;
  if (freq === 'WEEKLY' && byday.length > 0) rule += `;BYDAY=${byday.join(',')}`;
  if (boundType === 'COUNT') rule += `;COUNT=${count}`;
  else if (boundType === 'UNTIL' && until) {
    const d = new Date(until);
    rule += `;UNTIL=${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}T235959Z`;
  }
  return rule;
}

function SlotRow({ slot, onEdit, onCancel }: { slot: SlotInstance; onEdit: () => void; onCancel: () => void; }) {
  const start = new Date(slot.startTime); const end = new Date(slot.endTime);
  const available = slot.capacity - slot.bookedCount; const isSoldOut = slot.bookedCount >= slot.capacity;
  return (
    <div className={`bg-white border rounded-xl p-4 flex items-center justify-between gap-3 ${isSoldOut ? 'border-red-200 bg-red-50/30' : 'border-[var(--border)]'}`}>
      <div className="min-w-0">
        <div className="font-medium text-[var(--dark)] text-sm">{start.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
        <div className="text-xs text-[var(--mid)] mt-0.5">{start.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })} – {end.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}{slot.timezone && <span className="ml-1 text-[var(--muted)]">({slot.timezone})</span>}</div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <div className={`flex items-center gap-1 text-sm font-medium ${isSoldOut ? 'text-red-600' : 'text-[var(--dark)]'}`}><Users size={13} />{isSoldOut ? 'Sold out' : `${available} / ${slot.capacity}`}</div>
          <div className="text-xs text-[var(--mid)]">{slot.bookedCount} booked</div>
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-[var(--border)] text-[var(--mid)] hover:text-[var(--dark)]" title="Edit instance"><Edit2 size={13} /></button>
          <button onClick={onCancel} disabled={slot.bookedCount > 0} className="p-1.5 rounded-lg hover:bg-red-50 text-[var(--mid)] hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed" title={slot.bookedCount > 0 ? 'Cannot cancel: has bookings' : 'Cancel instance'}><Trash2 size={13} /></button>
        </div>
      </div>
    </div>
  );
}

export default function ManageSlotsPage() {
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get('experienceId');
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [selectedId, setSelectedId] = useState<string>(preselectedId ?? '');
  const [slots, setSlots] = useState<SlotInstance[]>([]);
  const [loadingExp, setLoadingExp] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slotType, setSlotType] = useState<'one-off' | 'recurring'>('one-off');
  const [startDate, setStartDate] = useState('');
  const [startTimeVal, setStartTimeVal] = useState('09:00');
  const [endTimeVal, setEndTimeVal] = useState('11:00');
  const [capacity, setCapacity] = useState('');
  const [freq, setFreq] = useState<'DAILY' | 'WEEKLY'>('WEEKLY');
  const [byday, setByday] = useState<string[]>(['MO']);
  const [boundType, setBoundType] = useState<'COUNT' | 'UNTIL'>('COUNT');
  const [countVal, setCountVal] = useState(8);
  const [untilVal, setUntilVal] = useState('');
  const [editingSlot, setEditingSlot] = useState<SlotInstance | null>(null);
  const [editCapacity, setEditCapacity] = useState('');
  const selectedExp = experiences.find(e => e.id === selectedId);

  useEffect(() => {
    api.get('/experiences/mine').then(({ data }) => { setExperiences(data.data ?? []); if (!preselectedId && data.data?.length > 0) setSelectedId(data.data[0].id); }).catch(() => toast.error('Failed to load experiences')).finally(() => setLoadingExp(false));
  }, []);

  const fetchSlots = useCallback(() => {
    if (!selectedId) return;
    setLoadingSlots(true);
    api.get(`/experience-slots/${selectedId}`, { params: { from: new Date().toISOString(), to: new Date(Date.now() + 90*24*60*60*1000).toISOString() } })
      .then(({ data }) => setSlots(data.data ?? []))
      .catch(() => { setSlots([]); toast.error('Failed to load slots'); })
      .finally(() => setLoadingSlots(false));
  }, [selectedId]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); if (!selectedId) return; setSaving(true);
    try {
      const startISO = new Date(`${startDate}T${startTimeVal}:00`).toISOString();
      const endISO = new Date(`${startDate}T${endTimeVal}:00`).toISOString();
      const body: any = { startTime: startISO, endTime: endISO, capacity };
      if (slotType === 'recurring') { body.rruleString = buildRRule(freq, byday, boundType, countVal, untilVal); body.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Lagos'; }
      const { data } = await api.post(`/experience-slots/${selectedId}`, body);
      toast.success(slotType === 'recurring' ? `Series created: ${data.instanceCount ?? 1} instance(s)` : 'Slot created');
      setStartDate(''); setCapacity(''); setByday(['MO']); setCountVal(8); setUntilVal('');
      fetchSlots();
    } catch (err: any) { toast.error(err?.response?.data?.error ?? 'Failed to create slot'); }
    finally { setSaving(false); }
  };

  const handleCancelInstance = async (slotId: string) => {
    if (!confirm('Cancel this slot instance?')) return;
    try { await api.delete(`/experience-slots/${slotId}`); toast.success('Slot cancelled'); fetchSlots(); }
    catch (err: any) { toast.error(err?.response?.data?.error ?? 'Failed to cancel slot'); }
  };

  const handleCancelSeries = async (parentId: string) => {
    if (!confirm('Cancel all remaining instances? Instances with bookings will be preserved.')) return;
    try { const { data } = await api.patch(`/experience-slots/${parentId}/cancel-series`); toast.success(data.message || 'Series cancelled'); fetchSlots(); }
    catch (err: any) { toast.error(err?.response?.data?.error ?? 'Failed to cancel series'); }
  };

  const handleEditInstance = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editingSlot) return; setSaving(true);
    try {
      const body: any = {};
      if (editCapacity) body.capacity = editCapacity;
      await api.patch(`/experience-slots/${editingSlot.id}`, body);
      toast.success('Slot updated'); setEditingSlot(null); fetchSlots();
    } catch (err: any) { toast.error(err?.response?.data?.error ?? 'Failed to update slot'); }
    finally { setSaving(false); }
  };

  const seriesGroups: Record<string, SlotInstance[]> = {};
  const oneOffSlots: SlotInstance[] = [];
  slots.forEach(slot => { if (slot.parentSlotId) { if (!seriesGroups[slot.parentSlotId]) seriesGroups[slot.parentSlotId] = []; seriesGroups[slot.parentSlotId].push(slot); } else { oneOffSlots.push(slot); } });

  if (loadingExp) return <div className="p-6 max-w-3xl mx-auto"><div className="animate-pulse space-y-4"><div className="h-10 bg-[var(--border)] rounded-xl w-1/2" /><div className="h-32 bg-[var(--border)] rounded-xl" /></div></div>;

  if (experiences.length === 0) return (
    <div className="p-6 max-w-3xl mx-auto text-center py-16 border border-dashed border-[var(--border)] rounded-xl">
      <Clock size={40} className="mx-auto text-[var(--muted)] mb-4" />
      <h3 className="font-semibold text-[var(--dark)] mb-2">No experiences yet</h3>
      <p className="text-sm text-[var(--mid)] mb-6">Create an experience first before adding slots.</p>
      <Link href="/dashboard/experiences/new" className="btn-primary text-sm px-5 py-2">Add Experience</Link>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div><h1 className="text-2xl font-bold text-[var(--dark)]">Manage Slots</h1><p className="text-sm text-[var(--mid)] mt-1">Create one-off or recurring availability slots for your experiences.</p></div>
      <div>
        <label className="block text-sm font-medium text-[var(--dark)] mb-1">Select Experience</label>
        <select className="input w-full" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
          <option value="">— Choose an experience —</option>
          {experiences.map(exp => <option key={exp.id} value={exp.id}>{exp.name} — {exp.city}</option>)}
        </select>
      </div>
      {selectedId && (
        <>
          <div className="bg-white border border-[var(--border)] rounded-2xl p-6 space-y-5">
            <h2 className="font-semibold text-[var(--dark)]">Add Slot</h2>
            <div className="flex gap-2">
              {(['one-off', 'recurring'] as const).map(t => (
                <button key={t} type="button" onClick={() => setSlotType(t)} className={`px-4 py-2 rounded-lg text-sm font-medium border flex items-center gap-1.5 ${slotType === t ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-white text-[var(--mid)] border-[var(--border)]'}`}>
                  {t === 'recurring' && <Repeat size={13} />}{t === 'one-off' ? 'One-off' : 'Recurring'}
                </button>
              ))}
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="block text-xs font-medium text-[var(--mid)] mb-1">{slotType === 'recurring' ? 'First date' : 'Date'}</label><input type="date" className="input w-full" value={startDate} onChange={e => setStartDate(e.target.value)} required /></div>
                <div><label className="block text-xs font-medium text-[var(--mid)] mb-1">Start time</label><input type="time" className="input w-full" value={startTimeVal} onChange={e => setStartTimeVal(e.target.value)} required /></div>
                <div><label className="block text-xs font-medium text-[var(--mid)] mb-1">End time</label><input type="time" className="input w-full" value={endTimeVal} onChange={e => setEndTimeVal(e.target.value)} required /></div>
              </div>
              <div><label className="block text-xs font-medium text-[var(--mid)] mb-1">Capacity</label><input type="number" className="input w-full sm:w-36" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder={selectedExp ? String(selectedExp.capacity) : '10'} min="1" required /></div>
              {slotType === 'recurring' && (
                <div className="space-y-3 pt-2 border-t border-[var(--border)]">
                  <p className="text-xs font-medium text-[var(--mid)] uppercase tracking-wide">Recurrence pattern</p>
                  <div className="flex gap-2">{(['DAILY', 'WEEKLY'] as const).map(f => <button key={f} type="button" onClick={() => setFreq(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${freq === f ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-white text-[var(--mid)] border-[var(--border)]'}`}>{f === 'DAILY' ? 'Daily' : 'Weekly'}</button>)}</div>
                  {freq === 'WEEKLY' && <div><p className="text-xs text-[var(--mid)] mb-1.5">Days of week</p><div className="flex flex-wrap gap-1.5">{WEEKDAYS.map(d => <button key={d.value} type="button" onClick={() => setByday(prev => prev.includes(d.value) ? prev.filter(x => x !== d.value) : [...prev, d.value])} className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${byday.includes(d.value) ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-white text-[var(--mid)] border-[var(--border)]'}`}>{d.label}</button>)}</div></div>}
                  <div className="flex gap-2">{(['COUNT', 'UNTIL'] as const).map(b => <button key={b} type="button" onClick={() => setBoundType(b)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${boundType === b ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-white text-[var(--mid)] border-[var(--border)]'}`}>{b === 'COUNT' ? 'Number of occurrences' : 'End date'}</button>)}</div>
                  {boundType === 'COUNT' ? <div><label className="block text-xs text-[var(--mid)] mb-1">Occurrences</label><input type="number" className="input w-28" value={countVal} onChange={e => setCountVal(parseInt(e.target.value) || 1)} min="1" max="365" /></div> : <div><label className="block text-xs text-[var(--mid)] mb-1">Repeat until</label><input type="date" className="input w-44" value={untilVal} onChange={e => setUntilVal(e.target.value)} required={boundType === 'UNTIL'} /></div>}
                  <p className="text-xs text-[var(--mid)] bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><AlertTriangle size={11} className="inline mr-1 text-amber-500" />All occurrences are created immediately. A COUNT or end date is required.</p>
                </div>
              )}
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 text-sm px-5 py-2 disabled:opacity-60">{saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}{saving ? 'Creating...' : slotType === 'recurring' ? 'Create recurring series' : 'Add slot'}</button>
            </form>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-[var(--dark)]">Upcoming Slots {selectedExp ? `— ${selectedExp.name}` : ''}</h2>
              <button onClick={fetchSlots} className="text-[var(--mid)] hover:text-[var(--primary)] p-1" title="Refresh"><RefreshCw size={14} /></button>
            </div>
            {loadingSlots ? <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-[var(--border)] rounded-xl" />)}</div> :
             slots.length === 0 ? <div className="text-center py-10 border border-dashed border-[var(--border)] rounded-xl"><Calendar size={32} className="mx-auto text-[var(--muted)] mb-3" /><p className="text-sm text-[var(--mid)]">No upcoming slots. Add your first slot above.</p></div> :
             <div className="space-y-6">
               {oneOffSlots.length > 0 && <div><p className="text-xs font-medium text-[var(--mid)] uppercase tracking-wide mb-2">One-off slots</p><div className="space-y-2">{oneOffSlots.map(slot => <SlotRow key={slot.id} slot={slot} onEdit={() => { setEditingSlot(slot); setEditCapacity(String(slot.capacity)); }} onCancel={() => handleCancelInstance(slot.id)} />)}</div></div>}
               {Object.entries(seriesGroups).map(([parentId, instances]) => (
                 <div key={parentId}>
                   <div className="flex items-center justify-between mb-2">
                     <div className="flex items-center gap-2"><Repeat size={13} className="text-[var(--primary)]" /><p className="text-xs font-medium text-[var(--mid)] uppercase tracking-wide">Recurring series ({instances.length} instances)</p></div>
                     <button onClick={() => handleCancelSeries(parentId)} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"><Trash2 size={11} />Cancel series</button>
                   </div>
                   <div className="space-y-2">{instances.map(slot => <SlotRow key={slot.id} slot={slot} onEdit={() => { setEditingSlot(slot); setEditCapacity(String(slot.capacity)); }} onCancel={() => handleCancelInstance(slot.id)} />)}</div>
                 </div>
               ))}
             </div>}
          </div>
          {editingSlot && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-xl">
                <h3 className="font-semibold text-[var(--dark)]">Edit Slot Instance</h3>
                <p className="text-xs text-[var(--mid)]">Editing this instance only. Other instances in the series are unaffected.</p>
                <form onSubmit={handleEditInstance} className="space-y-3">
                  <div><label className="block text-xs font-medium text-[var(--mid)] mb-1">Capacity</label><input type="number" className="input w-full" value={editCapacity} onChange={e => setEditCapacity(e.target.value)} min={editingSlot.bookedCount || 1} /></div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={saving} className="btn-primary text-sm px-4 py-2 flex-1 disabled:opacity-60">{saving ? <Loader2 size={13} className="animate-spin mx-auto" /> : 'Save'}</button>
                    <button type="button" onClick={() => setEditingSlot(null)} className="btn-secondary text-sm px-4 py-2 flex-1">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
