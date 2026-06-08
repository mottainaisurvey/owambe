'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { vendorsApi, api } from '@/lib/api';
import { NIGERIAN_CITIES, NIGERIAN_STATES } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Loader2, CheckCircle, AlertCircle, Upload, Sparkles, X, Plus } from 'lucide-react';

// ─── Registration categories (OWB-VENDOR-CATEGORY-DROPDOWN-DISPLAY-GAP-01) ────
// Fetches all 41 active categories from the API using context=registration,
// bypassing the supply-density gate that is only appropriate for consumer discovery.
function useRegistrationCategories() {
  return useQuery({
    queryKey: ['vendor-categories-registration'],
    queryFn: () =>
      api
        .get('/vendors/categories', { params: { context: 'registration' } })
        .then((r) => (r.data.allCategories ?? []) as Array<{ id: string; key: string; label: string }>),
    staleTime: 5 * 60 * 1000, // 5 min — category list is stable
  });
}

const TABS = ['Profile', 'Portfolio', 'Bank Account', 'Verification', 'Tags'];

// ─── Tags API (AC-2 vendor-self tag management) ───────────────────────────────
export const tagsApi = {
  suggest: (q: string) => api.get('/vendors/tags/suggest', { params: { q } }),
  addTag: (label: string) => api.post('/vendors/me/tags', { label }),
  removeTag: (tagId: string) => api.delete(`/vendors/me/tags/${tagId}`),
};

export default function VendorSettingsPage() {
  const [activeTab, setActiveTab] = useState('Profile');
  const queryClient = useQueryClient();

  const { data: profileData, isLoading } = useQuery({
    queryKey: ['vendor-profile'],
    queryFn: () => vendorsApi.getMyProfile().then(r => r.data),
    // B1-vendor-not-found: API now returns 200 with vendor:null for new vendors.
    // No error boundary needed; vendor===null is handled in each tab component.
    retry: false,
  });

  const vendor = profileData?.vendor ?? null;
  const isNewVendor = profileData?.isNewVendor ?? (!isLoading && profileData !== undefined && !vendor);

  return (
    <div className="p-6 animate-fade-up">
      {/* New vendor onboarding banner (B1-vendor-not-found) */}
      {!isLoading && isNewVendor && (
        <div className="mb-5 p-4 rounded-xl flex items-center gap-3 bg-[var(--pill)] border border-[rgba(108,43,217,0.2)]">
          <Sparkles size={18} className="text-[var(--accent)] shrink-0" />
          <div className="text-sm">
            <strong className="text-[var(--accent)]">Welcome to your Vendor Portal!</strong>{' '}
            Complete your business profile below to go live and start receiving bookings.
          </div>
        </div>
      )}

      {/* Verification banner */}
      {vendor && vendor.status !== 'VERIFIED' && (
        <div className={`mb-5 p-4 rounded-xl flex items-center gap-3 ${
          vendor.status === 'PENDING' ? 'bg-yellow-50 border border-yellow-200' :
          vendor.status === 'IN_REVIEW' ? 'bg-blue-50 border border-blue-200' :
          'bg-red-50 border border-red-200'
        }`}>
          <AlertCircle size={18} className={
            vendor.status === 'PENDING' ? 'text-yellow-600' :
            vendor.status === 'IN_REVIEW' ? 'text-blue-600' : 'text-red-600'
          } />
          <div className="text-sm">
            <strong>Profile {vendor.status === 'PENDING' ? 'under review' : vendor.status.toLowerCase()}.</strong>{' '}
            {vendor.status === 'PENDING' && 'Our team will verify your profile within 24-48 hours.'}
            {vendor.status === 'IN_REVIEW' && 'We\'re reviewing your documents. You\'ll hear from us soon.'}
            {vendor.status === 'REJECTED' && `Rejected: ${vendor.rejectionReason}. Please update and resubmit.`}
          </div>
        </div>
      )}
      {vendor?.status === 'VERIFIED' && (
        <div className="mb-5 p-4 rounded-xl flex items-center gap-3 bg-green-50 border border-green-200">
          <CheckCircle size={18} className="text-green-600" />
          <div className="text-sm text-green-700">
            <strong>Verified vendor ✓</strong> Your profile is live and appearing in search results.
            {vendor.launchBonusActive && <span className="ml-2 bg-green-600 text-white px-2 py-0.5 rounded-full text-xs">🎉 0% commission active</span>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-white border border-[var(--border)] rounded-lg p-1 w-fit">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === tab ? 'bg-[var(--dark)] text-white' : 'text-[var(--muted)] hover:text-[var(--dark)]'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--muted)]" />
        </div>
      ) : (
        <>
          {activeTab === 'Profile' && <ProfileTab vendor={vendor} onSave={() => queryClient.invalidateQueries({ queryKey: ['vendor-profile'] })} />}
          {activeTab === 'Portfolio' && <PortfolioTab vendor={vendor} />}
          {activeTab === 'Bank Account' && <BankTab vendor={vendor} />}
          {activeTab === 'Verification' && <VerificationTab vendor={vendor} />}
          {activeTab === 'Tags' && <TagsTab vendor={vendor} onSave={() => queryClient.invalidateQueries({ queryKey: ['vendor-profile'] })} />}
        </>
      )}
    </div>
  );
}

function ProfileTab({ vendor, onSave }: any) {
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const { data: registrationCategories = [], isLoading: categoriesLoading } = useRegistrationCategories();
  const { register, handleSubmit, setValue, formState: { isSubmitting } } = useForm({
    defaultValues: {
      businessName: vendor?.businessName || '',
      category: vendor?.category || '',
      description: vendor?.description || '',
      shortBio: vendor?.shortBio || '',
      city: vendor?.city || '',
      state: vendor?.state || '',
      address: vendor?.address || '',
      minPrice: vendor?.minPrice || '',
      maxPrice: vendor?.maxPrice || '',
      isInstantBook: vendor?.isInstantBook || false,
      serviceRadius: vendor?.serviceRadius || 30,
    }
  });

  async function onSubmit(data: any) {
    try {
      if (vendor) {
        await vendorsApi.update(data);
      } else {
        await vendorsApi.create(data);
      }
      toast.success('Profile saved!');
      onSave();
    } catch { /* handled */ }
  }

  async function generateBio() {
    const name = (document.getElementById('businessName') as HTMLInputElement)?.value;
    const category = (document.getElementById('category') as HTMLSelectElement)?.value;
    if (!name || !category) { toast.error('Enter business name and category first'); return; }
    setIsAiGenerating(true);
    try {
      const res = await vendorsApi.generateBio({
        businessName: name, category,
        details: 'Lagos-based vendor, professional service provider'
      });
      setValue('description', res.data.description);
      setValue('shortBio', res.data.shortBio);
      toast.success('✨ AI bio generated!');
    } finally { setIsAiGenerating(false); }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="form-card">
        <div className="text-sm font-bold mb-4">Business Information</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Business Name *</label>
            <input id="businessName" className="input" {...register('businessName')} placeholder="e.g. Clicks & Flicks Photography" />
          </div>
          <div>
            <label className="label">Category *</label>
            <select id="category" className="input" {...register('category')} disabled={categoriesLoading}>
              <option value="">{categoriesLoading ? 'Loading categories…' : 'Select category'}</option>
              {registrationCategories.map((cat) => (
                <option key={cat.key} value={cat.key}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">City</label>
            <select className="input" {...register('city')}>
              {NIGERIAN_CITIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Address</label>
            <input className="input" {...register('address')} placeholder="Street address" />
          </div>
          <div>
            <label className="label">Min Price (₦)</label>
            <input type="number" className="input" {...register('minPrice')} placeholder="100000" />
          </div>
          <div>
            <label className="label">Max Price (₦)</label>
            <input type="number" className="input" {...register('maxPrice')} placeholder="5000000" />
          </div>
          <div>
            <label className="label">Service Radius (km)</label>
            <input type="number" className="input" {...register('serviceRadius')} />
          </div>
          <div className="flex items-center gap-3 pt-5">
            <input type="checkbox" id="instantBook" className="w-4 h-4 accent-[var(--accent)]" {...register('isInstantBook')} />
            <label htmlFor="instantBook" className="text-sm text-[var(--mid)] cursor-pointer">
              Enable Instant Booking
            </label>
          </div>
        </div>
      </div>

      <div className="form-card">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-bold">Profile Description</div>
          <button type="button" onClick={generateBio} disabled={isAiGenerating}
            className="flex items-center gap-1.5 text-xs text-[var(--accent)] font-semibold hover:underline">
            {isAiGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            AI Generate
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label">Short Bio (tagline)</label>
            <input className="input" {...register('shortBio')} placeholder="One sentence about your service" />
          </div>
          <div>
            <label className="label">Full Description</label>
            <textarea className="input min-h-[120px] resize-none" {...register('description')}
              placeholder="Tell potential clients what makes you special..." />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={isSubmitting} className="btn-primary flex items-center gap-2">
          {isSubmitting && <Loader2 size={14} className="animate-spin" />}
          Save Profile
        </button>
      </div>
    </form>
  );
}

function PortfolioTab({ vendor }: any) {
  const [uploading, setUploading] = useState(false);
  const photos = vendor?.portfolioItems || [];

  // B1-vendor-not-found: guard for new vendors who have not yet created a profile
  if (!vendor) {
    return (
      <div className="form-card flex flex-col items-center py-10 text-center">
        <AlertCircle size={28} className="text-[var(--muted)] mb-3" />
        <div className="text-sm font-semibold text-[var(--dark)] mb-1">Profile required</div>
        <p className="text-xs text-[var(--muted)]">Complete and save your Profile tab first before adding portfolio photos.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="form-card">
        <div className="text-sm font-bold mb-4">Portfolio Photos</div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {photos.map((p: any) => (
            <div key={p.id} className="aspect-square rounded-xl overflow-hidden bg-[var(--bg)] border border-[var(--border)] relative group">
              <img src={p.url} alt={p.caption || ''} className="w-full h-full object-cover" />
              {p.isMain && (
                <div className="absolute top-2 left-2 bg-[var(--accent)] text-white text-[9px] px-2 py-0.5 rounded-full font-bold">
                  Main
                </div>
              )}
            </div>
          ))}
          <label className={`aspect-square rounded-xl border-2 border-dashed border-[var(--border)] flex flex-col items-center justify-center cursor-pointer hover:border-[var(--accent)] hover:bg-[var(--pill)] transition-all ${uploading ? 'opacity-50' : ''}`}>
            {uploading ? <Loader2 size={24} className="animate-spin text-[var(--accent)]" /> : (
              <>
                <Upload size={24} className="text-[var(--muted)] mb-2" />
                <span className="text-xs text-[var(--muted)]">Upload photos</span>
              </>
            )}
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={async (e) => {
                if (!e.target.files?.length) return;
                setUploading(true);
                try {
                  const { uploadApi } = await import('@/lib/api');
                  await uploadApi.portfolio(Array.from(e.target.files));
                  toast.success('Photos uploaded!');
                } finally { setUploading(false); }
              }} />
          </label>
        </div>
        <p className="text-xs text-[var(--muted)]">Upload up to 10 photos. First photo becomes your main portfolio image. JPG/PNG, max 10MB each.</p>
      </div>
    </div>
  );
}

function BankTab({ vendor }: any) {
  const [isVerifying, setIsVerifying] = useState(false);
  const { register, handleSubmit, formState: { isSubmitting } } = useForm();

  // B1-vendor-not-found: guard for new vendors who have not yet created a profile
  if (!vendor) {
    return (
      <div className="form-card flex flex-col items-center py-10 text-center">
        <AlertCircle size={28} className="text-[var(--muted)] mb-3" />
        <div className="text-sm font-semibold text-[var(--dark)] mb-1">Profile required</div>
        <p className="text-xs text-[var(--muted)]">Complete and save your Profile tab first before connecting a bank account.</p>
      </div>
    );
  }

  async function onSubmit(data: any) {
    setIsVerifying(true);
    try {
      await vendorsApi.setupBank(data);
      toast.success('Bank account connected! You can now receive payouts.');
    } finally { setIsVerifying(false); }
  }

  if (vendor?.paystackSubAccountCode) {
    return (
      <div className="form-card">
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle size={20} className="text-green-500" />
          <div className="text-sm font-bold text-green-700">Bank account connected</div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-[var(--muted)]">Account Name</span><span className="font-semibold">{vendor.bankAccountName}</span></div>
          <div className="flex justify-between"><span className="text-[var(--muted)]">Account Number</span><span className="font-semibold">{vendor.bankAccountNumber}</span></div>
          <div className="flex justify-between"><span className="text-[var(--muted)]">Subaccount Code</span><span className="font-mono text-xs">{vendor.paystackSubAccountCode}</span></div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="form-card">
        <div className="text-sm font-bold mb-1">Connect Bank Account</div>
        <p className="text-xs text-[var(--muted)] mb-4">Your payouts will be sent here. We use Paystack to securely verify your account.</p>
        <div className="space-y-3">
          <div>
            <label className="label">Bank</label>
            <select className="input" {...register('bankCode', { required: true })}>
              <option value="">Select your bank</option>
              {NIGERIAN_BANKS.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Account Number</label>
            <input className="input" maxLength={10} placeholder="10-digit account number" {...register('accountNumber', { required: true, minLength: 10, maxLength: 10 })} />
          </div>
        </div>
        <button type="submit" disabled={isSubmitting || isVerifying}
          className="btn-primary mt-4 flex items-center gap-2">
          {(isSubmitting || isVerifying) && <Loader2 size={14} className="animate-spin" />}
          Verify & Connect Account
        </button>
      </div>
    </form>
  );
}

function VerificationTab({ vendor }: any) {
  return (
    <div className="form-card">
      <div className="text-sm font-bold mb-4">Verification Checklist</div>
      {[
        { label: 'Business name & category', done: !!vendor?.businessName },
        { label: 'Profile description & bio', done: !!vendor?.description },
        { label: 'At least 3 portfolio photos', done: (vendor?.portfolioItems?.length || 0) >= 3 },
        { label: 'Pricing information added', done: !!vendor?.minPrice },
        { label: 'Bank account connected', done: !!vendor?.paystackSubAccountCode },
        { label: 'Profile submitted for review', done: vendor?.status !== 'PENDING' },
        { label: 'Profile verified by Owambe team', done: vendor?.status === 'VERIFIED' },
      ].map((item) => (
        <div key={item.label} className="flex items-center gap-3 py-2.5 border-b border-[var(--border)] last:border-0">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${item.done ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}>
            {item.done && <span className="text-white text-[10px] font-bold">✓</span>}
          </div>
          <span className={`text-sm ${item.done ? 'text-[var(--dark)]' : 'text-[var(--muted)]'}`}>{item.label}</span>
        </div>
      ))}
      {vendor?.status === 'PENDING' && (
        <div className="mt-4 p-3 bg-yellow-50 rounded-lg text-xs text-yellow-700">
          ⏳ Your profile is under review. Our team will verify within 24-48 hours.
        </div>
      )}
    </div>
  );
}

const NIGERIAN_BANKS = [
  { name: 'Access Bank', code: '044' },
  { name: 'Zenith Bank', code: '057' },
  { name: 'GTBank', code: '058' },
  { name: 'First Bank', code: '011' },
  { name: 'UBA', code: '033' },
  { name: 'Kuda Bank', code: '090267' },
  { name: 'OPay', code: '100004' },
  { name: 'Moniepoint', code: '50515' },
  { name: 'Palmpay', code: '100033' },
  { name: 'Stanbic IBTC', code: '221' },
  { name: 'Fidelity Bank', code: '070' },
  { name: 'Polaris Bank', code: '076' },
  { name: 'Sterling Bank', code: '232' },
  { name: 'Wema Bank', code: '035' },
];

// ─── TagsTab (AC-2: vendor-self tag management) ───────────────────────────────
function TagsTab({ vendor, onSave }: { vendor: any; onSave: () => void }) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const queryClient = useQueryClient();

  // B1-vendor-not-found: guard for new vendors who have not yet created a profile
  if (!vendor) {
    return (
      <div className="form-card flex flex-col items-center py-10 text-center">
        <AlertCircle size={28} className="text-[var(--muted)] mb-3" />
        <div className="text-sm font-semibold text-[var(--dark)] mb-1">Profile required</div>
        <p className="text-xs text-[var(--muted)]">Complete and save your Profile tab first before adding service tags.</p>
      </div>
    );
  }

  const currentTags: any[] = vendor?.tags || [];

  async function fetchSuggestions(q: string) {
    if (!q.trim()) { setSuggestions([]); return; }
    try {
      const res = await tagsApi.suggest(q);
      setSuggestions(res.data.suggestions || []);
    } catch { setSuggestions([]); }
  }

  async function addTag(label: string) {
    if (!label.trim()) return;
    setIsAdding(true);
    try {
      await tagsApi.addTag(label.trim());
      toast.success(`Tag "${label}" added`);
      setInput('');
      setSuggestions([]);
      onSave();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to add tag');
    } finally { setIsAdding(false); }
  }

  async function removeTag(tagId: string, label: string) {
    try {
      await tagsApi.removeTag(tagId);
      toast.success(`Tag "${label}" removed`);
      onSave();
    } catch {
      toast.error('Failed to remove tag');
    }
  }

  return (
    <div className="form-card" data-testid="tags-tab">
      <div className="text-sm font-bold mb-1">Service Tags</div>
      <p className="text-xs text-[var(--muted)] mb-4">
        Add up to 10 tags that describe your specialty (e.g. "outdoor weddings", "corporate events").
        Tags help clients find you when browsing by style or occasion.
      </p>

      {/* Current tags */}
      {currentTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4" role="list" aria-label="Current tags">
          {currentTags.map((tag: any) => (
            <div key={tag.id} role="listitem"
              className="flex items-center gap-1.5 bg-[var(--pill)] border border-[var(--border)] rounded-full px-3 py-1 text-xs font-medium text-[var(--dark)]">
              🏷 {tag.label}
              <button
                onClick={() => removeTag(tag.id, tag.label)}
                aria-label={`Remove tag ${tag.label}`}
                className="text-[var(--muted)] hover:text-red-500 transition-colors ml-0.5">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {currentTags.length === 0 && (
        <p className="text-xs text-[var(--muted)] italic mb-4" data-testid="no-tags-message">
          No tags yet. Add your first tag below.
        </p>
      )}

      {/* Add tag input */}
      {currentTags.length < 10 && (
        <div className="relative">
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder="Type a tag and press Enter or click +"
              value={input}
              onChange={e => { setInput(e.target.value); fetchSuggestions(e.target.value); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(input); } }}
              data-testid="tag-input"
            />
            <button
              onClick={() => addTag(input)}
              disabled={isAdding || !input.trim()}
              className="btn-primary px-3 flex items-center gap-1"
              aria-label="Add tag"
              data-testid="add-tag-button">
              {isAdding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            </button>
          </div>

          {/* Suggestions dropdown */}
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[var(--border)] rounded-lg shadow-lg z-10"
              data-testid="tag-suggestions">
              {suggestions.map((s: any) => (
                <button key={s.id} onClick={() => addTag(s.label)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--pill)] transition-colors flex items-center justify-between">
                  <span>🏷 {s.label}</span>
                  <span className="text-[var(--muted)]">{s.usageCount} vendors</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {currentTags.length >= 10 && (
        <p className="text-xs text-[var(--muted)]">Maximum 10 tags reached.</p>
      )}
    </div>
  );
}
