'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus, Compass, MapPin, Star, Clock, CheckCircle, XCircle,
  AlertCircle, MoreVertical, Eye, Edit, Archive, Globe, EyeOff, Users
} from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface Experience {
  id: string;
  name: string;
  slug: string;
  experienceType: string;
  city: string;
  state?: string;
  country: string;
  coverImageUrl?: string | null;
  pricePerPerson: number;
  currency: string;
  durationMinutes?: number | null;
  maxGroupSize?: number | null;
  isActive: boolean;
  isApproved: boolean;
  isFeatured: boolean;
  rating?: number | null;
  createdAt: string;
  _count: { experienceBookings: number; availableSlots: number };
}

const EXPERIENCE_TYPE_LABELS: Record<string, string> = {
  CULTURAL_TOUR: 'Cultural Tour',
  FOOD_TASTING: 'Food Tasting',
  ADVENTURE: 'Adventure',
  WELLNESS_SPA: 'Wellness & Spa',
  NIGHTLIFE: 'Nightlife',
  WORKSHOP: 'Workshop',
  SPORTS: 'Sports',
  SIGHTSEEING: 'Sightseeing',
  PRIVATE_DINING: 'Private Dining',
  MUSIC_PERFORMANCE: 'Music Performance',
};

// C1-b.0 lifecycle model: derive display status from isActive + isApproved
function getLifecycleStatus(exp: Experience): { label: string; color: string; icon: any } {
  if (exp.isActive && exp.isApproved) {
    return { label: 'Published', color: 'text-green-700 bg-green-50 border-green-200', icon: CheckCircle };
  }
  if (!exp.isActive && exp.isApproved) {
    return { label: 'Unpublished', color: 'text-yellow-700 bg-yellow-50 border-yellow-200', icon: EyeOff };
  }
  if (exp.isApproved) {
    return { label: 'Approved', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: CheckCircle };
  }
  return { label: 'Draft', color: 'text-gray-600 bg-gray-50 border-gray-200', icon: Clock };
}

function LifecycleBadge({ experience }: { experience: Experience }) {
  const status = getLifecycleStatus(experience);
  const Icon = status.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${status.color}`}>
      <Icon size={10} />
      {status.label}
    </span>
  );
}

export default function ExperiencesListPage() {
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

  const fetchExperiences = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await api.get('/experiences/mine');
      setExperiences(data.data ?? []);
    } catch {
      setExperiences([]);
      setLoadError('We could not load your experiences. Your listings may still exist — please retry before adding duplicates.');
      toast.error('Failed to load experiences');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExperiences();
  }, []);

  // C1-b.0: Publish — requires isApproved=true (enforced server-side too)
  const handlePublish = async (id: string) => {
    setActionPending(id);
    try {
      await api.patch(`/experiences/${id}/publish`);
      toast.success('Experience published');
      setExperiences(prev => prev.map(e => e.id === id ? { ...e, isActive: true } : e));
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to publish experience');
    } finally {
      setActionPending(null);
      setMenuOpen(null);
    }
  };

  // C1-b.0: Unpublish — operator authority, no approval required
  const handleUnpublish = async (id: string) => {
    setActionPending(id);
    try {
      await api.patch(`/experiences/${id}/unpublish`);
      toast.success('Experience unpublished');
      setExperiences(prev => prev.map(e => e.id === id ? { ...e, isActive: false } : e));
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to unpublish experience');
    } finally {
      setActionPending(null);
      setMenuOpen(null);
    }
  };

  // C1-b.2: Archive (soft-delete) — blocked if active bookings exist (enforced server-side)
  const handleArchive = async (id: string, name: string) => {
    if (!confirm(`Archive "${name}"? It will be hidden from guests. This cannot be undone easily.`)) return;
    setActionPending(id);
    try {
      await api.patch(`/experiences/${id}/archive`);
      toast.success('Experience archived');
      setExperiences(prev => prev.map(e => e.id === id ? { ...e, isActive: false } : e));
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to archive experience');
    } finally {
      setActionPending(null);
      setMenuOpen(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-[var(--border)] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--dark)]">My Experiences</h1>
          <p className="text-sm text-[var(--mid)] mt-0.5">
            {experiences.length} {experiences.length === 1 ? 'experience' : 'experiences'} listed
          </p>
        </div>
        <Link
          href="/dashboard/experiences/new"
          className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
        >
          <Plus size={14} />
          Add Experience
        </Link>
      </div>

      {/* Error state */}
      {loadError && (
        <div className="text-center py-14 border border-red-200 bg-red-50 rounded-xl" role="alert">
          <AlertCircle size={40} className="mx-auto text-red-600 mb-4" />
          <h3 className="font-semibold text-red-900 mb-2">Unable to load experiences</h3>
          <p className="text-sm text-red-700 mb-6">{loadError}</p>
          <button type="button" onClick={fetchExperiences} className="btn-primary text-sm px-5 py-2">
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loadError && experiences.length === 0 && (
        <div className="text-center py-16 border border-dashed border-[var(--border)] rounded-xl">
          <Compass size={40} className="mx-auto text-[var(--muted)] mb-4" />
          <h3 className="font-semibold text-[var(--dark)] mb-2">No experiences yet</h3>
          <p className="text-sm text-[var(--mid)] mb-6">
            Add your first experience — tours, workshops, cultural events, and more.
          </p>
          <Link href="/dashboard/experiences/new" className="btn-primary text-sm px-5 py-2">
            Add Your First Experience
          </Link>
        </div>
      )}

      {/* Experience list */}
      <div className="space-y-4">
        {!loadError && experiences.map(experience => (
          <div
            key={experience.id}
            className="bg-white border border-[var(--border)] rounded-xl overflow-hidden hover:shadow-sm transition-shadow"
          >
            <div className="flex">
              {/* Cover image */}
              <div className="w-32 h-32 shrink-0 bg-[var(--surface)] relative">
                {experience.coverImageUrl ? (
                  <img
                    src={experience.coverImageUrl}
                    alt={experience.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Compass size={28} className="text-[var(--muted)]" />
                  </div>
                )}
                {!experience.isActive && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="text-white text-xs font-medium">Inactive</span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-[var(--dark)]">{experience.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface)] text-[var(--mid)] border border-[var(--border)]">
                        {EXPERIENCE_TYPE_LABELS[experience.experienceType] ?? experience.experienceType}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-[var(--mid)] mb-2">
                      <MapPin size={12} />
                      {experience.city}{experience.state ? `, ${experience.state}` : ''}, {experience.country}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--mid)]">
                      <span>{experience.currency} {Number(experience.pricePerPerson).toLocaleString('en-NG')}/person</span>
                      {experience.durationMinutes && (
                        <>
                          <span>·</span>
                          <span>{Math.floor(experience.durationMinutes / 60)}h {experience.durationMinutes % 60 > 0 ? `${experience.durationMinutes % 60}m` : ''}</span>
                        </>
                      )}
                      {experience.maxGroupSize && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-0.5">
                            <Users size={10} />
                            Max {experience.maxGroupSize}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span>{experience._count.experienceBookings} bookings</span>
                      {experience.rating && Number(experience.rating) > 0 && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-0.5">
                            <Star size={10} className="text-yellow-500 fill-yellow-500" />
                            {Number(experience.rating).toFixed(1)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <LifecycleBadge experience={experience} />
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpen(menuOpen === experience.id ? null : experience.id)}
                        className="p-1.5 rounded-lg hover:bg-[var(--surface)] text-[var(--mid)]"
                        disabled={actionPending === experience.id}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {menuOpen === experience.id && (
                        <div className="absolute right-0 top-8 z-20 w-52 bg-white border border-[var(--border)] rounded-xl shadow-lg py-1">
                          <Link
                            href={`/dashboard/experiences/new?edit=${experience.id}`}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--surface)] text-[var(--dark)]"
                            onClick={() => setMenuOpen(null)}
                          >
                            <Edit size={14} /> Edit Experience
                          </Link>
                          <Link
                            href={`/dashboard/experiences/slots?experienceId=${experience.id}`}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--surface)] text-[var(--dark)]"
                            onClick={() => setMenuOpen(null)}
                          >
                            <Clock size={14} /> Manage Slots
                          </Link>
                          {/* C1-b.0: Publish — only if approved and not already active */}
                          {experience.isApproved && !experience.isActive && (
                            <button
                              onClick={() => handlePublish(experience.id)}
                              disabled={actionPending === experience.id}
                              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-green-50 text-green-700 w-full text-left disabled:opacity-50"
                            >
                              <Globe size={14} /> Publish
                            </button>
                          )}
                          {/* C1-b.0: Unpublish — only if currently active */}
                          {experience.isActive && (
                            <button
                              onClick={() => handleUnpublish(experience.id)}
                              disabled={actionPending === experience.id}
                              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-yellow-50 text-yellow-700 w-full text-left disabled:opacity-50"
                            >
                              <EyeOff size={14} /> Unpublish
                            </button>
                          )}
                          {/* Approval pending notice */}
                          {!experience.isApproved && (
                            <div className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--mid)] cursor-default">
                              <Clock size={12} /> Awaiting platform approval
                            </div>
                          )}
                          <hr className="my-1 border-[var(--border)]" />
                          {/* C1-b.2: Archive (soft-delete) */}
                          <button
                            onClick={() => handleArchive(experience.id, experience.name)}
                            disabled={actionPending === experience.id}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 text-red-600 w-full text-left disabled:opacity-50"
                          >
                            <Archive size={14} /> Archive
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
