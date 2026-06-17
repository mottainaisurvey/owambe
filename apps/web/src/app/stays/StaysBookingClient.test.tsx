import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/wrappers';

vi.mock('@/lib/api', () => ({
  staysApi: {
    search: vi.fn(),
    availability: vi.fn(),
    createBooking: vi.fn(),
    listBookings: vi.fn(),
    getBooking: vi.fn(),
    cancelBooking: vi.fn(),
  },
}));

import { staysApi } from '@/lib/api';
import StaysBookingClient, { normalizeStayAvailabilityRooms } from './StaysBookingClient';

const seededRoom = {
  id: 'room-owambe-seeded-deluxe',
  name: 'Seeded Deluxe Room',
  roomType: 'DELUXE',
  pricePerNight: '100000',
  currency: 'NGN',
  capacity: 2,
};

const seededProperty = {
  id: 'prop-owambe-seeded-stay',
  name: 'Owambe Seeded Test Stay',
  slug: 'owambe-seeded-test-stay',
  description: 'Seeded staging stay for availability testing.',
  propertyType: 'HOTEL',
  city: 'Lagos',
  state: 'Lagos',
  rooms: [seededRoom],
};

const availableRoom = {
  ...seededRoom,
  isAvailable: true,
  effectiveTotal: '450000',
  effectiveRatePerNight: '150000',
  rateBreakdown: [
    { date: '2026-07-01', rate: '150000', currency: 'NGN', source: 'OVERRIDE' },
    { date: '2026-07-02', rate: '150000', currency: 'NGN', source: 'OVERRIDE' },
    { date: '2026-07-03', rate: '150000', currency: 'NGN', source: 'OVERRIDE' },
  ],
};

describe('normalizeStayAvailabilityRooms', () => {
  it('extracts rooms from the live availability response contract', () => {
    expect(normalizeStayAvailabilityRooms({ success: true, data: { rooms: [availableRoom] } })).toEqual([availableRoom]);
  });

  it('preserves the previous array-shaped contract for backward compatibility', () => {
    expect(normalizeStayAvailabilityRooms({ data: [availableRoom] })).toEqual([availableRoom]);
    expect(normalizeStayAvailabilityRooms([availableRoom])).toEqual([availableRoom]);
  });

  it('returns an empty array for missing or malformed availability payloads', () => {
    expect(normalizeStayAvailabilityRooms(null)).toEqual([]);
    expect(normalizeStayAvailabilityRooms({ success: true, data: { rooms: null } })).toEqual([]);
  });
});

describe('StaysBookingClient room selection availability contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/stays?city=Lagos&checkIn=2026-07-01&checkOut=2026-07-04&guests=2');
  });

  it('accepts the live nested rooms response and shows the booking summary instead of the availability warning', async () => {
    vi.mocked(staysApi.search).mockResolvedValue({ data: { data: [seededProperty] } });
    vi.mocked(staysApi.availability).mockResolvedValue({
      data: {
        success: true,
        data: {
          propertyId: seededProperty.id,
          checkIn: '2026-07-01',
          checkOut: '2026-07-04',
          nights: 3,
          rooms: [availableRoom],
        },
      },
    });

    renderWithProviders(<StaysBookingClient />);

    expect(await screen.findByText('Owambe Seeded Test Stay')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Select room' }));

    await waitFor(() => {
      expect(screen.getAllByText('Seeded Deluxe Room').length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText((_, element) => element?.textContent === 'Total: NGN 450,000')).toBeInTheDocument();
    });

    expect(screen.queryByText('That room is no longer available for the selected dates. Please choose another room or date range.')).not.toBeInTheDocument();
    expect(staysApi.availability).toHaveBeenCalledWith(seededProperty.id, '2026-07-01', '2026-07-04');
  });
});
