'use client';

import { useState, useEffect, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { vendorsApi } from '@/lib/api';
import { formatNGN } from '@/lib/utils';
import Link from 'next/link';
import { Search, Star, MapPin, Zap, Tag, X, ChevronRight } from 'lucide-react';

// ─── Mode metadata ─────────────────────────────────────────────────────────────
const MODES = [
  { key: 'EVENTS', label: 'Events vendors', emoji: '🎉', description: 'Photographers, caterers, DJs, decorators and more for your events' },
  { key: 'STAYS', label: 'Stays vendors', emoji: '🏡', description: 'Venues, accommodation, and hospitality services' },
  { key: 'EXPERIENCES', label: 'Experiences vendors', emoji: '✨', description: 'Entertainment, activities, and unique experience providers' },
];

// ─── Wrapper with Suspense for useSearchParams ────────────────────────────────
export default function VendorsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" /></div>}>
      <VendorsPageInner />
    </Suspense>
  );
}

function VendorsPageInner() {
  const searchParams = useSearchParams();
  const categoryKey = searchParams.get('category');
  const tagsParam = searchParams.get('tags') || '';

  if (categoryKey) {
    return <CategoryDetailView categoryKey={categoryKey} tagsParam={tagsParam} />;
  }

  // AC-2: When navigating from tag chip click (/vendors?tags=<tag>), show tag-filtered discover view
  if (tagsParam) {
    return <TagFilteredView tagsParam={tagsParam} />;
  }

  return <ModeAffinityLanding />;
}

// ─── Tag-filtered view (AC-2: click navigation from tag chip) ─────────────────
function TagFilteredView({ tagsParam }: { tagsParam: string }) {
  const router = useRouter();
  const [selectedTags, setSelectedTags] = useState<string[]>(
    tagsParam ? tagsParam.split(',').filter(Boolean) : []
  );

  useEffect(() => {
    if (selectedTags.length > 0) {
      router.replace(`/vendors?tags=${selectedTags.join(',')}`, { scroll: false });
    } else {
      router.replace('/vendors', { scroll: false });
    }
  }, [selectedTags, router]);

  const { data: vendorData, isLoading } = useQuery({
    queryKey: ['discover-by-tags', selectedTags],
    queryFn: () => vendorsApi.discover({
      tags: selectedTags.length > 0 ? selectedTags.join(',') : undefined,
    }).then(r => r.data),
  });

  const vendors: any[] = vendorData?.vendors || [];

  function removeTag(label: string) {
    setSelectedTags(prev => prev.filter(t => t !== label));
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      <div className="flex items-center gap-2 text-xs text-[var(--muted)] mb-6">
        <Link href="/vendors" className="hover:text-[var(--accent)]">← All vendors</Link>
      </div>
      <h1 className="text-xl font-bold text-[var(--dark)] mb-2">Vendors tagged with</h1>
      <div className="flex flex-wrap gap-2 mb-6" role="list" aria-label="Active tag filters">
        {selectedTags.map(tag => (
          <div key={tag} role="listitem"
            className="flex items-center gap-1.5 bg-[var(--accent)] text-white rounded-full px-3 py-1 text-xs font-medium">
            <Tag size={9} />
            {tag}
            <button onClick={() => removeTag(tag)} aria-label={`Remove filter ${tag}`}>
              <X size={10} />
            </button>
          </div>
        ))}
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="card h-[260px] animate-pulse bg-[var(--bg)]" />)}
        </div>
      ) : vendors.length === 0 ? (
        <div className="text-center py-16 text-[var(--muted)]">
          <div className="text-4xl mb-3">🔍</div>
          <div className="font-semibold text-[var(--dark)] mb-1">No vendors match these tags</div>
          <Link href="/vendors" className="btn-accent text-sm px-4 py-2 inline-block mt-4">Browse all vendors</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map((vendor: any) => <VendorCard key={vendor.id} vendor={vendor} />)}
        </div>
      )}
    </div>
  );
}

// ─── Mode-affinity grouped landing (AC-4) ─────────────────────────────────────
function ModeAffinityLanding() {
  const { data, isLoading } = useQuery({
    queryKey: ['vendor-categories'],
    queryFn: () => vendorsApi.getCategories().then(r => r.data),
  });

  const grouped: Record<string, any[]> = data?.grouped || {};
  const hasAnyCategories = Object.values(grouped).some((cats: any[]) => cats.length > 0);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-5 py-12">
        <div className="space-y-8">
          {MODES.map(m => (
            <div key={m.key}>
              <div className="h-6 w-48 bg-[var(--border)] rounded animate-pulse mb-4" />
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-32 bg-[var(--border)] rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!hasAnyCategories) {
    return (
      <div className="max-w-6xl mx-auto px-5 py-20 text-center">
        <div className="text-4xl mb-3">🔍</div>
        <h2 className="font-bold text-xl mb-2 text-[var(--dark)]">Browse vendors by category coming soon</h2>
        <p className="text-sm text-[var(--muted)] mb-6">We&apos;re onboarding vendors. Check back soon!</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--dark)] mb-2">Find Vendors</h1>
        <p className="text-sm text-[var(--muted)]">
          Browse {data?.totalVisible || 0} vendor categories across events, stays, and experiences
        </p>
      </div>

      <div className="space-y-10">
        {MODES.map(mode => {
          const cats: any[] = grouped[mode.key] || [];
          if (cats.length === 0) return null;
          return (
            <section key={mode.key} aria-labelledby={`mode-${mode.key}`}>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">{mode.emoji}</span>
                <div>
                  <h2 id={`mode-${mode.key}`} className="font-bold text-lg text-[var(--dark)]">{mode.label}</h2>
                  <p className="text-xs text-[var(--muted)]">{mode.description}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {cats.map((cat: any) => (
                  <CategoryCard key={`${mode.key}-${cat.id}`} cat={cat} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CategoryCard({ cat }: { cat: any }) {
  const topTags: any[] = cat.topTags || [];
  return (
    <Link href={`/vendors?category=${cat.key}`}>
      <div className="card p-4 hover:shadow-md transition-all cursor-pointer group h-full flex flex-col">
        <div className="flex items-start justify-between mb-2">
          <div className="text-2xl">{cat.iconName || '🏢'}</div>
          <ChevronRight size={14} className="text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors mt-1" />
        </div>
        <div className="font-semibold text-sm text-[var(--dark)] mb-1">{cat.label}</div>
        <div className="text-[10px] text-[var(--muted)] mb-2">{cat.vendorCount} verified vendor{cat.vendorCount !== 1 ? 's' : ''}</div>
        {topTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto">
            {topTags.slice(0, 3).map((t: any) => (
              <span key={t.id} className="text-[9px] bg-[var(--pill)] text-[var(--mid)] px-1.5 py-0.5 rounded-full">
                {t.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

// ─── Category detail view with tag filtering (AC-3) ───────────────────────────
function CategoryDetailView({ categoryKey, tagsParam }: { categoryKey: string; tagsParam: string }) {
  const router = useRouter();
  const [selectedTags, setSelectedTags] = useState<string[]>(
    tagsParam ? tagsParam.split(',').filter(Boolean) : []
  );
  const [search, setSearch] = useState('');

  // Sync URL when tags change
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('category', categoryKey);
    if (selectedTags.length > 0) params.set('tags', selectedTags.join(','));
    router.replace(`/vendors?${params.toString()}`, { scroll: false });
  }, [selectedTags, categoryKey, router]);

  // Fetch vendors for this category (with tag filter)
  const { data: vendorData, isLoading: vendorsLoading } = useQuery({
    queryKey: ['discover', categoryKey, selectedTags],
    queryFn: () => vendorsApi.discover({
      categoryKey,
      tags: selectedTags.length > 0 ? selectedTags.join(',') : undefined,
    }).then(r => r.data),
  });

  // Fetch available tags for autocomplete
  const { data: tagData } = useQuery({
    queryKey: ['category-tags', categoryKey],
    queryFn: () => vendorsApi.suggestTags('').then(r => r.data),
  });

  const vendors: any[] = vendorData?.vendors || [];
  const availableTags: any[] = tagData?.tags || [];

  function toggleTag(label: string) {
    setSelectedTags(prev =>
      prev.includes(label) ? prev.filter(t => t !== label) : [...prev, label]
    );
  }

  function clearTags() {
    setSelectedTags([]);
  }

  return (
    <div className="max-w-6xl mx-auto px-5 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-[var(--muted)] mb-6">
        <Link href="/vendors" className="hover:text-[var(--accent)]">Vendors</Link>
        <ChevronRight size={12} />
        <span className="text-[var(--dark)] font-medium capitalize">{categoryKey.replace(/_/g, ' ').toLowerCase()}</span>
      </div>

      <div className="flex gap-6">
        {/* Tag filter sidebar (AC-3) */}
        {availableTags.length > 0 && (
          <aside className="w-52 flex-shrink-0" aria-label="Tag filters">
            <div className="card p-4 sticky top-20">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold text-[var(--dark)]">Filter by tag</div>
                {selectedTags.length > 0 && (
                  <button
                    onClick={clearTags}
                    className="text-[10px] text-[var(--accent)] hover:underline"
                    aria-label="Clear all tag filters">
                    Clear all
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {availableTags.map((tag: any) => {
                  const isSelected = selectedTags.includes(tag.label);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.label)}
                      className={`w-full text-left flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                        isSelected
                          ? 'bg-[var(--accent)] text-white font-semibold'
                          : 'hover:bg-[var(--bg)] text-[var(--mid)]'
                      }`}
                      aria-pressed={isSelected}>
                      <span className="flex items-center gap-1.5">
                        <Tag size={9} />
                        {tag.label}
                      </span>
                      <span className={`text-[9px] ${isSelected ? 'text-white/70' : 'text-[var(--muted)]'}`}>
                        {tag.usageCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        )}

        {/* Vendor results */}
        <div className="flex-1 min-w-0">
          {/* Search bar */}
          <div className="flex items-center gap-2 bg-white border border-[var(--border)] rounded-lg px-3 py-2 mb-4">
            <Search size={14} className="text-[var(--muted)]" />
            <input
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
              placeholder="Search vendors..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search vendors"
            />
          </div>

          {/* Active tag chips */}
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4" role="list" aria-label="Active tag filters">
              {selectedTags.map(tag => (
                <div key={tag} role="listitem"
                  className="flex items-center gap-1.5 bg-[var(--accent)] text-white rounded-full px-3 py-1 text-xs font-medium">
                  <Tag size={9} />
                  {tag}
                  <button onClick={() => toggleTag(tag)} aria-label={`Remove filter ${tag}`}>
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {vendorsLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="card h-[260px] animate-pulse bg-[var(--bg)]" />
              ))}
            </div>
          ) : vendors.length === 0 ? (
            <div className="text-center py-16 text-[var(--muted)]">
              <div className="text-4xl mb-3">🔍</div>
              <div className="font-semibold text-[var(--dark)] mb-1">No vendors match these filters</div>
              <div className="text-sm mb-4">Try removing some tag filters</div>
              {selectedTags.length > 0 && (
                <button onClick={clearTags} className="btn-accent text-sm px-4 py-2">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="text-xs text-[var(--muted)] mb-3">{vendorData?.total || 0} vendors found</div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {vendors
                  .filter((v: any) => !search || v.businessName.toLowerCase().includes(search.toLowerCase()))
                  .map((vendor: any) => (
                    <VendorCard key={vendor.id} vendor={vendor} />
                  ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function VendorCard({ vendor }: { vendor: any }) {
  const photo = vendor.portfolioItems?.[0]?.url;
  const tags: any[] = vendor.tags || [];
  return (
    <Link href={`/vendors/${vendor.slug}`}>
      <div className="card overflow-hidden hover:shadow-lg transition-all cursor-pointer group">
        <div className="aspect-[4/3] bg-[var(--bg)] relative overflow-hidden">
          {photo ? (
            <img src={photo} alt={vendor.businessName}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl">
              {vendor.vendorCategory?.iconName || '🏢'}
            </div>
          )}
          {vendor.isFeatured && (
            <div className="absolute top-2 left-2 bg-[var(--accent2)] text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
              ⭐ Featured
            </div>
          )}
          {vendor.isInstantBook && (
            <div className="absolute top-2 right-2 bg-[var(--dark)] text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Zap size={9} /> Instant
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="font-bold text-sm text-[var(--dark)] mb-1 truncate">{vendor.businessName}</div>
          <div className="flex items-center gap-1 text-xs text-[var(--muted)] mb-2">
            <MapPin size={10} /> {vendor.city}
          </div>
          {/* Tags (AC-2: consumer-visible tags on vendor card) */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {tags.slice(0, 3).map((t: any) => (
                <span key={t.id} className="text-[9px] bg-[var(--pill)] text-[var(--mid)] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <Tag size={7} />{t.label}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Star size={12} className="text-yellow-400 fill-yellow-400" />
              <span className="text-xs font-semibold">{Number(vendor.rating).toFixed(1)}</span>
            </div>
            <div className="text-xs font-bold text-[var(--accent)]">
              From {formatNGN(vendor.minPrice, true)}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
