'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, Bed, Calendar, CheckCircle, Clock, Edit, ExternalLink,
  Loader2, MapPin, RefreshCw, Star, Users
} from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type Room = {
  id: string;
  name: string;
  roomType: string;
  description?: string | null;
  capacity: number;
  bedCount: number;
  bathCount: number;
  pricePerNight: number | string;
  currency: string;
  amenities: string[];
  imageUrls: string[];
  isActive: boolean;
  coastalCorridorRoomId?: string | null;
};

type Property = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  propertyType: string;
  city: string;
  state?: string | null;
  country: string;
  address?: string | null;
  coverImageUrl?: string | null;
  galleryUrls: string[];
  amenities: string[];
  checkInTime?: string | null;
  checkOutTime?: string | null;
  houseRules?: string | null;
  cancellationPolicy?: string | null;
  isActive: boolean;
  isFeatured: boolean;
  rating?: number | string | null;
  reviewCount?: number | null;
  coastalCorridorPropertyId?: string | null;
  coastalCorridorListingUrl?: string | null;
  coastalCorridorSyncedAt?: string | null;
  rooms: Room[];
  _count: { rooms: number; stayBookings: number; calendarEntries?: number };
  createdAt: string;
  updatedAt: string;
};

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

const ROOM_TYPE_LABELS: Record<string, string> = {
  STANDARD: 'Standard',
  DELUXE: 'Deluxe',
  SUITE: 'Suite',
  EXECUTIVE: 'Executive',
  FAMILY: 'Family',
  TWIN: 'Twin',
  SINGLE: 'Single',
  PRESIDENTIAL: 'Presidential',
};

function formatCurrency(value: number | string, currency = 'NGN') {
  return `${currency} ${Number(value).toLocaleString('en-NG')}`;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function InfoCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="bg-white border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs text-[var(--mid)] mb-1">
        <Icon size={14} className="text-[var(--accent)]" />
        {label}
      </div>
      <div className="font-semibold text-[var(--dark)]">{value}</div>
    </div>
  );
}

export default function PropertyDetailsPage() {
  const params = useParams<{ id: string }>();
  const propertyId = params?.id;
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) return;

    api.get(`/properties/host/${propertyId}`)
      .then(({ data }) => setProperty(data.data))
      .catch((err) => {
        toast.error(err?.response?.data?.message ?? 'Failed to load property');
        setProperty(null);
      })
      .finally(() => setLoading(false));
  }, [propertyId]);

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto flex items-center justify-center min-h-[360px]">
        <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/dashboard/stays/properties" className="inline-flex items-center gap-2 text-sm text-[var(--mid)] hover:text-[var(--dark)] mb-6">
          <ArrowLeft size={16} /> Back to properties
        </Link>
        <div className="bg-white border border-[var(--border)] rounded-xl p-8 text-center">
          <Bed size={36} className="mx-auto text-[var(--muted)] mb-3" />
          <h1 className="font-semibold text-[var(--dark)] mb-1">Property not found</h1>
          <p className="text-sm text-[var(--mid)]">This property may have been removed, or you may not have access to it.</p>
        </div>
      </div>
    );
  }

  const lowestRoomRate = property.rooms.length
    ? property.rooms.reduce((min, room) => Math.min(min, Number(room.pricePerNight)), Number(property.rooms[0].pricePerNight))
    : null;

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/stays/properties" className="text-[var(--muted)] hover:text-[var(--dark)] transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-[var(--dark)]">{property.name}</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface)] text-[var(--mid)] border border-[var(--border)]">
                {PROPERTY_TYPE_LABELS[property.propertyType] ?? property.propertyType}
              </span>
              {!property.isActive && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">Inactive</span>
              )}
            </div>
            <p className="flex items-center gap-1 text-sm text-[var(--mid)]">
              <MapPin size={13} /> {property.city}{property.state ? `, ${property.state}` : ''}, {property.country}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {property.coastalCorridorListingUrl && (
            <a href={property.coastalCorridorListingUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm flex items-center gap-2">
              <ExternalLink size={14} /> View on CC
            </a>
          )}
          <Link href={`/dashboard/stays/properties/${property.id}/edit`} className="btn-primary text-sm flex items-center gap-2">
            <Edit size={14} /> Edit Property
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="h-64 bg-[var(--surface)]">
              {property.coverImageUrl ? (
                <img src={property.coverImageUrl} alt={property.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Bed size={44} className="text-[var(--muted)]" />
                </div>
              )}
            </div>
            <div className="p-5">
              <h2 className="font-semibold text-[var(--dark)] mb-2">Property overview</h2>
              <p className="text-sm text-[var(--mid)] leading-6 whitespace-pre-line">
                {property.description || 'No description has been added for this property yet.'}
              </p>
            </div>
          </div>

          <div className="bg-white border border-[var(--border)] rounded-xl p-5">
            <h2 className="font-semibold text-[var(--dark)] mb-4">Rooms</h2>
            {property.rooms.length === 0 ? (
              <div className="text-sm text-[var(--mid)] border border-dashed border-[var(--border)] rounded-xl p-6 text-center">
                No rooms have been added to this property yet.
              </div>
            ) : (
              <div className="space-y-3">
                {property.rooms.map(room => (
                  <div key={room.id} className="border border-[var(--border)] rounded-xl p-4 flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-[var(--dark)]">{room.name}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface)] text-[var(--mid)]">
                          {ROOM_TYPE_LABELS[room.roomType] ?? room.roomType}
                        </span>
                        {!room.isActive && <span className="text-xs text-red-600">Inactive</span>}
                      </div>
                      <div className="text-xs text-[var(--mid)] flex flex-wrap gap-x-3 gap-y-1">
                        <span>{room.capacity} guests</span>
                        <span>{room.bedCount} bed{room.bedCount === 1 ? '' : 's'}</span>
                        <span>{room.bathCount} bath{room.bathCount === 1 ? '' : 's'}</span>
                        {room.coastalCorridorRoomId && <span>CC synced</span>}
                      </div>
                      {room.description && <p className="text-sm text-[var(--mid)] mt-2">{room.description}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold text-[var(--dark)]">{formatCurrency(room.pricePerNight, room.currency)}</div>
                      <div className="text-xs text-[var(--mid)]">per night</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-[var(--border)] rounded-xl p-5">
              <h2 className="font-semibold text-[var(--dark)] mb-3">Policies</h2>
              <dl className="space-y-3 text-sm">
                <div><dt className="text-[var(--muted)] text-xs">Check-in</dt><dd className="text-[var(--dark)]">{property.checkInTime || '—'}</dd></div>
                <div><dt className="text-[var(--muted)] text-xs">Check-out</dt><dd className="text-[var(--dark)]">{property.checkOutTime || '—'}</dd></div>
                <div><dt className="text-[var(--muted)] text-xs">House rules</dt><dd className="text-[var(--dark)] whitespace-pre-line">{property.houseRules || '—'}</dd></div>
                <div><dt className="text-[var(--muted)] text-xs">Cancellation policy</dt><dd className="text-[var(--dark)] whitespace-pre-line">{property.cancellationPolicy || '—'}</dd></div>
              </dl>
            </div>
            <div className="bg-white border border-[var(--border)] rounded-xl p-5">
              <h2 className="font-semibold text-[var(--dark)] mb-3">Amenities</h2>
              {property.amenities.length ? (
                <div className="flex flex-wrap gap-2">
                  {property.amenities.map(amenity => (
                    <span key={amenity} className="text-xs px-2 py-1 rounded-lg bg-[var(--surface)] text-[var(--mid)] border border-[var(--border)]">
                      {amenity.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--mid)]">No amenities listed.</p>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <InfoCard label="Rooms" value={property._count.rooms} icon={Bed} />
          <InfoCard label="Reservations" value={property._count.stayBookings} icon={Calendar} />
          <InfoCard label="Lowest nightly rate" value={lowestRoomRate === null ? '—' : formatCurrency(lowestRoomRate, property.rooms[0]?.currency ?? 'NGN')} icon={Users} />
          <InfoCard label="Rating" value={property.rating ? Number(property.rating).toFixed(1) : '—'} icon={Star} />

          <div className="bg-white border border-[var(--border)] rounded-xl p-5">
            <h2 className="font-semibold text-[var(--dark)] mb-3">Publishing status</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-[var(--dark)]">
                {property.isActive ? <CheckCircle size={15} className="text-green-600" /> : <Clock size={15} className="text-yellow-600" />}
                {property.isActive ? 'Active on Owambe' : 'Inactive on Owambe'}
              </div>
              <div className="flex items-center gap-2 text-[var(--dark)]">
                {property.coastalCorridorPropertyId ? <RefreshCw size={15} className="text-green-600" /> : <Clock size={15} className="text-yellow-600" />}
                {property.coastalCorridorPropertyId ? 'Synced to Coastal Corridor' : 'Not synced to Coastal Corridor'}
              </div>
              <div className="text-xs text-[var(--mid)]">
                Last updated: {formatDate(property.updatedAt)}
                {property.coastalCorridorSyncedAt && <><br />CC sync: {formatDate(property.coastalCorridorSyncedAt)}</>}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
