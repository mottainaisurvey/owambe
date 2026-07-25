/**
 * STAYS-J1-AUTH-BOOKING-500-REMEDIATION-01 — focused regression tests
 *
 * Verifies that POST /api/stay-bookings does not surface a generic HTTP 500
 * when Paystack deposit initialization fails after booking persistence.
 */

import request from 'supertest';
import { AppError } from '../utils/AppError';

const mockFindRoom = jest.fn();
const mockFindUser = jest.fn();
const mockFindStayConflict = jest.fn();
const mockFindCalendarEntry = jest.fn();
const mockFindCalendarEntries = jest.fn();
const mockCreateStayBooking = jest.fn();
const mockUpdateStayBooking = jest.fn();
const mockInitializeTransaction = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../middleware/authenticate', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.userId = 'guest-user-1';
    req.userRole = 'CONSUMER';
    next();
  },
  authenticateOptional: (_req: any, _res: any, next: any) => { next(); },
}));

jest.mock('../database/client', () => ({
  prisma: {
    room: {
      findUnique: (...args: any[]) => mockFindRoom(...args),
    },
    user: {
      findUnique: (...args: any[]) => mockFindUser(...args),
    },
    stayBooking: {
      findFirst: (...args: any[]) => mockFindStayConflict(...args),
      create: (...args: any[]) => mockCreateStayBooking(...args),
      update: (...args: any[]) => mockUpdateStayBooking(...args),
    },
    calendarEntry: {
      findFirst: (...args: any[]) => mockFindCalendarEntry(...args),
      findMany: (...args: any[]) => mockFindCalendarEntries(...args),
    },
    $disconnect: jest.fn(),
  },
}));

jest.mock('../services/paystack.service', () => ({
  initializeTransaction: (...args: any[]) => mockInitializeTransaction(...args),
}));

jest.mock('../services/notification.service', () => ({
  notifyHostNewReservation: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/email.service', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/queue.service', () => ({
  queueBulkCampaign: jest.fn().mockResolvedValue({ queued: true }),
  initQueues: jest.fn(),
  startWorkers: jest.fn(),
  closeQueues: jest.fn(),
}));

jest.mock('../services/webhookDispatcher.service', () => ({
  dispatchWebhookEvent: jest.fn().mockResolvedValue({ queued: true }),
  initWebhookDispatcher: jest.fn(),
  closeWebhookDispatcher: jest.fn(),
}));

jest.mock('../services/reconciliation.service', () => ({
  dispatchReconciliationNow: jest.fn().mockResolvedValue({ queued: true }),
  initReconciliationCron: jest.fn(),
  closeReconciliationCron: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: (...args: any[]) => mockLoggerError(...args),
    debug: jest.fn(),
  },
}));

import { app } from '../app';

const futureCheckIn = new Date();
futureCheckIn.setUTCDate(futureCheckIn.getUTCDate() + 30);
const futureCheckOut = new Date(futureCheckIn);
futureCheckOut.setUTCDate(futureCheckOut.getUTCDate() + 2);

const checkInDate = futureCheckIn.toISOString().slice(0, 10);
const checkOutDate = futureCheckOut.toISOString().slice(0, 10);

const roomFixture = {
  id: 'room-1',
  isActive: true,
  capacity: 4,
  pricePerNight: 50000,
  currency: 'NGN',
  name: 'Lagoon Suite',
  property: {
    id: 'property-1',
    name: 'Owambe Test Stays',
    isActive: true,
    isApproved: true,
    host: {
      businessName: 'HostCo',
      user: { email: 'host@example.test', firstName: 'Host' },
    },
  },
};

const bookingFixture = {
  id: 'stay-booking-1',
  propertyId: 'property-1',
  roomId: 'room-1',
  guestUserId: 'guest-user-1',
  guestId: 'guest-user-1',
  guestName: 'Jane Guest',
  guestEmail: 'jane@example.test',
  guestPhone: null,
  checkInDate: futureCheckIn,
  checkOutDate: futureCheckOut,
  nights: 2,
  guestCount: 2,
  numberOfGuests: 2,
  totalAmount: 100000,
  depositAmount: 30000,
  currency: 'NGN',
  reference: 'STAY-TEST-001',
  specialRequests: null,
  status: 'PENDING',
  paymentStatus: 'PENDING',
  channelOrigin: 'DIRECT',
  netToHost: 100000,
  room: roomFixture,
  property: roomFixture.property,
};

function seedSuccessfulPrePaymentData() {
  mockFindRoom.mockResolvedValue(roomFixture);
  mockFindUser.mockResolvedValue({
    firstName: 'Jane',
    lastName: 'Guest',
    email: 'jane@example.test',
    phone: null,
  });
  mockFindStayConflict.mockResolvedValue(null);
  mockFindCalendarEntry.mockResolvedValue(null);
  mockFindCalendarEntries.mockResolvedValue([]);
  mockCreateStayBooking.mockResolvedValue(bookingFixture);
  mockUpdateStayBooking.mockResolvedValue({ ...bookingFixture, paystackRef: 'ps-ref' });
}

beforeEach(() => {
  jest.clearAllMocks();
  seedSuccessfulPrePaymentData();
});

describe('POST /api/stay-bookings — Paystack initialization failure handling', () => {
  it('returns a descriptive non-generic error when initializeTransaction throws a plain Error after booking persistence', async () => {
    mockInitializeTransaction.mockRejectedValue(new Error('Invalid key'));

    const res = await request(app)
      .post('/api/stay-bookings')
      .send({ roomId: 'room-1', checkInDate, checkOutDate, guestCount: 2 });

    expect(mockCreateStayBooking).toHaveBeenCalledTimes(1);
    expect(mockUpdateStayBooking).not.toHaveBeenCalled();
    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Payment provider could not initialize this booking payment. Please try again later.');
    expect(res.body.errorCode).toBe('PAYSTACK_INITIALIZATION_FAILED');
    expect(JSON.stringify(res.body)).not.toMatch(/Internal server error/i);
    expect(JSON.stringify(res.body)).not.toMatch(/Invalid key/i);
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[StayBookings] Paystack deposit initialization failed after booking persistence',
      expect.objectContaining({
        bookingId: bookingFixture.id,
        reference: expect.stringMatching(/^STAY-/),
      }),
    );
  });

  it('preserves a service-unavailable Paystack configuration AppError for missing provider configuration', async () => {
    mockInitializeTransaction.mockRejectedValue(new AppError(
      'Payment provider is not configured. Please try again later or contact support.',
      503,
      'PAYSTACK_CONFIGURATION_MISSING',
    ));

    const res = await request(app)
      .post('/api/stay-bookings')
      .send({ roomId: 'room-1', checkInDate, checkOutDate, guestCount: 2 });

    expect(mockCreateStayBooking).toHaveBeenCalledTimes(1);
    expect(mockUpdateStayBooking).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Payment provider is not configured. Please try again later or contact support.');
    expect(res.body.errorCode).toBe('PAYSTACK_CONFIGURATION_MISSING');
    expect(JSON.stringify(res.body)).not.toMatch(/Internal server error/i);
  });
});
