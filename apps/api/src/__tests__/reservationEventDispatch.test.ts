/**
 * OWB-F1-NEW-REFACTOR-01 — AC-4: Reservation Event Dispatch Integration Tests
 *
 * Tests for the three reservation lifecycle dispatch paths instrumented in channel.ts,
 * aligned to Amendment 012 canonical wire shape:
 *   1. reservation.created  — POST /api/v1/channel/stays/reservations (success path)
 *   2. reservation.cancelled — PATCH /api/v1/channel/stays/reservations/:id (CANCELLED)
 *   3. reservation.refunded  — PATCH /api/v1/channel/stays/reservations/:id (REFUNDED)
 *   4. Dispatch-always guard — reservation.* events are not gated by booking events flag
 *   5. HTTP outcome contract — 201/200 responses are not delayed by dispatch
 *
 * Strategy:
 *   - Uses the real Prisma client connected to the CI test database (same as api.test.ts).
 *   - Seeds a Host user, Host profile, Property, and Room in beforeAll.
 *   - Mocks only `dispatchWebhookEvent` to avoid real Redis/HTTP calls.
 *   - Mocks `verifyChannelSignature` middleware to bypass HMAC auth.
 *   - Cleans up all seeded data in afterAll.
 *
 * Amendment 012 §3.3/§3.4/§3.5 payload field coverage is verified
 * against the `data` argument passed to `dispatchWebhookEvent`.
 */

import request from 'supertest';
import { app } from '../app';
import { prisma } from '../database/client';
import bcrypt from 'bcryptjs';

// ─── Module Mocks ─────────────────────────────────────────────────────────────

jest.mock('../services/webhookDispatcher.service', () => ({
  dispatchWebhookEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../middleware/channelAuth', () => ({
  verifyChannelSignature: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../middleware/channelRateLimiter', () => ({
  channelRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../routes/properties', () => {
  // Prevent `new CoastalCorridorAdapter()` at module scope in properties.ts.
  // ts-jest with esModuleInterop compiles `import propertiesRouter from '...'`
  // to: const _mod = require('...'); const propertiesRouter = _mod.__esModule ? _mod.default : _mod;
  // So we must return { __esModule: true, default: <router> }.
  // The router must be a function (Express Router IS a function).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const express = require('express');
  const router = express.Router();
  return { __esModule: true, default: router };
});

jest.mock('../services/reconciliation.service', () => ({
  dispatchReconciliationNow: jest.fn().mockResolvedValue(undefined),
  initReconciliationCron: jest.fn().mockResolvedValue(undefined),
  closeReconciliationCron: jest.fn().mockResolvedValue(undefined),
  executeReconciliation: jest.fn().mockResolvedValue(undefined),
}));

// ─── Import mocked function ───────────────────────────────────────────────────

import { dispatchWebhookEvent } from '../services/webhookDispatcher.service';
const mockDispatch = dispatchWebhookEvent as jest.MockedFunction<typeof dispatchWebhookEvent>;

/** Flush all pending setImmediate callbacks (two passes to handle nested async setImmediates) */
async function flushSetImmediate(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const TEST_HOST_EMAIL = 'f1-dispatch-host@test.owambe';
let testRoomId: string;
let testPropertyId: string;
let testReservationId: string;

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Clean up any leftover test data from previous runs
  await prisma.commissionAuditLog.deleteMany({
    where: { reservationReference: { startsWith: 'CC-F1-DISPATCH-' } },
  });
  await prisma.stayBooking.deleteMany({
    where: { externalRef: { startsWith: 'F1-DISPATCH-' } },
  });
  await prisma.room.deleteMany({
    where: { property: { host: { user: { email: TEST_HOST_EMAIL } } } },
  });
  await prisma.property.deleteMany({
    where: { host: { user: { email: TEST_HOST_EMAIL } } },
  });
  await prisma.host.deleteMany({
    where: { user: { email: TEST_HOST_EMAIL } },
  });
  await prisma.user.deleteMany({ where: { email: TEST_HOST_EMAIL } });

  // Create host user
  const passwordHash = await bcrypt.hash('Test1234!', 10);
  const hostUser = await prisma.user.create({
    data: {
      email: TEST_HOST_EMAIL,
      passwordHash,
      firstName: 'F1',
      lastName: 'DispatchHost',
      role: 'HOST',
    },
  });

  // Create host profile
  const host = await prisma.host.create({
    data: {
      userId: hostUser.id,
      businessName: 'F1 Dispatch Test Hotel',
    },
  });

  // Create property
  const property = await prisma.property.create({
    data: {
      hostId: host.id,
      name: 'F1 Dispatch Test Property',
      slug: 'f1-dispatch-test-property',
      propertyType: 'HOTEL',
      city: 'Lagos',
      country: 'NG',
    },
  });
  testPropertyId = property.id;

  // Create room
  const room = await prisma.room.create({
    data: {
      propertyId: property.id,
      name: 'Standard Room',
      roomType: 'STANDARD',
      pricePerNight: 50000,
      currency: 'NGN',
    },
  });
  testRoomId = room.id;
});

afterAll(async () => {
  // Clean up all test data
  await prisma.commissionAuditLog.deleteMany({
    where: { reservationReference: { startsWith: 'CC-F1-DISPATCH-' } },
  });
  await prisma.stayBooking.deleteMany({
    where: { externalRef: { startsWith: 'F1-DISPATCH-' } },
  });
  await prisma.room.deleteMany({ where: { id: testRoomId } });
  await prisma.property.deleteMany({ where: { id: testPropertyId } });
  await prisma.host.deleteMany({
    where: { user: { email: TEST_HOST_EMAIL } },
  });
  await prisma.user.deleteMany({ where: { email: TEST_HOST_EMAIL } });
  await prisma.$disconnect();
});

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('OWB-F1-NEW-REFACTOR-01 AC-4: Reservation Event Dispatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // reservation.* events are NOT gated by OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED;
    // set it to 'true' here only to avoid any side effects from the deprecated booking.* gate.
    process.env.OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED;
  });

  // ─── AC-2: reservation.created ────────────────────────────────────────────

  describe('AC-2: reservation.created dispatch on POST /stays/reservations', () => {
    // Each ccId gets unique non-overlapping dates to avoid availability conflicts.
    // F1-DISPATCH-001: Sep 01-05, F1-DISPATCH-002: Sep 10-14, F1-DISPATCH-003: Sep 01-05 (conflict test)
    const DATE_MAP: Record<string, { checkIn: string; checkOut: string }> = {
      'F1-DISPATCH-001': { checkIn: '2026-09-01', checkOut: '2026-09-05' },
      'F1-DISPATCH-002': { checkIn: '2026-09-10', checkOut: '2026-09-14' },
      'F1-DISPATCH-003': { checkIn: '2026-09-01', checkOut: '2026-09-05' }, // intentional conflict
    };
    const makePayload = (ccId: string) => ({
      cc_reservation_id: ccId,
      owambe_room_id: testRoomId,
      guest_first_name: 'Test',
      guest_last_name: 'Guest',
      guest_email: 'guest@coastal.test',
      check_in_date: DATE_MAP[ccId]?.checkIn ?? '2026-09-01',
      check_out_date: DATE_MAP[ccId]?.checkOut ?? '2026-09-05',
      number_of_guests: 2,
      total_amount: 200000,
      currency: 'NGN',
      channel_commission_amount: 20000,
      channel_commission_percent: 10,
      net_to_host: 180000,
      payment_status: 'PAID',
    });

    it('returns HTTP 201 and dispatches reservation.created', async () => {
      const res = await request(app)
        .post('/api/v1/channel/stays/reservations')
        .set('Content-Type', 'application/json')
        .send(makePayload('F1-DISPATCH-001'));

      expect(res.status).toBe(201);
      expect(res.body.owambe_reservation_id).toBeDefined();
      testReservationId = res.body.owambe_reservation_id;

      // Flush the setImmediate fire-and-forget
      await flushSetImmediate();

      expect(mockDispatch).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'reservation.created',
          idempotencyKey: `reservation.created.${testReservationId}`,
        })
      );
    });

    it('reservation.created payload contains Amendment 012 §3.3 minimum-scope fields', async () => {
      // Clean up previous reservation if it exists
      await prisma.commissionAuditLog.deleteMany({
        where: { reservationReference: 'CC-F1-DISPATCH-002' },
      });
      await prisma.stayBooking.deleteMany({
        where: { externalRef: 'F1-DISPATCH-002' },
      });

      const createRes = await request(app)
        .post('/api/v1/channel/stays/reservations')
        .set('Content-Type', 'application/json')
        .send(makePayload('F1-DISPATCH-002'));

      expect(createRes.status).toBe(201);
      const freshId = createRes.body.owambe_reservation_id;

      await flushSetImmediate();

      const callArgs = mockDispatch.mock.calls[0][0];
      const data = callArgs.data as Record<string, unknown>;

      // Amendment 012 §3.3 — reservation.created minimum-scope payload
      expect(data).toMatchObject({
        reservation_id: freshId,
      });
      // Confirm no legacy booking-family fields are present
      expect(data).not.toHaveProperty('owambe_reservation_id');
      expect(data).not.toHaveProperty('cc_reservation_id');
      expect(data).not.toHaveProperty('booking_type');
    });

    it('does NOT dispatch reservation.created on idempotent re-call (returns 200)', async () => {
      // Re-send the same CC reservation ID — should be idempotent
      const res = await request(app)
        .post('/api/v1/channel/stays/reservations')
        .set('Content-Type', 'application/json')
        .send(makePayload('F1-DISPATCH-001')); // already created in first test

      expect(res.status).toBe(200); // idempotent re-call returns 200
      await flushSetImmediate();
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('does NOT dispatch reservation.created if dates are unavailable (409)', async () => {
      // Create a conflicting booking for the same room and overlapping dates
      await prisma.commissionAuditLog.deleteMany({
        where: { reservationReference: 'CC-F1-DISPATCH-BLOCK' },
      });
      await prisma.stayBooking.deleteMany({ where: { externalRef: 'F1-DISPATCH-BLOCK' } });
      await prisma.stayBooking.create({
        data: {
          reference: 'CC-F1-DISPATCH-BLOCK',
          propertyId: testPropertyId,
          roomId: testRoomId,
          guestName: 'Block Guest',
          guestEmail: 'block@coastal.test',
          checkInDate: new Date('2026-09-01'),
          checkOutDate: new Date('2026-09-05'),
          nights: 4,
          totalAmount: 200000,
          depositAmount: 0,
          currency: 'NGN',
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          channelOrigin: 'COASTAL_CORRIDOR',
          externalRef: 'F1-DISPATCH-BLOCK',
        },
      });

      const res = await request(app)
        .post('/api/v1/channel/stays/reservations')
        .set('Content-Type', 'application/json')
        .send(makePayload('F1-DISPATCH-003'));

      expect(res.status).toBe(409);
      await flushSetImmediate();
      expect(mockDispatch).not.toHaveBeenCalled();

      // Clean up the blocking booking
      await prisma.stayBooking.deleteMany({ where: { externalRef: 'F1-DISPATCH-BLOCK' } });
    });
  });

  // ─── AC-3: reservation.cancelled ──────────────────────────────────────────

  describe('AC-3: reservation.cancelled dispatch on PATCH /stays/reservations/:id', () => {
    it('returns HTTP 200 and dispatches reservation.cancelled', async () => {
      // PATCH uses cc_reservation_id in the URL path (externalRef)
      const res = await request(app)
        .patch('/api/v1/channel/stays/reservations/F1-DISPATCH-001')
        .set('Content-Type', 'application/json')
        .send({
          status: 'CANCELLED',
          cancellation_reason: 'Guest request',
          cancellation_initiated_by: 'GUEST',
        });

      expect(res.status).toBe(200);

      await flushSetImmediate();

      // Two dispatch calls are expected for CANCELLED:
      //   1. reservation.cancelled (Amendment 012 new outbound lifecycle event)
      //   2. reservation.cancelled (existing inbound status-change webhook — same event type)
      expect(mockDispatch).toHaveBeenCalledTimes(2);
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'reservation.cancelled',
          idempotencyKey: expect.stringContaining('reservation.cancelled.'),
        })
      );
    });

    it('reservation.cancelled payload contains Amendment 012 §3.4 fields', async () => {
      // Create a fresh reservation to cancel
      await prisma.commissionAuditLog.deleteMany({
        where: { reservationReference: 'CC-F1-DISPATCH-004' },
      });
      await prisma.stayBooking.deleteMany({ where: { externalRef: 'F1-DISPATCH-004' } });

      const createRes = await request(app)
        .post('/api/v1/channel/stays/reservations')
        .set('Content-Type', 'application/json')
        .send({
          cc_reservation_id: 'F1-DISPATCH-004',
          owambe_room_id: testRoomId,
          guest_first_name: 'Cancel',
          guest_last_name: 'Test',
          guest_email: 'cancel@coastal.test',
          check_in_date: '2026-10-01',
          check_out_date: '2026-10-03',
          number_of_guests: 1,
          total_amount: 100000,
          currency: 'NGN',
          payment_status: 'PAID',
        });
      expect(createRes.status).toBe(201);
      const freshId = createRes.body.owambe_reservation_id;
      jest.clearAllMocks();

      await request(app)
        .patch('/api/v1/channel/stays/reservations/F1-DISPATCH-004')
        .set('Content-Type', 'application/json')
        .send({
          status: 'CANCELLED',
          cancellation_reason: 'Guest request',
          cancellation_initiated_by: 'GUEST',
        });

      await flushSetImmediate();

      // Find the Amendment 012 reservation.cancelled call specifically
      // (identified by idempotencyKey prefix — the new dispatch uses 'reservation.cancelled.<id>')
      const a012CancelledCall = mockDispatch.mock.calls.find(
        (call) =>
          call[0]?.eventType === 'reservation.cancelled' &&
          call[0]?.idempotencyKey === `reservation.cancelled.${freshId}`
      );
      expect(a012CancelledCall).toBeDefined();
      const callArgs = a012CancelledCall![0];
      const data = callArgs.data as Record<string, unknown>;

      // Amendment 012 §3.4 — reservation.cancelled payload
      expect(data).toMatchObject({
        reservation_id: freshId,
        reason: 'Guest request',
      });
      // Confirm no legacy booking-family fields are present
      expect(data).not.toHaveProperty('owambe_reservation_id');
      expect(data).not.toHaveProperty('booking_type');
      expect(data).not.toHaveProperty('previous_status');
      expect(data).not.toHaveProperty('new_status');
    });
  });

  // ─── AC-4: reservation.refunded ───────────────────────────────────────────

  describe('AC-4: reservation.refunded dispatch on PATCH /stays/reservations/:id', () => {
    it('returns HTTP 200 and dispatches reservation.refunded', async () => {
      // Create a fresh reservation, cancel it, then refund it
      // (CONFIRMED → CANCELLED → REFUNDED is the valid transition path)
      await prisma.commissionAuditLog.deleteMany({
        where: { reservationReference: 'CC-F1-DISPATCH-005' },
      });
      await prisma.stayBooking.deleteMany({ where: { externalRef: 'F1-DISPATCH-005' } });

      const createRes = await request(app)
        .post('/api/v1/channel/stays/reservations')
        .set('Content-Type', 'application/json')
        .send({
          cc_reservation_id: 'F1-DISPATCH-005',
          owambe_room_id: testRoomId,
          guest_first_name: 'Refund',
          guest_last_name: 'Test',
          guest_email: 'refund@coastal.test',
          check_in_date: '2026-11-01',
          check_out_date: '2026-11-03',
          number_of_guests: 1,
          total_amount: 100000,
          currency: 'NGN',
          payment_status: 'PAID',
        });
      expect(createRes.status).toBe(201);
      const freshId = createRes.body.owambe_reservation_id;
      jest.clearAllMocks();

      // First cancel it
      await request(app)
        .patch('/api/v1/channel/stays/reservations/F1-DISPATCH-005')
        .set('Content-Type', 'application/json')
        .send({ status: 'CANCELLED', cancellation_reason: 'Host cancellation', cancellation_initiated_by: 'HOST' });
      jest.clearAllMocks();

      // Now refund it
      const res = await request(app)
        .patch('/api/v1/channel/stays/reservations/F1-DISPATCH-005')
        .set('Content-Type', 'application/json')
        .send({
          status: 'REFUNDED',
          refund_amount: 100000,
          refund_currency: 'NGN',
        });

      expect(res.status).toBe(200);

      await flushSetImmediate();

      // Two dispatch calls are expected for REFUNDED:
      //   1. reservation.refunded (Amendment 012 new outbound lifecycle event)
      //   2. reservation.status_changed (existing inbound status-change webhook — REFUNDED not in eventTypeMap)
      expect(mockDispatch).toHaveBeenCalledTimes(2);
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'reservation.refunded',
          idempotencyKey: `reservation.refunded.${freshId}`,
        })
      );
    });

    it('reservation.refunded payload contains Amendment 012 §3.5 fields', async () => {
      // Create a fresh reservation, cancel it, then refund it
      await prisma.commissionAuditLog.deleteMany({
        where: { reservationReference: 'CC-F1-DISPATCH-006' },
      });
      await prisma.stayBooking.deleteMany({ where: { externalRef: 'F1-DISPATCH-006' } });

      const createRes = await request(app)
        .post('/api/v1/channel/stays/reservations')
        .set('Content-Type', 'application/json')
        .send({
          cc_reservation_id: 'F1-DISPATCH-006',
          owambe_room_id: testRoomId,
          guest_first_name: 'Refund2',
          guest_last_name: 'Test',
          guest_email: 'refund2@coastal.test',
          check_in_date: '2026-12-01',
          check_out_date: '2026-12-03',
          number_of_guests: 1,
          total_amount: 150000,
          currency: 'NGN',
          payment_status: 'PAID',
        });
      expect(createRes.status).toBe(201);
      const freshId = createRes.body.owambe_reservation_id;
      jest.clearAllMocks();

      // Cancel first, then refund
      await request(app)
        .patch('/api/v1/channel/stays/reservations/F1-DISPATCH-006')
        .set('Content-Type', 'application/json')
        .send({ status: 'CANCELLED', cancellation_reason: 'Host cancellation', cancellation_initiated_by: 'HOST' });
      jest.clearAllMocks();

      await request(app)
        .patch('/api/v1/channel/stays/reservations/F1-DISPATCH-006')
        .set('Content-Type', 'application/json')
        .send({
          status: 'REFUNDED',
          refund_amount: 150000,
          refund_currency: 'NGN',
        });

      await flushSetImmediate();

      // Find the Amendment 012 reservation.refunded call specifically
      const a012RefundedCall = mockDispatch.mock.calls.find(
        (call) =>
          call[0]?.eventType === 'reservation.refunded' &&
          call[0]?.idempotencyKey === `reservation.refunded.${freshId}`
      );
      expect(a012RefundedCall).toBeDefined();
      const callArgs = a012RefundedCall![0];
      const data = callArgs.data as Record<string, unknown>;

      // Amendment 012 §3.5 — reservation.refunded payload
      expect(data).toMatchObject({
        reservation_id: freshId,
        refund_amount: 150000,
      });
      // Confirm no legacy booking-family fields are present
      expect(data).not.toHaveProperty('owambe_reservation_id');
      expect(data).not.toHaveProperty('booking_type');
      expect(data).not.toHaveProperty('previous_status');
      expect(data).not.toHaveProperty('new_status');
      expect(data).not.toHaveProperty('refund_currency');
    });
  });

  // ─── AC-5/6/7: HTTP Outcome Contract ──────────────────────────────────────

  describe('AC-5/6/7: HTTP outcome contract — dispatch does not delay response', () => {
    it('201 response is returned before dispatch completes', async () => {
      // Make dispatch artificially slow
      mockDispatch.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000))
      );

      await prisma.commissionAuditLog.deleteMany({
        where: { reservationReference: 'CC-F1-DISPATCH-007' },
      });
      await prisma.stayBooking.deleteMany({ where: { externalRef: 'F1-DISPATCH-007' } });

      const start = Date.now();
      const res = await request(app)
        .post('/api/v1/channel/stays/reservations')
        .set('Content-Type', 'application/json')
        .send({
          cc_reservation_id: 'F1-DISPATCH-007',
          owambe_room_id: testRoomId,
          guest_first_name: 'Fast',
          guest_last_name: 'Guest',
          guest_email: 'fast@coastal.test',
          check_in_date: '2027-01-01',
          check_out_date: '2027-01-03',
          number_of_guests: 1,
          total_amount: 100000,
          currency: 'NGN',
          payment_status: 'PAID',
        });
      const elapsed = Date.now() - start;

      expect(res.status).toBe(201);
      // Response must arrive well before the 5-second dispatch delay
      expect(elapsed).toBeLessThan(4000);
    });
  });

  // ─── Dispatch-always guard ─────────────────────────────────────────────────

  describe('Dispatch-always guard: reservation.* events are not gated by booking events flag', () => {
    it('dispatches reservation.created even when OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED is false', async () => {
      // reservation.* events are Amendment 012 canonical and are NOT gated by
      // the deprecated OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED flag.
      process.env.OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED = 'false';

      await prisma.commissionAuditLog.deleteMany({
        where: { reservationReference: 'CC-F1-DISPATCH-008' },
      });
      await prisma.stayBooking.deleteMany({ where: { externalRef: 'F1-DISPATCH-008' } });

      const res = await request(app)
        .post('/api/v1/channel/stays/reservations')
        .set('Content-Type', 'application/json')
        .send({
          cc_reservation_id: 'F1-DISPATCH-008',
          owambe_room_id: testRoomId,
          guest_first_name: 'AlwaysDispatch',
          guest_last_name: 'Guest',
          guest_email: 'alwaysdispatch@coastal.test',
          check_in_date: '2027-02-01',
          check_out_date: '2027-02-03',
          number_of_guests: 1,
          total_amount: 100000,
          currency: 'NGN',
          payment_status: 'PAID',
        });

      expect(res.status).toBe(201);
      await flushSetImmediate();
      // reservation.created is NOT gated by the booking events flag — must always dispatch
      expect(mockDispatch).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'reservation.created' })
      );
    });
  });
});
