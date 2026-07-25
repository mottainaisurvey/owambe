// ─── gco01GuestCheckout.test.ts ──────────────────────
// OWB-C-GUEST-CHECKOUT-01 — G-7 test suite
// Tests: guest booking creation, PII gating, claim flow, idempotency, regression.
// G-4(i) inherited residual: URL state preservation is a web-layer concern; tested
//   via integration smoke (AC-3) rather than API unit tests.

import request from 'supertest';
import { app } from '../app';
import { prisma } from '../database/client';
import { cacheGet, cacheSet } from '../services/cache.service';
import * as paystackService from '../services/paystack.service';
import * as emailService from '../services/email.service';

// ── Mocks ────────────────────────────────────────────
jest.mock('../services/paystack.service');
jest.mock('../services/email.service');
jest.mock('../services/cache.service');

const mockInitializeTransaction = paystackService.initializeTransaction as jest.Mock;
const mockVerifyTransaction = paystackService.verifyTransaction as jest.Mock;
const mockSendEmail = emailService.sendEmail as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;

// ── Fixtures ─────────────────────────────────────────
let operatorUserId: string;
let operatorId: string;
let experienceId: string;
let slotId: string;
let consumerToken: string;
let consumerUserId: string;

beforeAll(async () => {
  // Operator
  const opUser = await prisma.user.create({
    data: {
      email: `gco01-operator-${Date.now()}@test.owambe.com`,
      role: 'OPERATOR',
      firstName: 'GCO01',
      lastName: 'Operator',
      activeMode: 'EXPERIENCES',
      availableModes: ['EXPERIENCES'],
    }
  });
  operatorUserId = opUser.id;
  const op = await prisma.operator.create({
    data: { userId: opUser.id, businessName: 'GCO01 Test Operator', isApproved: true }
  });
  operatorId = op.id;

  // Experience
  const exp = await prisma.experience.create({
    data: {
      operatorId: op.id,
      name: 'GCO01 Test Experience',
      slug: `gco01-exp-${Date.now()}`,
      description: 'Guest checkout test experience',
      experienceType: 'CULTURAL_TOUR',
      city: 'Lagos',
      country: 'Nigeria',
      pricePerPerson: 5000,
      currency: 'NGN',
      isActive: true,
      isApproved: true,
    }
  });
  experienceId = exp.id;

  // Slot (future)
  const slot = await prisma.experienceSlot.create({
    data: {
      experienceId: exp.id,
      startTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
      capacity: 20,
      bookedCount: 0,
      isActive: true,
    }
  });
  slotId = slot.id;

  // Consumer user + JWT
  const consUser = await prisma.user.create({
    data: {
      email: `gco01-consumer-${Date.now()}@test.owambe.com`,
      role: 'CONSUMER',
      firstName: 'GCO01',
      lastName: 'Consumer',
      activeMode: 'STAYS',
      availableModes: ['STAYS'],
    }
  });
  consumerUserId = consUser.id;
  const jwt = require('jsonwebtoken');
  consumerToken = jwt.sign({ userId: consUser.id, role: 'CONSUMER' }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
});

afterAll(async () => {
  // Cleanup in dependency order
  await prisma.guestClaimToken.deleteMany({ where: { guestEmail: { contains: 'gco01' } } });
  await prisma.experienceBooking.deleteMany({ where: { experienceId } });
  await prisma.experienceSlot.deleteMany({ where: { experienceId } });
  await prisma.experience.deleteMany({ where: { id: experienceId } });
  await prisma.operator.deleteMany({ where: { id: operatorId } });
  await prisma.user.deleteMany({ where: { id: { in: [operatorUserId, consumerUserId] } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCacheGet.mockResolvedValue(null);
  mockCacheSet.mockResolvedValue(undefined);
  mockSendEmail.mockResolvedValue(undefined);
  mockInitializeTransaction.mockResolvedValue({
    authorization_url: 'https://paystack.com/pay/test',
    reference: `PSK-${Date.now()}`,
    access_code: 'test-access-code',
  });
});

// ─────────────────────────────────────────────────────
// G-2: Guest booking creation
// ─────────────────────────────────────────────────────
describe('G-2: Guest booking creation', () => {
  it('GCO01-T01: creates a booking without auth when guestName + guestEmail supplied', async () => {
    const res = await request(app)
      .post('/api/experience-bookings')
      .send({ slotId, guestCount: 2, guestName: 'Amara Okafor', guestEmail: 'amara.gco01@test.owambe.com' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.isGuestBooking).toBe(true);
    expect(res.body.data.guestName).toBe('Amara Okafor');
    expect(res.body.data.guestEmail).toBe('amara.gco01@test.owambe.com');
    expect(res.body.data.guestUserId).toBeNull();
    expect(res.body.payment).toBeTruthy();
  });

  it('GCO01-T02: rejects guest booking with missing guestName', async () => {
    const res = await request(app)
      .post('/api/experience-bookings')
      .send({ slotId, guestCount: 1, guestEmail: 'amara.gco01@test.owambe.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/guestName/i);
  });

  it('GCO01-T03: rejects guest booking with missing guestEmail', async () => {
    const res = await request(app)
      .post('/api/experience-bookings')
      .send({ slotId, guestCount: 1, guestName: 'Amara Okafor' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/guestEmail/i);
  });

  it('GCO01-T04: rejects guest booking with invalid email format', async () => {
    const res = await request(app)
      .post('/api/experience-bookings')
      .send({ slotId, guestCount: 1, guestName: 'Amara Okafor', guestEmail: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid email/i);
  });

  it('GCO01-T05: authenticated booking still works (regression — guestName/guestEmail ignored)', async () => {
    const res = await request(app)
      .post('/api/experience-bookings')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ slotId, guestCount: 1 });

    expect(res.status).toBe(201);
    expect(res.body.isGuestBooking).toBe(false);
    expect(res.body.data.guestUserId).toBe(consumerUserId);
  });

  it('GCO01-T06: rejects booking with invalid Bearer token (G-2 token-presented-but-bad path)', async () => {
    const res = await request(app)
      .post('/api/experience-bookings')
      .set('Authorization', 'Bearer invalid.token.here')
      .send({ slotId, guestCount: 1, guestName: 'Test', guestEmail: 'test@test.com' });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────
// G-3: Idempotency
// ─────────────────────────────────────────────────────
describe('G-3: Idempotency', () => {
  it('GCO01-T07: returns cached response on duplicate X-Idempotency-Key', async () => {
    const cachedBody = { success: true, data: { id: 'cached-booking-id' }, payment: null, isGuestBooking: true };
    mockCacheGet.mockResolvedValueOnce(cachedBody);

    const res = await request(app)
      .post('/api/experience-bookings')
      .set('X-Idempotency-Key', 'test-idempotency-key-001')
      .send({ slotId, guestCount: 1, guestName: 'Idempotent User', guestEmail: 'idempotent@test.owambe.com' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('cached-booking-id');
    expect(mockInitializeTransaction).not.toHaveBeenCalled();
    expect(mockCacheGet).toHaveBeenCalledWith('idempotency:booking:test-idempotency-key-001');
  });

  it('GCO01-T08: stores response in cache when X-Idempotency-Key provided', async () => {
    mockCacheGet.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/experience-bookings')
      .set('X-Idempotency-Key', 'test-idempotency-key-002')
      .send({ slotId, guestCount: 1, guestName: 'Cache Store User', guestEmail: 'cachestore.gco01@test.owambe.com' });

    expect(res.status).toBe(201);
    expect(mockCacheSet).toHaveBeenCalledWith(
      'idempotency:booking:test-idempotency-key-002',
      expect.objectContaining({ success: true }),
      86400
    );
  });

  it('GCO01-T09: does not call cacheSet when no X-Idempotency-Key header', async () => {
    const res = await request(app)
      .post('/api/experience-bookings')
      .send({ slotId, guestCount: 1, guestName: 'No Key User', guestEmail: 'nokey.gco01@test.owambe.com' });

    expect(res.status).toBe(201);
    expect(mockCacheSet).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────
// G-4(ii): Public retrieval route — PII gating
// ─────────────────────────────────────────────────────
describe('G-4(ii): Public retrieval — PII gating', () => {
  let publicBookingRef: string;

  beforeAll(async () => {
    // Create a confirmed booking for public retrieval tests
    const booking = await prisma.experienceBooking.create({
      data: {
        experienceId,
        slotId,
        guestName: 'Public Test Guest',
        guestEmail: 'public.gco01@test.owambe.com',
        guestPhone: '+2348000000001',
        guestCount: 1,
        totalAmount: 5000,
        currency: 'NGN',
        reference: `EXP-PUBLIC-${Date.now()}`,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
      }
    });
    publicBookingRef = booking.reference;
  });

  it('GCO01-T10: returns booking without PII fields on public route', async () => {
    const res = await request(app)
      .get(`/api/experience-bookings/public/${publicBookingRef}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reference).toBe(publicBookingRef);
    // PII fields must NOT be present
    expect(res.body.data.guestName).toBeUndefined();
    expect(res.body.data.guestEmail).toBeUndefined();
    expect(res.body.data.guestPhone).toBeUndefined();
    expect(res.body.data.guestUserId).toBeUndefined();
    expect(res.body.data.meetingDetails).toBeUndefined();
    // Safe fields must be present
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(res.body.data.guestCount).toBe(1);
    expect(res.body.data.experience).toBeTruthy();
  });

  it('GCO01-T11: returns 404 for unknown reference on public route', async () => {
    const res = await request(app)
      .get('/api/experience-bookings/public/EXP-NONEXISTENT-REF');
    expect(res.status).toBe(404);
  });

  it('GCO01-T12: public route does not require Authorization header', async () => {
    const res = await request(app)
      .get(`/api/experience-bookings/public/${publicBookingRef}`);
    // No Authorization header — must succeed
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────
// G-5: Claim account (magic link)
// ─────────────────────────────────────────────────────
describe('G-5: Claim account', () => {
  let guestBookingId: string;

  beforeAll(async () => {
    const booking = await prisma.experienceBooking.create({
      data: {
        experienceId,
        slotId,
        guestName: 'Claim Test Guest',
        guestEmail: `claim-gco01-${Date.now()}@test.owambe.com`,
        guestCount: 1,
        totalAmount: 5000,
        currency: 'NGN',
        reference: `EXP-CLAIM-${Date.now()}`,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        guestUserId: null,
        guestId: null,
      }
    });
    guestBookingId = booking.id;
  });

  it('GCO01-T13: sends magic link for a confirmed guest booking', async () => {
    const res = await request(app)
      .post(`/api/experience-bookings/${guestBookingId}/claim-account`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/magic link/i);
    expect(res.body.emailSentTo).toBeTruthy();

    // GuestClaimToken must be created in DB
    const token = await prisma.guestClaimToken.findFirst({ where: { bookingId: guestBookingId, usedAt: null } });
    expect(token).not.toBeNull();
    expect(token!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('GCO01-T14: rejects claim for booking already linked to an account', async () => {
    // Create a booking with guestUserId set
    const linkedBooking = await prisma.experienceBooking.create({
      data: {
        experienceId,
        slotId,
        guestName: 'Linked Guest',
        guestEmail: `linked-gco01-${Date.now()}@test.owambe.com`,
        guestCount: 1,
        totalAmount: 5000,
        currency: 'NGN',
        reference: `EXP-LINKED-${Date.now()}`,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        guestUserId: consumerUserId,
        guestId: consumerUserId,
      }
    });

    const res = await request(app)
      .post(`/api/experience-bookings/${linkedBooking.id}/claim-account`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already linked/i);
  });

  it('GCO01-T15: rejects claim for unpaid booking', async () => {
    const pendingBooking = await prisma.experienceBooking.create({
      data: {
        experienceId,
        slotId,
        guestName: 'Pending Guest',
        guestEmail: `pending-gco01-${Date.now()}@test.owambe.com`,
        guestCount: 1,
        totalAmount: 5000,
        currency: 'NGN',
        reference: `EXP-PENDING-${Date.now()}`,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        guestUserId: null,
        guestId: null,
      }
    });

    const res = await request(app)
      .post(`/api/experience-bookings/${pendingBooking.id}/claim-account`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/payment is confirmed/i);
  });

  it('GCO01-T16: rejects claim when account already exists for guest email', async () => {
    // Create a user with the same email as the booking
    const existingEmail = `existing-gco01-${Date.now()}@test.owambe.com`;
    await prisma.user.create({
      data: { email: existingEmail, role: 'CONSUMER', firstName: 'Existing', lastName: 'User', activeMode: 'STAYS', availableModes: ['STAYS'] }
    });

    const booking = await prisma.experienceBooking.create({
      data: {
        experienceId,
        slotId,
        guestName: 'Existing Email Guest',
        guestEmail: existingEmail,
        guestCount: 1,
        totalAmount: 5000,
        currency: 'NGN',
        reference: `EXP-EXISTING-${Date.now()}`,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        guestUserId: null,
        guestId: null,
      }
    });

    const res = await request(app)
      .post(`/api/experience-bookings/${booking.id}/claim-account`);
    expect(res.status).toBe(400);
    expect(res.body.hint).toBe('sign_in');
  });

  it('GCO01-T17: supersedes previous unused token on re-claim', async () => {
    // Re-call claim on the same booking — should invalidate previous token and create new one
    const res = await request(app)
      .post(`/api/experience-bookings/${guestBookingId}/claim-account`);
    expect(res.status).toBe(200);

    // Only one unused token should exist
    const unusedTokens = await prisma.guestClaimToken.findMany({ where: { bookingId: guestBookingId, usedAt: null } });
    expect(unusedTokens.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────
// G-4(i) inherited residual note
// ─────────────────────────────────────────────────────
// URL state preservation (?exp=<id>&slot=<id> → login → restore) is a web-layer
// concern implemented in ExperiencesBookingClient. It is tested via the AC-3
// browser smoke rather than API unit tests. This comment documents the inherited
// scope per the Cycle 2 G-4(i) residual transfer.

// ─────────────────────────────────────────────────────
// Regression: existing C3 invariants
// ─────────────────────────────────────────────────────
describe('Regression: C3 invariants', () => {
  it('GCO01-T18: GET /api/experience-bookings requires auth', async () => {
    const res = await request(app).get('/api/experience-bookings');
    expect(res.status).toBe(401);
  });

  it('GCO01-T19: GET /api/experience-bookings/:id requires auth', async () => {
    const res = await request(app).get('/api/experience-bookings/some-id');
    expect(res.status).toBe(401);
  });

  it('GCO01-T20: POST /api/experience-bookings/:id/cancel requires auth', async () => {
    const res = await request(app).post('/api/experience-bookings/some-id/cancel');
    expect(res.status).toBe(401);
  });

  it('GCO01-T21: POST / rejects missing slotId', async () => {
    const res = await request(app)
      .post('/api/experience-bookings')
      .send({ guestCount: 1, guestName: 'Test', guestEmail: 'test@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/slotId/i);
  });

  it('GCO01-T22: POST / rejects guestCount < 1', async () => {
    const res = await request(app)
      .post('/api/experience-bookings')
      .send({ slotId, guestCount: 0, guestName: 'Test', guestEmail: 'test@test.com' });
    expect(res.status).toBe(400);
  });
});
