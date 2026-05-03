'use client';
import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Tag, Home, Compass } from 'lucide-react';
import { api } from '@/lib/api';

type CategoryType = 'vendor' | 'property' | 'experience';

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  isActive: boolean;
  sortOrder: number;
}

const TYPE_CONFIG = {
  vendor: { label: 'Vendor Categories', icon: Tag, color: 'var(--accent)' },
  property: { label: 'Property Types', icon: Home, color: 'var(--accent2)' },
  experience: { label: 'Experience Types', icon: Compass, color: 'var(--accent3)' },
};

export default function AdminCategoriesPage() {
  const [activeType, setActiveType] = useState<CategoryType>('vendor');
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', description: '', icon: '', sortOrder: 0 });
  const [error, setError] = useState('');

  const endpointMap: Record<CategoryType, string> = {
    vendor: '/admin/categories/vendor',
    property: '/admin/categories/property',
    experience: '/admin/categories/experience',
  };

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const res = await api.get(endpointMap[activeType]);
      setCategories(res.data.categories || []);
    } catch {
      setCategories([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchCategories(); }, [activeType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editTarget) {
        await api.put(`${endpointMap[activeType]}/${editTarget.id}`, form);
      } else {
        await api.post(endpointMap[activeType], form);
      }
      setShowForm(false);
      setEditTarget(null);
      setForm({ name: '', description: '', icon: '', sortOrder: 0 });
      fetchCategories();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save category');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category?')) return;
    try {
      await api.delete(`${endpointMap[activeType]}/${id}`);
      fetchCategories();
    } catch {
      alert('Failed to delete category');
    }
  };

  const handleEdit = (cat: Category) => {
    setEditTarget(cat);
    setForm({ name: cat.name, description: cat.description || '', icon: cat.icon || '', sortOrder: cat.sortOrder });
    setShowForm(true);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--dark)]">Category Management</h1>
          <p className="text-sm text-[var(--mid)] mt-0.5">Manage vendor categories, property types, and experience types</p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setForm({ name: '', description: '', icon: '', sortOrder: 0 }); setShowForm(true); }}
          className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
        >
          <Plus size={14} />
          Add Category
        </button>
      </div>

      {/* Type Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[var(--border)] pb-0">
        {(Object.entries(TYPE_CONFIG) as [CategoryType, typeof TYPE_CONFIG.vendor][]).map(([type, config]) => (
          <button
            key={type}
            onClick={() => setActiveType(type)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeType === type
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--mid)] hover:text-[var(--dark)]'
            }`}
          >
            <config.icon size={14} />
            {config.label}
          </button>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-[var(--border)] rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-[var(--dark)] mb-4">{editTarget ? 'Edit Category' : 'New Category'}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--mid)] mb-1">Name *</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                placeholder="e.g. Photography"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--mid)] mb-1">Icon (emoji or name)</label>
              <input
                value={form.icon}
                onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                placeholder="📷"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-[var(--mid)] mb-1">Description</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
                placeholder="Short description"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--mid)] mb-1">Sort Order</label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            {error && <div className="col-span-2 text-red-500 text-xs">{error}</div>}
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-[var(--mid)] hover:text-[var(--dark)] transition-colors">
                Cancel
              </button>
              <button type="submit" className="btn-primary text-sm px-4 py-2">
                {editTarget ? 'Save Changes' : 'Create Category'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Category List */}
      {isLoading ? (
        <div className="text-center py-12 text-[var(--mid)]">Loading...</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-12 text-[var(--mid)]">
          <Tag size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No categories yet. Add your first one above.</p>
        </div>
      ) : (
        <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg)] border-b border-[var(--border)]">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--mid)] uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--mid)] uppercase tracking-wide">Slug</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--mid)] uppercase tracking-wide">Description</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-[var(--mid)] uppercase tracking-wide">Order</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-[var(--mid)] uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-[var(--bg)] transition-colors">
                  <td className="px-4 py-3 font-medium text-[var(--dark)]">
                    {cat.icon && <span className="mr-2">{cat.icon}</span>}
                    {cat.name}
                  </td>
                  <td className="px-4 py-3 text-[var(--mid)] font-mono text-xs">{cat.slug}</td>
                  <td className="px-4 py-3 text-[var(--mid)] max-w-[200px] truncate">{cat.description || '—'}</td>
                  <td className="px-4 py-3 text-center text-[var(--mid)]">{cat.sortOrder}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      cat.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {cat.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => handleEdit(cat)} className="p-1.5 text-[var(--mid)] hover:text-[var(--accent)] transition-colors rounded">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => handleDelete(cat.id)} className="p-1.5 text-[var(--mid)] hover:text-red-500 transition-colors rounded">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
