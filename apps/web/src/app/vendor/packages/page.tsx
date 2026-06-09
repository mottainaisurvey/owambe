'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { vendorsApi } from '@/lib/api';
import { formatNGN } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Loader2, Package } from 'lucide-react';

export default function VendorPackagesPage() {
  const [showModal, setShowModal] = useState(false);
  const [editPkg, setEditPkg] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['my-vendor-profile'],
    queryFn: () => vendorsApi.getMyProfile().then(r => r.data),
  });

  const packages = data?.vendor?.packages || [];

  async function handleDelete(packageId: string, packageName: string) {
    if (!confirm(`Delete "${packageName}"? This cannot be undone.`)) return;
    try {
      await vendorsApi.deletePackage(packageId);
      queryClient.invalidateQueries({ queryKey: ['my-vendor-profile'] });
      toast.success('Package deleted');
    } catch {
      toast.error('Failed to delete package');
    }
  }

  return (
    <div className="p-6 animate-fade-up">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="section-title">Your Packages</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Create clear pricing packages — clients can book or request quotes on them directly.
          </p>
        </div>
        <button onClick={() => { setEditPkg(null); setShowModal(true); }}
          className="btn-primary text-sm flex items-center gap-1.5">
          <Plus size={13} /> Add Package
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-[var(--muted)]" /></div>
      ) : packages.length === 0 ? (
        <div className="card text-center py-12">
          <Package size={36} className="mx-auto mb-3 text-[var(--border)]" />
          <div className="font-bold text-[var(--dark)] mb-1">No packages yet</div>
          <div className="text-sm text-[var(--muted)] mb-5">
            Add your first package to show clients clear pricing options
          </div>
          <button onClick={() => setShowModal(true)} className="btn-primary text-sm inline-flex items-center gap-1.5">
            <Plus size={13} /> Create Package
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {packages.map((pkg: any) => (
            <div key={pkg.id} className="card p-5 relative hover:shadow-card transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="font-bold text-base">{pkg.name}</div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditPkg(pkg); setShowModal(true); }}
                    className="p-1.5 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--dark)] transition-colors">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => handleDelete(pkg.id, pkg.name)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-[var(--muted)] hover:text-red-600 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {pkg.description && (
                <p className="text-xs text-[var(--muted)] mb-3 leading-relaxed">{pkg.description}</p>
              )}
              <div className="font-bold text-2xl text-[var(--accent)] mb-3">{formatNGN(pkg.price)}</div>
              {pkg.duration && (
                <div className="text-xs text-[var(--muted)] mb-3">⏱ {pkg.duration}</div>
              )}
              {pkg.includes?.length > 0 && (
                <div className="space-y-1.5">
                  {pkg.includes.map((inc: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-[var(--accent)] font-bold">✓</span>
                      <span className="text-[var(--mid)]">{inc}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-[var(--border)] flex gap-2">
                <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  pkg.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {pkg.isActive ? 'Active' : 'Inactive'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <PackageModal
          pkg={editPkg}
          onClose={() => setShowModal(false)}
          onSave={() => {
            setShowModal(false);
            queryClient.invalidateQueries({ queryKey: ['my-vendor-profile'] });
            toast.success(editPkg ? 'Package updated!' : 'Package created!');
          }}
        />
      )}
    </div>
  );
}

function PackageModal({ pkg, onClose, onSave }: any) {
  const [form, setForm] = useState({
    name: pkg?.name || '',
    description: pkg?.description || '',
    price: pkg?.price || '',
    duration: pkg?.duration || '',
    includes: pkg?.includes?.join('\n') || '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const includes = form.includes.split('\n').map((s: string) => s.trim()).filter(Boolean);
      const payload = { ...form, price: Number(form.price), includes };
      if (pkg) {
        await vendorsApi.updatePackage(pkg.id, payload);
      } else {
        await vendorsApi.addPackage(payload);
      }
      onSave();
    } finally { setIsSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-lg animate-fade-up">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h2 className="font-bold text-base">{pkg ? 'Edit Package' : 'New Package'}</h2>
          <button onClick={onClose} className="text-[var(--muted)] text-lg px-2">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Package Name *</label>
            <input className="input text-sm" required value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Essential Coverage, Premium Package" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input text-sm min-h-[60px] resize-none" value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Brief description of what's included..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Price (₦) *</label>
              <input type="number" required className="input text-sm" value={form.price}
                onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                placeholder="250000" />
            </div>
            <div>
              <label className="label">Duration</label>
              <input className="input text-sm" value={form.duration}
                onChange={e => setForm(p => ({ ...p, duration: e.target.value }))}
                placeholder="e.g. 6 hours, Full day" />
            </div>
          </div>
          <div>
            <label className="label">What's Included (one per line)</label>
            <textarea className="input text-sm min-h-[100px] resize-none font-mono" value={form.includes}
              onChange={e => setForm(p => ({ ...p, includes: e.target.value }))}
              placeholder={"Online gallery (200 edited photos)\n2 photographers\nDrone coverage\nSame-day highlights video"} />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {isSubmitting && <Loader2 size={13} className="animate-spin" />}
              {pkg ? 'Save Changes' : 'Create Package'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
