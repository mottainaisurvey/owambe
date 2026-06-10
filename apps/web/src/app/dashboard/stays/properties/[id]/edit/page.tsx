'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

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

type PropertyForm = {
  name: string;
  description: string;
  propertyType: string;
  city: string;
  state: string;
  country: string;
  address: string;
  coverImageUrl: string;
  checkInTime: string;
  checkOutTime: string;
  houseRules: string;
  cancellationPolicy: string;
  amenities: string[];
  isActive: boolean;
};

const EMPTY_FORM: PropertyForm = {
  name: '',
  description: '',
  propertyType: 'HOTEL',
  city: '',
  state: '',
  country: 'Nigeria',
  address: '',
  coverImageUrl: '',
  checkInTime: '14:00',
  checkOutTime: '12:00',
  houseRules: '',
  cancellationPolicy: '',
  amenities: [],
  isActive: true,
};

export default function EditPropertyPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const propertyId = params?.id;
  const [form, setForm] = useState<PropertyForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!propertyId) return;

    api.get(`/properties/host/${propertyId}`)
      .then(({ data }) => {
        const property = data.data;
        setForm({
          name: property.name ?? '',
          description: property.description ?? '',
          propertyType: property.propertyType ?? 'HOTEL',
          city: property.city ?? '',
          state: property.state ?? '',
          country: property.country ?? 'Nigeria',
          address: property.address ?? '',
          coverImageUrl: property.coverImageUrl ?? '',
          checkInTime: property.checkInTime ?? '',
          checkOutTime: property.checkOutTime ?? '',
          houseRules: property.houseRules ?? '',
          cancellationPolicy: property.cancellationPolicy ?? '',
          amenities: property.amenities ?? [],
          isActive: property.isActive ?? true,
        });
        setNotFound(false);
      })
      .catch((err) => {
        toast.error(err?.response?.data?.message ?? 'Failed to load property');
        setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [propertyId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = e.target;
    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      setForm(prev => ({ ...prev, [target.name]: target.checked }));
      return;
    }
    setForm(prev => ({ ...prev, [target.name]: target.value }));
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
    if (!propertyId) return;
    if (!form.name.trim() || !form.city.trim()) {
      toast.error('Property name and city are required');
      return;
    }

    setSaving(true);
    try {
      await api.put(`/properties/${propertyId}`, {
        ...form,
        description: form.description || null,
        state: form.state || null,
        address: form.address || null,
        coverImageUrl: form.coverImageUrl || null,
        checkInTime: form.checkInTime || null,
        checkOutTime: form.checkOutTime || null,
        houseRules: form.houseRules || null,
        cancellationPolicy: form.cancellationPolicy || null,
      });
      toast.success('Property updated successfully');
      router.push(`/dashboard/stays/properties/${propertyId}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to update property');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto flex items-center justify-center min-h-[360px]">
        <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/dashboard/stays/properties" className="inline-flex items-center gap-2 text-sm text-[var(--mid)] hover:text-[var(--dark)] mb-6">
          <ArrowLeft size={16} /> Back to properties
        </Link>
        <div className="bg-white border border-[var(--border)] rounded-xl p-8 text-center">
          <h1 className="font-semibold text-[var(--dark)] mb-1">Property not found</h1>
          <p className="text-sm text-[var(--mid)]">This property may have been removed, or you may not have access to edit it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-up">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/dashboard/stays/properties/${propertyId}`} className="text-[var(--muted)] hover:text-[var(--dark)] transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h2 className="section-title">Edit Property</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">Update the stay details guests and channel partners rely on.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-sm text-[var(--dark)]">Basic Information</h3>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">Property Name *</label>
            <input name="name" value={form.name} onChange={handleChange} placeholder="e.g. Lagos Luxury Suites" className="input w-full" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">Property Type *</label>
            <select name="propertyType" value={form.propertyType} onChange={handleChange} className="input w-full">
              {PROPERTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">Description</label>
            <textarea name="description" value={form.description} onChange={handleChange} placeholder="Describe your property — highlight what makes it special..." rows={4} className="input w-full resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">Cover Image URL</label>
            <input name="coverImageUrl" value={form.coverImageUrl} onChange={handleChange} placeholder="https://..." className="input w-full" />
          </div>
        </div>

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
            <textarea name="houseRules" value={form.houseRules} onChange={handleChange} placeholder="e.g. No smoking, No pets, Quiet hours after 10pm..." rows={3} className="input w-full resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">Cancellation Policy</label>
            <textarea name="cancellationPolicy" value={form.cancellationPolicy} onChange={handleChange} placeholder="e.g. Free cancellation up to 48 hours before check-in..." rows={3} className="input w-full resize-none" />
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-sm text-[var(--dark)] mb-3">Amenities</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {AMENITIES.map(a => (
              <label key={a.value} className="flex items-center gap-2 cursor-pointer text-sm text-[var(--dark)]">
                <input type="checkbox" checked={form.amenities.includes(a.value)} onChange={() => toggleAmenity(a.value)} className="rounded" />
                {a.label}
              </label>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--dark)]">
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} className="rounded" />
            Active and visible to guests
          </label>
          <p className="text-xs text-[var(--muted)] mt-1">Inactive properties are hidden from guest-facing reservation surfaces.</p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <Link href={`/dashboard/stays/properties/${propertyId}`} className="btn-secondary text-sm">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
