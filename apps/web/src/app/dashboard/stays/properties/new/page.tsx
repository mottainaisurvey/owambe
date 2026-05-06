'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

const PROPERTY_TYPES = [
  { value: 'HOTEL', label: 'Hotel' },
  { value: 'GUESTHOUSE', label: 'Guesthouse' },
  { value: 'VILLA', label: 'Villa' },
  { value: 'APARTMENT', label: 'Apartment' },
  { value: 'RESORT', label: 'Resort' },
  { value: 'LODGE', label: 'Lodge' },
  { value: 'BOUTIQUE_HOTEL', label: 'Boutique Hotel' },
  { value: 'SERVICED_APARTMENT', label: 'Serviced Apartment' },
];

const AMENITIES = [
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'pool', label: 'Swimming Pool' },
  { value: 'parking', label: 'Parking' },
  { value: 'air_conditioning', label: 'Air Conditioning' },
  { value: 'gym', label: 'Gym' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'bar', label: 'Bar' },
  { value: 'spa', label: 'Spa' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'concierge', label: 'Concierge' },
  { value: 'room_service', label: 'Room Service' },
  { value: 'airport_shuttle', label: 'Airport Shuttle' },
];

export default function AddPropertyPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    propertyType: 'HOTEL',
    city: '',
    state: '',
    country: 'Nigeria',
    address: '',
    checkInTime: '14:00',
    checkOutTime: '12:00',
    houseRules: '',
    cancellationPolicy: '',
    amenities: [] as string[],
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const toggleAmenity = (value: string) => {
    setForm(prev => ({
      ...prev,
      amenities: prev.amenities.includes(value)
        ? prev.amenities.filter(a => a !== value)
        : [...prev.amenities, value],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.city.trim()) {
      toast.error('Property name and city are required');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/properties', form);
      toast.success('Property created successfully!');
      router.push(`/dashboard/stays/properties`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to create property');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-up">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/stays/properties" className="text-[var(--muted)] hover:text-[var(--dark)] transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h2 className="section-title">Add New Property</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">Fill in the details to list your property on Owambe Stays.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Basic Info */}
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm text-[var(--dark)]">Basic Information</h3>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">Property Name *</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. Lagos Luxury Suites"
              className="input w-full"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">Property Type *</label>
            <select name="propertyType" value={form.propertyType} onChange={handleChange} className="input w-full">
              {PROPERTY_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Describe your property — highlight what makes it special..."
              rows={4}
              className="input w-full resize-none"
            />
          </div>
        </div>

        {/* Location */}
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm text-[var(--dark)]">Location</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1">City *</label>
              <input name="city" value={form.city} onChange={handleChange} placeholder="e.g. Lagos" className="input w-full" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1">State</label>
              <input name="state" value={form.state} onChange={handleChange} placeholder="e.g. Lagos State" className="input w-full" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">Country</label>
            <input name="country" value={form.country} onChange={handleChange} placeholder="Nigeria" className="input w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">Full Address</label>
            <input name="address" value={form.address} onChange={handleChange} placeholder="e.g. 5 Bourdillon Road, Ikoyi, Lagos" className="input w-full" />
          </div>
        </div>

        {/* Policies */}
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm text-[var(--dark)]">Policies</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1">Check-in Time</label>
              <input type="time" name="checkInTime" value={form.checkInTime} onChange={handleChange} className="input w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted)] mb-1">Check-out Time</label>
              <input type="time" name="checkOutTime" value={form.checkOutTime} onChange={handleChange} className="input w-full" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">House Rules</label>
            <textarea
              name="houseRules"
              value={form.houseRules}
              onChange={handleChange}
              placeholder="e.g. No smoking, No pets, Quiet hours after 10pm..."
              rows={3}
              className="input w-full resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">Cancellation Policy</label>
            <textarea
              name="cancellationPolicy"
              value={form.cancellationPolicy}
              onChange={handleChange}
              placeholder="e.g. Free cancellation up to 48 hours before check-in..."
              rows={3}
              className="input w-full resize-none"
            />
          </div>
        </div>

        {/* Amenities */}
        <div className="card p-5">
          <h3 className="font-semibold text-sm text-[var(--dark)] mb-3">Amenities</h3>
          <div className="grid grid-cols-3 gap-2">
            {AMENITIES.map(a => (
              <label key={a.value} className="flex items-center gap-2 cursor-pointer text-sm text-[var(--dark)]">
                <input
                  type="checkbox"
                  checked={form.amenities.includes(a.value)}
                  onChange={() => toggleAmenity(a.value)}
                  className="rounded"
                />
                {a.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Creating...' : 'Create Property'}
          </button>
          <Link href="/dashboard/stays/properties" className="btn-secondary text-sm">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
