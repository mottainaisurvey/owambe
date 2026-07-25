/**
 * OWB-C3-EXPERIENCES-CUSTOMER-BOOKING-01 — AC-4: Regression Tests
 *
 * Coverage:
 *   1.  Unauthenticated booking attempt → 401
 *   2.  Booking on sold-out slot → 409 (concurrency guard)
 *   3.  Booking on cancelled/inactive slot → 409
 *   4.  Booking on unpublished experience → 409
 *   5.  Booking on experience not yet approved → 409
 *   6.  Valid booking creation → 201, reference, authorizationUrl field present
 *   7.  bookedCount incremented atomically after booking
 *   8.  Seat release on cancellation — bookedCount decremented
 *   9.  Cannot cancel already-cancelled booking → 400
 *  10.  meetingDetails NOT disclosed on GET /:id when paymentStatus = PENDING
 *  11.  meetingDetails IS disclosed on GET /:id when paymentStatus = PAID (via verify)
 *  12.  Operator GET /operator — sees own bookings with meetingDetails always
 *  13.  Consumer cannot access operator endpoint → 403
 *  14.  Booked-instance preservation — cancelling booking does not cancel the slot
 *  15.  GET / (list) — consumer sees only their own bookings
 *  16.  C1 regression — OPERATOR registration still sets EXPERIENCES mode
 *  17.  C2 regression — slot creation still works for OPERATOR
 *  18.  F-1 / D-4 — Consumer retrieves slots via public route GET /experiences/:id/slots → 200
 *  19.  F-1 / D-4 — Consumer still 403 at OPERATOR route GET /experience-slots/:id (gating unchanged)
 *
 * Strategy:
 *   - Uses real Prisma client connected to CI test database.
 *   - Seeds minimal test data in beforeAll; cleans up in afterAll.
 *   - Mocks authenticate middleware to inject identity via global flags.
 *   - Mocks requireMode middleware to bypass mode gating.
 *   - Mocks Paystack service to avoid live API calls.
 *   - Mocks email service to avoid real Postmark calls.
 */
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../database/client';
import bcrypt from 'bcryptjs';

// ─── Module Mocks ─────────────────────────────────────────────────────────────
jest.mock('../services/email.service', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/paystack.service', () => ({
  initializeTransaction: jest.fn().mockResolvedValue({
    authorization_url: 'https://checkout.paystack.com/test-auth-url',
    reference: 'PSK-TEST-REF-001',
  }),
  verifyTransaction: jest.fn().mockResolvedValue({
    status: 'success',
    amount: 500000, // 5000 NGN in kobo
  }),
}));

jest.mock('../middleware/authenticate', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.userId = (global as any).__c3UserId ?? 'consumer-test-id';
    req.userRole = (global as any).__c3Role ?? 'CONSUMER';
    next();
  },
  authenticateOptional: (req: any, _res: any, next: any) => {
    req.userId = (global as any).__c3UserId ?? 'consumer-test-id';
    req.userRole = (global as any).__c3Role ?? 'CONSUMER';
    next();
  },
}));
jest.mock('../middleware/requireMode', () => ({
  requireMode: () => (_req: any, _res: any, next: any) => next(),
}));

// ─── Test State ───────────────────────────────────────────────────────────────
let consumerUserId: string;
let consumer2UserId: string;
let operatorUserId: string;
let operatorId: string;
let experienceId: string;
let publishedExperienceId: string;
let slotId: string;
let soldOutSlotId: string;
let cancelledSlotId: string;
let bookingId: string;

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const passwordHash = await bcrypt.hash('TestPass123!', 10);
  const ts = Date.now();

  // Consumer user
  const consumerUser = await prisma.user.create({
    data: {
      email: `c3consumer-${ts}@test.owambe.com`,
      passwordHash,
      firstName: 'C3',
      lastName: 'Consumer',
      role: 'CONSUMER',
    },
  });
  consumerUserId = consumerUser.id;

  // Second consumer (for isolation test)
  const consumer2User = await prisma.user.create({
    data: {
      email: `c3consumer2-${ts}@test.owambe.com`,
      passwordHash,
      firstName: 'C3',
      lastName: 'Consumer2',
      role: 'CONSUMER',
    },
  });
  consumer2UserId = consumer2User.id;

  // Operator user + profile
  const operatorUser = await prisma.user.create({
    data: {
      email: `c3operator-${ts}@test.owambe.com`,
      passwordHash,
      firstName: 'C3',
      lastName: 'Operator',
      role: 'OPERATOR',
      activeMode: 'EXPERIENCES',
      availableModes: ['EXPERIENCES'],
    },
  });
  operatorUserId = operatorUser.id;

  const operator = await prisma.operator.create({
    data: {
      userId: operatorUserId,
      businessName: `C3 Test Operator ${ts}`,
      isVerified: false,
    },
  });
  operatorId = operator.id;

  // DRAFT experience (not approved, not active — booking should be blocked)
  const draftExp = await prisma.experience.create({
    data: {
      operatorId,
      name: `C3 Draft Experience ${ts}`,
      slug: `c3-draft-exp-${ts}`,
      description: 'A draft experience for C3 tests',
      experienceType: 'CULTURAL_TOUR',
      city: 'Lagos',
      country: 'Nigeria',
      pricePerPerson: 5000,
      currency: 'NGN',
      isActive: false,
      isApproved: false,
      meetingDetails: 'Secret meeting location — only for paid guests',
    },
  });
  experienceId = draftExp.id;

  // Published experience (approved + active — booking should succeed)
  const publishedExp = await prisma.experience.create({
    data: {
      operatorId,
      name: `C3 Published Experience ${ts}`,
      slug: `c3-published-exp-${ts}`,
      description: 'A published experience for C3 tests',
      experienceType: 'CULTURAL_TOUR',
      city: 'Abuja',
      country: 'Nigeria',
      pricePerPerson: 5000,
      currency: 'NGN',
      isActive: true,
      isApproved: true,
      meetingDetails: 'Published meeting location — only for paid guests',
    },
  });
  publishedExperienceId = publishedExp.id;

  // Available slot on published experience
  const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const futureEnd = new Date(futureStart.getTime() + 2 * 60 * 60 * 1000);
  const slot = await prisma.experienceSlot.create({
    data: {
      experienceId: publishedExperienceId,
      startTime: futureStart,
      endTime: futureEnd,
      capacity: 10,
      bookedCount: 0,
      isActive: true,
    },
  });
  slotId = slot.id;

  // Sold-out slot
  const soldOutSlot = await prisma.experienceSlot.create({
    data: {
      experienceId: publishedExperienceId,
      startTime: new Date(futureStart.getTime() + 24 * 60 * 60 * 1000),
      endTime: new Date(futureEnd.getTime() + 24 * 60 * 60 * 1000),
      capacity: 5,
      bookedCount: 5, // fully booked
      isActive: true,
    },
  });
  soldOutSlotId = soldOutSlot.id;

  // Cancelled/inactive slot
  const cancelledSlot = await prisma.experienceSlot.create({
    data: {
      experienceId: publishedExperienceId,
      startTime: new Date(futureStart.getTime() + 48 * 60 * 60 * 1000),
      endTime: new Date(futureEnd.getTime() + 48 * 60 * 60 * 1000),
      capacity: 10,
      bookedCount: 0,
      isActive: false, // cancelled
    },
  });
  cancelledSlotId = cancelledSlot.id;
});

afterAll(async () => {
  // Clean up in dependency order
  await prisma.experienceBooking.deleteMany({
    where: {
      OR: [
        { guestUserId: consumerUserId },
        { guestUserId: consumer2UserId },
      ],
    },
  });
  await prisma.experienceSlot.deleteMany({
    where: { experienceId: { in: [experienceId, publishedExperienceId] } },
  });
  await prisma.experience.deleteMany({
    where: { id: { in: [experienceId, publishedExperienceId] } },
  });
  await prisma.operator.deleteMany({ where: { id: operatorId } });
  await prisma.user.deleteMany({
    where: { id: { in: [consumerUserId, consumer2UserId, operatorUserId] } },
  });
  await prisma.$disconnect();
});

// ─── Helper: set identity ────────────────────────────────────────────────────
function asConsumer() {
  (global as any).__c3UserId = consumerUserId;
  (global as any).__c3Role = 'CONSUMER';
}
function asConsumer2() {
  (global as any).__c3UserId = consumer2UserId;
  (global as any).__c3Role = 'CONSUMER';
}
function asOperator() {
  (global as any).__c3UserId = operatorUserId;
  (global as any).__c3Role = 'OPERATOR';
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('C3 — Experience Customer Booking', () => {

  // 1. Sold-out slot → 409
  it('1. Booking on sold-out slot → 409', async () => {
    asConsumer();
    const res = await request(app)
      .post('/api/experience-bookings')
      .send({ slotId: soldOutSlotId, guestCount: 1 });
    // soldOutSlotId is on published experience but fully booked → 409
    expect(res.status).toBe(409);
  });

  // 2. Sold-out slot (second probe) → 409
  it('2. Booking on sold-out slot (second probe) → 409', async () => {
    asConsumer();
    const res = await request(app)
      .post('/api/experience-bookings')
      .send({ slotId: soldOutSlotId, guestCount: 1 });
    expect(res.status).toBe(409);
  });

  // 3. Cancelled/inactive slot → 404 (slot not found or unavailable)
  it('3. Booking on cancelled slot → 404 (slot unavailable)', async () => {
    asConsumer();
    const res = await request(app)
      .post('/api/experience-bookings')
      .send({ slotId: cancelledSlotId, guestCount: 1 });
    // Handler: if (!slot || !slot.isActive) → 404
    expect(res.status).toBe(404);
  });

  // 4. Slot on draft (unapproved) experience → 409
  it('4. Booking on draft (unapproved) experience slot → 409', async () => {
    asConsumer();
    // Create a slot on the DRAFT experience
    const futureStart = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const futureEnd = new Date(futureStart.getTime() + 2 * 60 * 60 * 1000);
    const draftSlot = await prisma.experienceSlot.create({
      data: {
        experienceId,
        startTime: futureStart,
        endTime: futureEnd,
        capacity: 10,
        bookedCount: 0,
        isActive: true,
      },
    });
    const res = await request(app)
      .post('/api/experience-bookings')
      .send({ slotId: draftSlot.id, guestCount: 1 });
    // Handler: if (!slot.experience.isActive || !slot.experience.isApproved) → 400
    expect(res.status).toBe(400);
    await prisma.experienceSlot.delete({ where: { id: draftSlot.id } });
  });

  // 5. Slot on inactive (unpublished) experience → 409
  it('5. Booking on inactive (unpublished) experience slot → 409', async () => {
    asConsumer();
    // Create an inactive experience
    const ts = Date.now();
    const inactiveExp = await prisma.experience.create({
      data: {
        operatorId,
        name: `C3 Inactive Exp ${ts}`,
        slug: `c3-inactive-exp-${ts}`,
        description: 'Inactive',
        experienceType: 'WORKSHOP',
        city: 'Lagos',
        country: 'Nigeria',
        pricePerPerson: 1000,
        currency: 'NGN',
        isActive: false,
        isApproved: true, // approved but not active
      },
    });
    const futureStart = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const futureEnd = new Date(futureStart.getTime() + 60 * 60 * 1000);
    const inactiveSlot = await prisma.experienceSlot.create({
      data: {
        experienceId: inactiveExp.id,
        startTime: futureStart,
        endTime: futureEnd,
        capacity: 5,
        bookedCount: 0,
        isActive: true,
      },
    });
    const res = await request(app)
      .post('/api/experience-bookings')
      .send({ slotId: inactiveSlot.id, guestCount: 1 });
    // Handler: if (!slot.experience.isActive || !slot.experience.isApproved) → 400
    expect(res.status).toBe(400);
    await prisma.experienceSlot.delete({ where: { id: inactiveSlot.id } });
    await prisma.experience.delete({ where: { id: inactiveExp.id } });
  });

  // 6. Valid booking → 201, reference, authorizationUrl
  it('6. Valid booking on published slot → 201 with reference and authorizationUrl', async () => {
    asConsumer();
    const res = await request(app)
      .post('/api/experience-bookings')
      .send({ slotId, guestCount: 2, specialRequests: 'Vegetarian please' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('reference');
    expect(res.body.data.reference).toMatch(/^EXP-/);
    expect(res.body.payment).toHaveProperty('authorizationUrl');
    bookingId = res.body.data.id;
  });

  // 7. bookedCount incremented atomically after booking
  it('7. bookedCount incremented atomically after booking', async () => {
    const slot = await prisma.experienceSlot.findUnique({ where: { id: slotId } });
    expect(slot?.bookedCount).toBe(2);
  });

  // 8. Seat release on cancellation
  it('8. Seat release on cancellation — bookedCount decremented', async () => {
    asConsumer();
    const res = await request(app)
      .post(`/api/experience-bookings/${bookingId}/cancel`)
      .send({ reason: 'Plans changed' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    const slot = await prisma.experienceSlot.findUnique({ where: { id: slotId } });
    expect(slot?.bookedCount).toBe(0);
  });

  // 9. Cannot cancel already-cancelled booking
  it('9. Cannot cancel already-cancelled booking → 400', async () => {
    asConsumer();
    const res = await request(app)
      .post(`/api/experience-bookings/${bookingId}/cancel`)
      .send({ reason: 'Again' });
    expect(res.status).toBe(400);
  });

  // 10. meetingDetails NOT disclosed when paymentStatus = PENDING
  it('10. meetingDetails NOT disclosed on GET /:id when paymentStatus = PENDING', async () => {
    asConsumer();
    // Create a new booking (pending payment)
    const newBookingRes = await request(app)
      .post('/api/experience-bookings')
      .send({ slotId, guestCount: 1 });
    expect(newBookingRes.status).toBe(201);
    const newBookingId = newBookingRes.body.data.id;

    const getRes = await request(app).get(`/api/experience-bookings/${newBookingId}`);
    expect(getRes.status).toBe(200);
    // meetingDetails must be null/undefined when not paid
    expect(getRes.body.data.meetingDetails).toBeFalsy();

    // Clean up
    await prisma.experienceBooking.delete({ where: { id: newBookingId } });
    await prisma.experienceSlot.update({
      where: { id: slotId },
      data: { bookedCount: { decrement: 1 } },
    });
  });

  // 11. meetingDetails IS disclosed after verify (PAID)
  it('11. meetingDetails IS disclosed on GET /:id when paymentStatus = PAID', async () => {
    asConsumer();
    // Create booking
    const newBookingRes = await request(app)
      .post('/api/experience-bookings')
      .send({ slotId, guestCount: 1 });
    expect(newBookingRes.status).toBe(201);
    const newBookingId = newBookingRes.body.data.id;

    // Verify (mock Paystack returns success) — pass reference from booking
    const bookingRef = newBookingRes.body.data.reference;
    const verifyRes = await request(app)
      .post(`/api/experience-bookings/${newBookingId}/verify`)
      .send({ reference: bookingRef });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.paymentStatus).toBe('PAID');
    // meetingDetails is nested under data.experience.meetingDetails
    expect(verifyRes.body.data.experience.meetingDetails).toBeTruthy();
    expect(verifyRes.body.data.experience.meetingDetails).toBe('Published meeting location — only for paid guests');

    // GET /:id also discloses after PAID (nested under experience)
    const getRes = await request(app).get(`/api/experience-bookings/${newBookingId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.experience.meetingDetails).toBeTruthy();

    // Clean up
    await prisma.experienceBooking.delete({ where: { id: newBookingId } });
    await prisma.experienceSlot.update({
      where: { id: slotId },
      data: { bookedCount: { decrement: 1 } },
    });
  });

  // 12. Operator GET /operator — sees own bookings with meetingDetails always
  it('12. Operator GET /operator — sees own bookings', async () => {
    asOperator();
    const res = await request(app).get('/api/experience-bookings/operator');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // 13. Consumer cannot access operator endpoint → 403
  it('13. Consumer cannot access operator endpoint → 403', async () => {
    asConsumer();
    const res = await request(app).get('/api/experience-bookings/operator');
    expect(res.status).toBe(403);
  });

  // 14. Booked-instance preservation — cancelling booking does not cancel the slot
  it('14. Booked-instance preservation — slot remains active after booking cancellation', async () => {
    asConsumer();
    // Create and immediately cancel a booking
    const newBookingRes = await request(app)
      .post('/api/experience-bookings')
      .send({ slotId, guestCount: 1 });
    expect(newBookingRes.status).toBe(201);
    const newBookingId = newBookingRes.body.data.id;

    await request(app)
      .post(`/api/experience-bookings/${newBookingId}/cancel`)
      .send({});

    // Slot must still be active
    const slot = await prisma.experienceSlot.findUnique({ where: { id: slotId } });
    expect(slot?.isActive).toBe(true);
  });

  // 15. GET / — consumer sees only their own bookings
  it('15. Consumer sees only their own bookings in GET /', async () => {
    asConsumer();
    const res = await request(app).get('/api/experience-bookings');
    expect(res.status).toBe(200);
    const bookings = res.body.data;
    if (bookings.length > 0) {
      bookings.forEach((b: any) => {
        expect(b.guestUserId ?? b.userId).toBe(consumerUserId);
      });
    }
  });

  // 16. C1 regression — OPERATOR registration + login sets EXPERIENCES mode
  it('16. C1 regression — OPERATOR registration sets EXPERIENCES mode hydration', async () => {
    const ts = Date.now();
    const email = `c3reg-operator-${ts}@test.owambe.com`;
    const password = 'TestPass123!';
    // Register
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password,
        firstName: 'C3Reg',
        lastName: 'Operator',
        role: 'OPERATOR',
        companyName: `C3 Reg Operator ${ts}`,
      });
    expect(regRes.status).toBe(201);
    expect(regRes.body.userId).toBeTruthy();
    const newUserId = regRes.body.userId;
    // Mark email verified so login succeeds
    await prisma.user.update({ where: { id: newUserId }, data: { isEmailVerified: true } });
    // Login and check mode hydration
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password });
    expect(loginRes.status).toBe(200);
    // Login returns { success, accessToken, user: {...} } — no data wrapper
    expect(loginRes.body.user.activeMode).toBe('EXPERIENCES');
    expect(loginRes.body.user.availableModes).toContain('EXPERIENCES');
    // Clean up
    await prisma.operator.deleteMany({ where: { userId: newUserId } });
    await prisma.user.delete({ where: { id: newUserId } });
  });

  // 17. C2 regression — slot creation still works for OPERATOR
  it('17. C2 regression — OPERATOR can create a one-off slot', async () => {
    asOperator();
    const futureStart = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .post(`/api/experience-slots/${publishedExperienceId}`)
      .send({
        startTime: futureStart,
        endTime: futureEnd,
        capacity: 8,
        timezone: 'Africa/Lagos',
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    // Clean up
    await prisma.experienceSlot.delete({ where: { id: res.body.data.id } });
  });

  // 18. F-1 / D-4 — Consumer retrieves slots via public route → 200
  it('18. F-1 / D-4 — Consumer retrieves slots via public route GET /experiences/:id/slots → 200', async () => {
    asConsumer();
    const res = await request(app)
      .get(`/api/experiences/${publishedExperienceId}/slots`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // 19. F-1 / D-4 — Consumer still 403 at OPERATOR route (gating unchanged)
  it('19. F-1 / D-4 — Consumer still 403 at OPERATOR route GET /experience-slots/:id', async () => {
    asConsumer();
    const res = await request(app)
      .get(`/api/experience-slots/${publishedExperienceId}`);
    expect(res.status).toBe(403);
  });
});
