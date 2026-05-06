'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus, Bed, MapPin, Star, ExternalLink, RefreshCw,
  CheckCircle, AlertCircle, Clock, MoreVertical, Eye, Edit, Trash2
} from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface Room {
  id: string;
  name: string;
  roomType: string;
  pricePerNight: number;
  currency: string;
  capacity: number;
  coastalCorridorRoomId?: string | null;
}

interface Property {
  id: string;
  name: string;
  slug: string;
  city: string;
  state?: string;
  country: string;
  propertyType: string;
  coverImageUrl?: string | null;
  isActive: boolean;
  isFeatured: boolean;
  rating?: number | null;
  coastalCorridorPropertyId?: string | null;
  coastalCorridorListingUrl?: string | null;
  coastalCorridorSyncedAt?: string | null;
  rooms: Room[];
  _count: { rooms: number; stayBookings: number };
  createdAt: string;
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  HOTEL: 'Hotel',
  GUESTHOUSE: 'Guesthouse',
  VILLA: 'Villa',
  APARTMENT: 'Apartment',
  RESORT: 'Resort',
  LODGE: 'Lodge',
  BOUTIQUE_HOTEL: 'Boutique Hotel',
  SERVICED_APARTMENT: 'Serviced Apartment',
};

function CCStatusBadge({ property }: { property: Property }) {
  if (!property.coastalCorridorPropertyId) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
        <Clock size={10} /> Not synced
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
      <CheckCircle size={10} /> Live on CC
    </span>
  );
}

export default function StaysPropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const fetchProperties = async () => {
    try {
      const { data } = await api.get('/properties/host');
      setProperties(data.data ?? []);
    } catch {
      toast.error('Failed to load properties');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, []);

  const handlePushToCC = async (propertyId: string) => {
    setPushing(propertyId);
    try {
      const { data } = await api.post(`/properties/${propertyId}/push-to-cc`);
      toast.success('Property pushed to Coastal Corridor');
      setProperties(prev =>
        prev.map(p =>
          p.id === propertyId
            ? {
                ...p,
                coastalCorridorPropertyId: data.data.coastalCorridorPropertyId,
                coastalCorridorListingUrl: data.data.coastalCorridorListingUrl,
                coastalCorridorSyncedAt: data.data.coastalCorridorSyncedAt,
              }
            : p
        )
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to push to Coastal Corridor');
    } finally {
      setPushing(null);
    }
  };

  const handleDeactivate = async (propertyId: string) => {
    if (!confirm('Deactivate this property? It will be hidden from guests and removed from Coastal Corridor.')) return;
    try {
      await api.delete(`/properties/${propertyId}`);
      toast.success('Property deactivated');
      setProperties(prev => prev.filter(p => p.id !== propertyId));
    } catch {
      toast.error('Failed to deactivate property');
    }
    setMenuOpen(null);
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
          <h1 className="text-xl font-bold text-[var(--dark)]">My Properties</h1>
          <p className="text-sm text-[var(--mid)] mt-0.5">
            {properties.length} {properties.length === 1 ? 'property' : 'properties'} listed
          </p>
        </div>
        <Link
          href="/dashboard/stays/properties/new"
          className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
        >
          <Plus size={14} />
          Add Property
        </Link>
      </div>

      {/* Empty state */}
      {properties.length === 0 && (
        <div className="text-center py-16 border border-dashed border-[var(--border)] rounded-xl">
          <Bed size={40} className="mx-auto text-[var(--muted)] mb-4" />
          <h3 className="font-semibold text-[var(--dark)] mb-2">No properties yet</h3>
          <p className="text-sm text-[var(--mid)] mb-6">
            Add your first property to start accepting bookings via Owambe and Coastal Corridor.
          </p>
          <Link href="/dashboard/stays/properties/new" className="btn-primary text-sm px-5 py-2">
            Add Your First Property
          </Link>
        </div>
      )}

      {/* Property list */}
      <div className="space-y-4">
        {properties.map(property => (
          <div
            key={property.id}
            className="bg-white border border-[var(--border)] rounded-xl overflow-hidden hover:shadow-sm transition-shadow"
          >
            <div className="flex">
              {/* Cover image */}
              <div className="w-32 h-32 shrink-0 bg-[var(--surface)] relative">
                {property.coverImageUrl ? (
                  <img
                    src={property.coverImageUrl}
                    alt={property.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Bed size={28} className="text-[var(--muted)]" />
                  </div>
                )}
                {!property.isActive && (
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
                      <h3 className="font-semibold text-[var(--dark)]">{property.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface)] text-[var(--mid)] border border-[var(--border)]">
                        {PROPERTY_TYPE_LABELS[property.propertyType] ?? property.propertyType}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-[var(--mid)] mb-2">
                      <MapPin size={12} />
                      {property.city}{property.state ? `, ${property.state}` : ''}, {property.country}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--mid)]">
                      <span>{property._count.rooms} {property._count.rooms === 1 ? 'room' : 'rooms'}</span>
                      <span>·</span>
                      <span>{property._count.stayBookings} bookings</span>
                      {property.rating && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-0.5">
                            <Star size={10} className="text-yellow-500 fill-yellow-500" />
                            {Number(property.rating).toFixed(1)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <CCStatusBadge property={property} />
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpen(menuOpen === property.id ? null : property.id)}
                        className="p-1.5 rounded-lg hover:bg-[var(--surface)] text-[var(--mid)]"
                      >
                        <MoreVertical size={16} />
                      </button>
                      {menuOpen === property.id && (
                        <div className="absolute right-0 top-8 z-20 w-48 bg-white border border-[var(--border)] rounded-xl shadow-lg py-1">
                          <Link
                            href={`/dashboard/stays/properties/${property.id}`}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--surface)] text-[var(--dark)]"
                            onClick={() => setMenuOpen(null)}
                          >
                            <Eye size={14} /> View Details
                          </Link>
                          <Link
                            href={`/dashboard/stays/properties/${property.id}/edit`}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--surface)] text-[var(--dark)]"
                            onClick={() => setMenuOpen(null)}
                          >
                            <Edit size={14} /> Edit Property
                          </Link>
                          {!property.coastalCorridorPropertyId && (
                            <button
                              onClick={() => { setMenuOpen(null); handlePushToCC(property.id); }}
                              disabled={pushing === property.id}
                              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--surface)] text-[var(--dark)] w-full text-left disabled:opacity-50"
                            >
                              <RefreshCw size={14} className={pushing === property.id ? 'animate-spin' : ''} />
                              Push to Coastal Corridor
                            </button>
                          )}
                          {property.coastalCorridorListingUrl && (
                            <a
                              href={property.coastalCorridorListingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--surface)] text-[var(--dark)]"
                              onClick={() => setMenuOpen(null)}
                            >
                              <ExternalLink size={14} /> View on CC
                            </a>
                          )}
                          <hr className="my-1 border-[var(--border)]" />
                          <button
                            onClick={() => handleDeactivate(property.id)}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 text-red-600 w-full text-left"
                          >
                            <Trash2 size={14} /> Deactivate
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Rooms */}
                {property.rooms.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {property.rooms.slice(0, 3).map(room => (
                      <span
                        key={room.id}
                        className="text-xs px-2 py-1 rounded-lg bg-[var(--surface)] text-[var(--mid)] border border-[var(--border)]"
                      >
                        {room.name} — {room.currency} {Number(room.pricePerNight).toLocaleString('en-NG')}/night
                      </span>
                    ))}
                    {property.rooms.length > 3 && (
                      <span className="text-xs px-2 py-1 rounded-lg bg-[var(--surface)] text-[var(--mid)]">
                        +{property.rooms.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
