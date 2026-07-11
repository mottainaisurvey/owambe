'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Clock, Plus, AlertCircle, Loader2, Users, Calendar } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface Experience {
  id: string;
  name: string;
  city: string;
  isActive: boolean;
}

interface Slot {
  id: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  isActive: boolean;
}

export default function ManageSlotsPage() {
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get('experienceId');

  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [selectedId, setSelectedId] = useState<string>(preselectedId ?? '');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingExperiences, setLoadingExperiences] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    startTime: '',
    endTime: '',
    capacity: '',
  });

  // Load operator's experiences
  useEffect(() => {
    const fetchExperiences = async () => {
      try {
        const { data } = await api.get('/experiences/mine');
        setExperiences(data.data ?? []);
        if (preselectedId) setSelectedId(preselectedId);
        else if (data.data?.length > 0 && !selectedId) setSelectedId(data.data[0].id);
      } catch {
        toast.error('Failed to load experiences');
      } finally {
        setLoadingExperiences(false);
      }
    };
    fetchExperiences();
  }, []);

  // Load slots for selected experience
  useEffect(() => {
    if (!selectedId) return;
    const fetchSlots = async () => {
      setLoadingSlots(true);
      try {
        const { data } = await api.get(`/experiences/${selectedId}/slots`, {
          params: { from: new Date().toISOString(), to: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() }
        });
        setSlots(data.data ?? []);
      } catch {
        setSlots([]);
        toast.error('Failed to load slots');
      } finally {
        setLoadingSlots(false);
      }
    };
    fetchSlots();
  }, [selectedId]);

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) { toast.error('Select an experience first'); return; }
    if (!form.startTime || !form.endTime || !form.capacity) {
      toast.error('Start time, end time, and capacity are required');
      return;
    }
    if (new Date(form.endTime) <= new Date(form.startTime)) {
      toast.error('End time must be after start time');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post(`/experiences/${selectedId}/slots`, {
        startTime: form.startTime,
        endTime: form.endTime,
        capacity: parseInt(form.capacity),
      });
      toast.success('Slot added');
      setSlots(prev => [...prev, data.data]);
      setForm({ startTime: '', endTime: '', capacity: '' });
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to add slot');
    } finally {
      setSaving(false);
    }
  };

  const selectedExperience = experiences.find(e => e.id === selectedId);

  if (loadingExperiences) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-[var(--border)] rounded-xl w-1/2" />
          <div className="h-32 bg-[var(--border)] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--dark)]">Manage Slots</h1>
        <p className="text-sm text-[var(--mid)] mt-0.5">Add availability slots for your experiences. Guests book specific slots.</p>
      </div>

      {/* Experience selector */}
      {experiences.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[var(--border)] rounded-xl">
          <Clock size={40} className="mx-auto text-[var(--muted)] mb-4" />
          <h3 className="font-semibold text-[var(--dark)] mb-2">No experiences yet</h3>
          <p className="text-sm text-[var(--mid)] mb-6">Create an experience first before adding slots.</p>
          <Link href="/dashboard/experiences/new" className="btn-primary text-sm px-5 py-2">
            Add Experience
          </Link>
        </div>
      ) : (
        <>
          <div className="bg-white border border-[var(--border)] rounded-xl p-5 mb-6">
            <label className="block text-sm font-medium text-[var(--dark)] mb-2">Select Experience</label>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="input w-full"
            >
              {experiences.map(exp => (
                <option key={exp.id} value={exp.id}>{exp.name} — {exp.city}</option>
              ))}
            </select>
          </div>

          {/* Add slot form */}
          <div className="bg-white border border-[var(--border)] rounded-xl p-5 mb-6">
            <h2 className="font-semibold text-[var(--dark)] mb-4">Add New Slot</h2>
            <form onSubmit={handleAddSlot} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--dark)] mb-1">
                    Start Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={form.startTime}
                    onChange={e => setForm(prev => ({ ...prev, startTime: e.target.value }))}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--dark)] mb-1">
                    End Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={form.endTime}
                    onChange={e => setForm(prev => ({ ...prev, endTime: e.target.value }))}
                    className="input w-full"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--dark)] mb-1">
                  Capacity (max guests) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={form.capacity}
                  onChange={e => setForm(prev => ({ ...prev, capacity: e.target.value }))}
                  placeholder="e.g. 10"
                  min="1"
                  className="input w-full sm:w-48"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary flex items-center gap-2 text-sm px-5 py-2 disabled:opacity-60"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {saving ? 'Adding...' : 'Add Slot'}
              </button>
            </form>
          </div>

          {/* Existing slots */}
          <div>
            <h2 className="font-semibold text-[var(--dark)] mb-3">
              Upcoming Slots {selectedExperience ? `— ${selectedExperience.name}` : ''}
            </h2>
            {loadingSlots ? (
              <div className="animate-pulse space-y-3">
                {[1, 2].map(i => <div key={i} className="h-16 bg-[var(--border)] rounded-xl" />)}
              </div>
            ) : slots.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-[var(--border)] rounded-xl">
                <Calendar size={32} className="mx-auto text-[var(--muted)] mb-3" />
                <p className="text-sm text-[var(--mid)]">No upcoming slots. Add your first slot above.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {slots.map(slot => {
                  const start = new Date(slot.startTime);
                  const end = new Date(slot.endTime);
                  const available = slot.capacity - slot.bookedCount;
                  const isSoldOut = slot.bookedCount >= slot.capacity;
                  return (
                    <div
                      key={slot.id}
                      className={`bg-white border rounded-xl p-4 flex items-center justify-between ${
                        isSoldOut ? 'border-red-200 bg-red-50/30' : 'border-[var(--border)]'
                      }`}
                    >
                      <div>
                        <div className="font-medium text-[var(--dark)] text-sm">
                          {start.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                        <div className="text-xs text-[var(--mid)] mt-0.5">
                          {start.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })} – {end.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`flex items-center gap-1 text-sm font-medium ${isSoldOut ? 'text-red-600' : 'text-[var(--dark)]'}`}>
                          <Users size={13} />
                          {isSoldOut ? 'Sold out' : `${available} / ${slot.capacity} available`}
                        </div>
                        <div className="text-xs text-[var(--mid)] mt-0.5">{slot.bookedCount} booked</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
