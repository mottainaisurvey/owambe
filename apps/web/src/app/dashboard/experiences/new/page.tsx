'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

const EXPERIENCE_TYPES = [
  { value: 'CULTURAL_TOUR', label: 'Cultural Tour' },
  { value: 'FOOD_TASTING', label: 'Food Tasting' },
  { value: 'ADVENTURE', label: 'Adventure' },
  { value: 'WELLNESS_SPA', label: 'Wellness & Spa' },
  { value: 'NIGHTLIFE', label: 'Nightlife' },
  { value: 'WORKSHOP', label: 'Workshop' },
  { value: 'SPORTS', label: 'Sports' },
  { value: 'SIGHTSEEING', label: 'Sightseeing' },
  { value: 'PRIVATE_DINING', label: 'Private Dining' },
  { value: 'MUSIC_PERFORMANCE', label: 'Music Performance' },
];

const LANGUAGES = ['English', 'Yoruba', 'Igbo', 'Hausa', 'Pidgin', 'French', 'Spanish'];

export default function AddExperiencePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    experienceType: 'CULTURAL_TOUR',
    city: '',
    state: '',
    country: 'Nigeria',
    address: '',
    durationMinutes: '',
    maxGroupSize: '',
    minGroupSize: '1',
    pricePerPerson: '',
    currency: 'NGN',
    coverImageUrl: '',
    meetingDetails: '',
  });

  const [includes, setIncludes] = useState<string[]>([]);
  const [requirements, setRequirements] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>(['English']);
  const [newInclude, setNewInclude] = useState('');
  const [newRequirement, setNewRequirement] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const addInclude = () => {
    const val = newInclude.trim();
    if (val && !includes.includes(val)) {
      setIncludes(prev => [...prev, val]);
      setNewInclude('');
    }
  };

  const addRequirement = () => {
    const val = newRequirement.trim();
    if (val && !requirements.includes(val)) {
      setRequirements(prev => [...prev, val]);
      setNewRequirement('');
    }
  };

  const toggleLanguage = (lang: string) => {
    setLanguages(prev =>
      prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.experienceType || !form.city.trim() || !form.pricePerPerson) {
      toast.error('Name, experience type, city, and price per person are required');
      return;
    }
    if (languages.length === 0) {
      toast.error('At least one language is required');
      return;
    }
    setSaving(true);
    try {
      await api.post('/experiences', {
        ...form,
        durationMinutes: form.durationMinutes ? parseInt(form.durationMinutes) : undefined,
        maxGroupSize: form.maxGroupSize ? parseInt(form.maxGroupSize) : undefined,
        minGroupSize: parseInt(form.minGroupSize) || 1,
        pricePerPerson: parseFloat(form.pricePerPerson),
        includes,
        requirements,
        languages,
        coverImageUrl: form.coverImageUrl || undefined,
        meetingDetails: form.meetingDetails || undefined,
      });
      toast.success('Experience created! It has been saved as a draft and submitted for platform review.');
      router.push('/dashboard/experiences/list');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? err?.response?.data?.error ?? 'Failed to create experience');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/dashboard/experiences/list"
          className="p-2 rounded-lg hover:bg-[var(--surface)] text-[var(--mid)]"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[var(--dark)]">Add Experience</h1>
          <p className="text-sm text-[var(--mid)] mt-0.5">
            Experiences are saved as drafts and require platform approval before going live.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white border border-[var(--border)] rounded-xl p-5">
          <h2 className="font-semibold text-[var(--dark)] mb-4">Basic Information</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--dark)] mb-1">
                Experience Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. Lagos Island Food Tour"
                className="input w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--dark)] mb-1">
                Experience Type <span className="text-red-500">*</span>
              </label>
              <select name="experienceType" value={form.experienceType} onChange={handleChange} className="input w-full">
                {EXPERIENCE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--dark)] mb-1">Description</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={4}
                placeholder="Describe what guests will experience, see, taste, and do..."
                className="input w-full resize-none"
              />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="bg-white border border-[var(--border)] rounded-xl p-5">
          <h2 className="font-semibold text-[var(--dark)] mb-4">Location</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--dark)] mb-1">
                City <span className="text-red-500">*</span>
              </label>
              <input type="text" name="city" value={form.city} onChange={handleChange} placeholder="Lagos" className="input w-full" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--dark)] mb-1">State</label>
              <input type="text" name="state" value={form.state} onChange={handleChange} placeholder="Lagos State" className="input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--dark)] mb-1">Country</label>
              <input type="text" name="country" value={form.country} onChange={handleChange} className="input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--dark)] mb-1">Address / Meeting Area</label>
              <input type="text" name="address" value={form.address} onChange={handleChange} placeholder="Street address or area" className="input w-full" />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-[var(--dark)] mb-1">
              Meeting Details
            </label>
            <textarea
              name="meetingDetails"
              value={form.meetingDetails}
              onChange={handleChange}
              rows={2}
              placeholder="Where exactly should guests meet you? e.g. 'Meet at the main gate of Freedom Park, Broad Street entrance'"
              className="input w-full resize-none"
            />
            <p className="text-xs text-[var(--mid)] mt-1">Shared with guests upon booking confirmation.</p>
          </div>
        </div>

        {/* Pricing & Capacity */}
        <div className="bg-white border border-[var(--border)] rounded-xl p-5">
          <h2 className="font-semibold text-[var(--dark)] mb-4">Pricing &amp; Capacity</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--dark)] mb-1">
                Price Per Person <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <select name="currency" value={form.currency} onChange={handleChange} className="input w-24 shrink-0">
                  <option value="NGN">NGN</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
                <input
                  type="number"
                  name="pricePerPerson"
                  value={form.pricePerPerson}
                  onChange={handleChange}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="input flex-1"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--dark)] mb-1">Duration (minutes)</label>
              <input
                type="number"
                name="durationMinutes"
                value={form.durationMinutes}
                onChange={handleChange}
                placeholder="e.g. 120 for 2 hours"
                min="15"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--dark)] mb-1">Min Group Size</label>
              <input
                type="number"
                name="minGroupSize"
                value={form.minGroupSize}
                onChange={handleChange}
                min="1"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--dark)] mb-1">Max Group Size</label>
              <input
                type="number"
                name="maxGroupSize"
                value={form.maxGroupSize}
                onChange={handleChange}
                placeholder="Leave blank for unlimited"
                min="1"
                className="input w-full"
              />
            </div>
          </div>
        </div>

        {/* What's Included */}
        <div className="bg-white border border-[var(--border)] rounded-xl p-5">
          <h2 className="font-semibold text-[var(--dark)] mb-4">What&apos;s Included</h2>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newInclude}
              onChange={e => setNewInclude(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addInclude(); } }}
              placeholder="e.g. Transport, Lunch, Guide"
              className="input flex-1"
            />
            <button type="button" onClick={addInclude} className="btn-secondary px-3 py-2">
              <Plus size={16} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {includes.map(item => (
              <span key={item} className="inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                {item}
                <button type="button" onClick={() => setIncludes(prev => prev.filter(i => i !== item))}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Requirements */}
        <div className="bg-white border border-[var(--border)] rounded-xl p-5">
          <h2 className="font-semibold text-[var(--dark)] mb-4">Guest Requirements</h2>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newRequirement}
              onChange={e => setNewRequirement(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRequirement(); } }}
              placeholder="e.g. Comfortable shoes, Valid ID"
              className="input flex-1"
            />
            <button type="button" onClick={addRequirement} className="btn-secondary px-3 py-2">
              <Plus size={16} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {requirements.map(item => (
              <span key={item} className="inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                {item}
                <button type="button" onClick={() => setRequirements(prev => prev.filter(r => r !== item))}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Languages */}
        <div className="bg-white border border-[var(--border)] rounded-xl p-5">
          <h2 className="font-semibold text-[var(--dark)] mb-4">Languages Offered</h2>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map(lang => (
              <button
                key={lang}
                type="button"
                onClick={() => toggleLanguage(lang)}
                className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                  languages.includes(lang)
                    ? 'bg-[var(--accent3)] text-white border-[var(--accent3)]'
                    : 'bg-white text-[var(--mid)] border-[var(--border)] hover:border-[var(--accent3)]'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        {/* Cover Image */}
        <div className="bg-white border border-[var(--border)] rounded-xl p-5">
          <h2 className="font-semibold text-[var(--dark)] mb-4">Cover Image</h2>
          <input
            type="url"
            name="coverImageUrl"
            value={form.coverImageUrl}
            onChange={handleChange}
            placeholder="https://... (image URL)"
            className="input w-full"
          />
          <p className="text-xs text-[var(--mid)] mt-1">Image upload coming in Phase B. Paste a direct image URL for now.</p>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between pt-2">
          <Link href="/dashboard/experiences/list" className="btn-secondary text-sm px-5 py-2">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex items-center gap-2 text-sm px-6 py-2 disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : null}
            {saving ? 'Saving...' : 'Save as Draft'}
          </button>
        </div>
      </form>
    </div>
  );
}
