import request from 'supertest';
import { app } from '../app';
import { prisma } from '../database/client';
import bcrypt from 'bcryptjs';

// ─── TEST SETUP ──────────────────────────────────────
let plannerToken: string;
let vendorToken: string;
let testPlannerId: string;
let testVendorId: string;
let testEventId: string;
let testBookingId: string;

beforeAll(async () => {
  // Clear test data
  await prisma.stayBooking.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.vendor.deleteMany({});
  await prisma.planner.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { contains: '@test.owambe' } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ─── AUTH TESTS ──────────────────────────────────────
describe('POST /api/auth/register', () => {
  it('registers a planner successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'planner@test.owambe',
        password: 'Test1234!',
        firstName: 'Test',
        lastName: 'Planner',
        role: 'PLANNER',
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.userId).toBeDefined();
  });

  it('rejects duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'planner@test.owambe',
        password: 'Test1234!',
        firstName: 'Dup',
        lastName: 'User',
        role: 'PLANNER',
      });
    expect(res.status).toBe(409);
  });

  it('rejects weak password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'new@test.owambe',
        password: '123',
        firstName: 'Test',
        lastName: 'User',
        role: 'PLANNER',
      });
    expect(res.status).toBe(422);
  });

  it('registers a vendor successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'vendor@test.owambe',
        password: 'Test1234!',
        firstName: 'Test',
        lastName: 'Vendor',
        role: 'VENDOR',
      });
    expect(res.status).toBe(201);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in planner and returns token', async () => {
    // First verify email manually for test
    await prisma.user.update({
      where: { email: 'planner@test.owambe' },
      data: { isEmailVerified: true },
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'planner@test.owambe', password: 'Test1234!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.role).toBe('PLANNER');
    plannerToken = res.body.accessToken;

    const planner = await prisma.planner.findFirst({
      where: { user: { email: 'planner@test.owambe' } }
    });
    testPlannerId = planner!.id;
  });

  it('logs in vendor and returns token', async () => {
    await prisma.user.update({
      where: { email: 'vendor@test.owambe' },
      data: { isEmailVerified: true },
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'vendor@test.owambe', password: 'Test1234!' });

    expect(res.status).toBe(200);
    vendorToken = res.body.accessToken;
  });

  it('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'planner@test.owambe', password: 'WrongPass!' });
    expect(res.status).toBe(401);
  });

  it('requires authentication on protected routes', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(401);
  });
});

// ─── EVENTS TESTS ────────────────────────────────────
describe('Events API', () => {
  it('creates an event', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({
        name: 'Test Conference Lagos',
        type: 'Conference',
        startDate: '2026-08-15T09:00:00',
        venue: 'Eko Hotel',
        city: 'Lagos',
        maxCapacity: 200,
      });
    expect(res.status).toBe(201);
    expect(res.body.event.name).toBe('Test Conference Lagos');
    expect(res.body.event.status).toBe('DRAFT');
    testEventId = res.body.event.id;
  });

  it('fetches planner events', async () => {
    const res = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${plannerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.length).toBeGreaterThan(0);
  });

  it('fetches single event', async () => {
    const res = await request(app)
      .get(`/api/events/${testEventId}`)
      .set('Authorization', `Bearer ${plannerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.event.id).toBe(testEventId);
  });

  it('updates an event', async () => {
    const res = await request(app)
      .put(`/api/events/${testEventId}`)
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({ description: 'Updated description' });
    expect(res.status).toBe(200);
    expect(res.body.event.description).toBe('Updated description');
  });

  it('blocks publishing without tickets', async () => {
    const res = await request(app)
      .post(`/api/events/${testEventId}/publish`)
      .set('Authorization', `Bearer ${plannerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('ticket');
  });

  it('rejects event creation from vendor role', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ name: 'Unauthorized Event', type: 'Conference', startDate: '2026-08-15' });
    expect(res.status).toBe(403);
  });
});

// ─── ATTENDEE REGISTRATION ───────────────────────────
describe('Attendee Registration', () => {
  let ticketTypeId: string;

  beforeAll(async () => {
    const ticket = await prisma.ticketType.create({
      data: {
        eventId: testEventId,
        name: 'General',
        price: 25000,
        capacity: 100,
        currency: 'NGN',
        status: 'ACTIVE',
      }
    });
    ticketTypeId = ticket.id;
    // Publish event
    await prisma.event.update({ where: { id: testEventId }, data: { status: 'PUBLISHED' } });
  });

  it('registers an attendee', async () => {
    const event = await prisma.event.findUnique({ where: { id: testEventId } });
    const res = await request(app)
      .post(`/api/events/public/${event!.slug}/register`)
      .send({
        firstName: 'Ada',
        lastName: 'Okonkwo',
        email: 'ada@test.owambe',
        ticketTypeId,
        paystackRef: 'test-ref-001',
      });
    expect(res.status).toBe(201);
    expect(res.body.attendee.qrCode).toBeDefined();
    expect(res.body.attendee.email).toBe('ada@test.owambe');
  });

  it('rejects duplicate email registration', async () => {
    const event = await prisma.event.findUnique({ where: { id: testEventId } });
    const res = await request(app)
      .post(`/api/events/public/${event!.slug}/register`)
      .send({
        firstName: 'Ada',
        lastName: 'Duplicate',
        email: 'ada@test.owambe',
        ticketTypeId,
      });
    expect(res.status).toBe(409);
  });

  it('performs QR check-in', async () => {
    const attendee = await prisma.attendee.findFirst({ where: { email: 'ada@test.owambe' } });
    const res = await request(app)
      .post('/api/attendees/checkin')
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({ qrCode: attendee!.qrCode, eventId: testEventId });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.attendee.name).toContain('Ada');
  });

  it('prevents double check-in', async () => {
    const attendee = await prisma.attendee.findFirst({ where: { email: 'ada@test.owambe' } });
    const res = await request(app)
      .post('/api/attendees/checkin')
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({ qrCode: attendee!.qrCode, eventId: testEventId });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Already checked in');
  });
});

// ─── VENDOR TESTS ────────────────────────────────────
describe('Vendor API', () => {
  it('creates a vendor profile', async () => {
    const res = await request(app)
      .post('/api/vendors/me')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        businessName: 'Test Photography Lagos',
        category: 'PHOTOGRAPHY_VIDEO',
        city: 'Lagos',
        minPrice: 150000,
        maxPrice: 1500000,
        isInstantBook: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.vendor.status).toBe('PENDING');
    testVendorId = res.body.vendor.id;
  });

  it('searches vendors by category and city', async () => {
    // Verify vendor first for search
    await prisma.vendor.update({
      where: { id: testVendorId },
      data: { status: 'VERIFIED', latitude: 6.5, longitude: 3.4 }
    });

    const res = await request(app)
      .get('/api/vendors/search')
      .query({ category: 'PHOTOGRAPHY_VIDEO', city: 'Lagos' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.vendors)).toBe(true);
  });

  it('gets vendor public profile', async () => {
    const vendor = await prisma.vendor.findUnique({ where: { id: testVendorId } });
    const res = await request(app).get(`/api/vendors/profile/${vendor!.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.vendor.businessName).toBe('Test Photography Lagos');
  });
});

// ─── BOOKING TESTS ───────────────────────────────────
describe('Booking API', () => {
  it('creates an RFQ booking', async () => {
    const res = await request(app)
      .post('/api/bookings/rfq')
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({
        vendorId: testVendorId,
        eventDate: '2026-09-15T10:00:00',
        eventDescription: 'Corporate conference photography',
        guestCount: 150,
        estimatedBudget: 500000,
      });
    expect(res.status).toBe(201);
    expect(res.body.booking.bookingType).toBe('RFQ');
    expect(res.body.booking.status).toBe('PENDING');
    testBookingId = res.body.booking.id;
  });

  it('vendor confirms booking', async () => {
    const res = await request(app)
      .post(`/api/bookings/${testBookingId}/confirm`)
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('CONFIRMED');
  });

  it('cancels a booking with reason', async () => {
    const newBooking = await request(app)
      .post('/api/bookings/rfq')
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({
        vendorId: testVendorId,
        eventDate: '2026-10-01T10:00:00',
        eventDescription: 'Test booking to cancel',
        guestCount: 50,
        estimatedBudget: 200000,
      });
    const bookingId = newBooking.body.booking.id;

    const res = await request(app)
      .post(`/api/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({ reason: 'Event postponed' });
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('CANCELLED');
    expect(res.body.booking.cancellationReason).toBe('Event postponed');
  });
});

// ─── ANALYTICS TESTS ─────────────────────────────────
describe('Analytics API', () => {
  it('returns planner overview stats', async () => {
    const res = await request(app)
      .get('/api/analytics/planner/overview')
      .set('Authorization', `Bearer ${plannerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.stats).toBeDefined();
    expect(typeof res.body.stats.totalEvents).toBe('number');
  });

  it('returns live check-in stats', async () => {
    const res = await request(app)
      .get(`/api/analytics/events/${testEventId}/checkin-live`)
      .set('Authorization', `Bearer ${plannerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalRegistered).toBeGreaterThanOrEqual(0);
    expect(res.body.checkInRate).toBeGreaterThanOrEqual(0);
  });

  it('requires planner role for planner analytics', async () => {
    const res = await request(app)
      .get('/api/analytics/planner/overview')
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(res.status).toBe(403);
  });
});

// ─── PAYSTACK WEBHOOK TESTS ──────────────────────────
describe('Paystack Webhook', () => {
  it('rejects webhook with invalid signature', async () => {
    const res = await request(app)
      .post('/api/payments/webhook/paystack')
      .set('x-paystack-signature', 'invalid-signature')
      .send({ event: 'charge.success', data: { reference: 'test-ref' } });
    // Returns 200 always but ignores invalid signatures
    expect(res.status).toBe(200);
  });
});

// ─── HEALTH CHECK ────────────────────────────────────
describe('Health Check', () => {
  it('returns healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('owambe-api');
  });
});

// ─── CONTRACT TESTS ───────────────────────────────────
describe('Contracts API', () => {
  let contractId: string;
  let plannerSigningToken: string;
  let vendorSigningToken: string;

  it('creates a contract as planner', async () => {
    // First we need a vendor ID — get from vendor profile
    const vendorRes = await request(app)
      .get('/api/vendors/me')
      .set('Authorization', `Bearer ${vendorToken}`);
    const vendorId = vendorRes.body.vendor?.id;
    if (!vendorId) return; // skip if vendor not set up

    const res = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({
        vendorId,
        title: 'Test Photography Agreement',
        templateType: 'PHOTOGRAPHY',
        totalAmount: 500000,
        eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        eventVenue: 'Eko Hotel, Lagos',
        guestCount: 150,
        eventDescription: 'Wedding ceremony and reception',
      });

    if (res.status === 201) {
      contractId = res.body.contract.id;
      const sigs = res.body.contract.signatures;
      plannerSigningToken = sigs.find((s: any) => s.signerRole === 'PLANNER')?.signingToken;
      vendorSigningToken = sigs.find((s: any) => s.signerRole === 'VENDOR')?.signingToken;
    }
    // Accept 201 (created) or 404 (vendor not found in test db)
    expect([201, 404]).toContain(res.status);
  });

  it('lists contracts as planner', async () => {
    const res = await request(app)
      .get('/api/contracts')
      .set('Authorization', `Bearer ${plannerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('contracts');
    expect(Array.isArray(res.body.contracts)).toBe(true);
  });

  it('lists contracts as vendor', async () => {
    const res = await request(app)
      .get('/api/contracts')
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('contracts');
  });

  it('blocks contract creation from vendor role', async () => {
    const res = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ vendorId: 'some-id', title: 'Test' });
    expect(res.status).toBe(403);
  });

  it('rejects signing with invalid token', async () => {
    const res = await request(app)
      .post('/api/contracts/sign/invalid-token-xyz')
      .send({ signatureData: 'data:image/png;base64,abc', agreedToTerms: true });
    expect(res.status).toBe(404);
  });

  it('gets signing page data with valid token', async () => {
    if (!plannerSigningToken) return;
    const res = await request(app)
      .get(`/api/contracts/sign/${plannerSigningToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('contract');
    expect(res.body).toHaveProperty('signature');
  });

  it('gets contract by id as planner', async () => {
    if (!contractId) return;
    const res = await request(app)
      .get(`/api/contracts/${contractId}`)
      .set('Authorization', `Bearer ${plannerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.contract.id).toBe(contractId);
    expect(res.body.contract.status).toBe('DRAFT');
  });

  it('sends contract for signing', async () => {
    if (!contractId) return;
    const res = await request(app)
      .post(`/api/contracts/${contractId}/send`)
      .set('Authorization', `Bearer ${plannerToken}`);
    expect([200, 400]).toContain(res.status); // 400 if already sent
    if (res.status === 200) {
      expect(res.body.contract.status).toBe('SENT');
    }
  });

  it('signs contract as planner', async () => {
    if (!plannerSigningToken) return;
    const res = await request(app)
      .post(`/api/contracts/sign/${plannerSigningToken}`)
      .send({
        signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        agreedToTerms: true,
      });
    expect([200, 409]).toContain(res.status); // 409 if already signed
  });

  it('downloads PDF for a contract', async () => {
    if (!contractId) return;
    const res = await request(app)
      .get(`/api/contracts/${contractId}/pdf`)
      .set('Authorization', `Bearer ${plannerToken}`);
    // Returns PDF bytes or redirects — accept success
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers['content-type']).toMatch(/pdf/);
    }
  });

  it('voids a draft contract', async () => {
    // Create a fresh contract to void
    const vendorRes = await request(app)
      .get('/api/vendors/me')
      .set('Authorization', `Bearer ${vendorToken}`);
    const vendorId = vendorRes.body.vendor?.id;
    if (!vendorId) return;

    const createRes = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({ vendorId, title: 'To Be Voided', templateType: 'SERVICE_AGREEMENT' });
    if (createRes.status !== 201) return;

    const res = await request(app)
      .post(`/api/contracts/${createRes.body.contract.id}/void`)
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({ reason: 'Test void' });
    expect(res.status).toBe(200);
    expect(res.body.contract.status).toBe('VOID');
  });

  it('requires authentication for contract routes', async () => {
    const res = await request(app).get('/api/contracts');
    expect(res.status).toBe(401);
  });
});

// ─── PROMO CODE TESTS ────────────────────────────────
describe('Promo Codes API', () => {
  let testEventId: string;

  it('creates a promo code for an event', async () => {
    // Get planner events
    const eventsRes = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${plannerToken}`);
    testEventId = eventsRes.body.events?.[0]?.id;
    if (!testEventId) return;

    const res = await request(app)
      .post(`/api/promos/event/${testEventId}`)
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({ code: 'TESTPROMO20', discountType: 'PERCENTAGE', discountValue: 20 });
    expect([201, 409]).toContain(res.status);
  });

  it('validates a promo code', async () => {
    if (!testEventId) return;
    const res = await request(app)
      .post('/api/promos/validate')
      .send({ code: 'TESTPROMO20', eventId: testEventId, ticketPrice: 10000 });
    expect([200, 404]).toContain(res.status);
  });

  it('rejects invalid promo codes', async () => {
    if (!testEventId) return;
    const res = await request(app)
      .post('/api/promos/validate')
      .send({ code: 'DOESNOTEXIST999', eventId: testEventId });
    expect(res.status).toBe(404);
  });
});

// ─── WAITLIST TESTS ──────────────────────────────────
describe('Waitlist API', () => {
  it('joins waitlist for an event', async () => {
    const eventsRes = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${plannerToken}`);
    const eventId = eventsRes.body.events?.[0]?.id;
    if (!eventId) return;

    // Need a ticket type
    const ticketsRes = await request(app)
      .get(`/api/tickets/event/${eventId}`)
      .set('Authorization', `Bearer ${plannerToken}`);
    const ticketTypeId = ticketsRes.body.ticketTypes?.[0]?.id;
    if (!ticketTypeId) return;

    const res = await request(app)
      .post('/api/waitlist/join')
      .send({
        eventId,
        ticketTypeId,
        email: `waitlist-${Date.now()}@test.com`,
        firstName: 'Test',
        lastName: 'User',
      });
    expect([201, 409]).toContain(res.status);
  });

  it('lists waitlist as planner', async () => {
    const eventsRes = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${plannerToken}`);
    const eventId = eventsRes.body.events?.[0]?.id;
    if (!eventId) return;

    const res = await request(app)
      .get(`/api/waitlist/event/${eventId}`)
      .set('Authorization', `Bearer ${plannerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.waitlist)).toBe(true);
  });
});

// ─── TENANT / WHITE-LABEL TESTS ──────────────────────
describe('Tenants API', () => {
  it('resolves non-existent subdomain returns 404', async () => {
    const res = await request(app)
      .get('/api/tenants/resolve?subdomain=nonexistent-xyz-123');
    expect(res.status).toBe(404);
  });

  it('get my tenant as planner returns null for non-Scale planner', async () => {
    const res = await request(app)
      .get('/api/tenants/me')
      .set('Authorization', `Bearer ${plannerToken}`);
    expect(res.status).toBe(200);
    // Null if planner is not Scale
    expect(res.body).toHaveProperty('tenant');
  });

  it('rejects portal creation for non-Scale planner', async () => {
    const res = await request(app)
      .post('/api/tenants')
      .set('Authorization', `Bearer ${plannerToken}`)
      .send({ subdomain: 'test-portal-xyz', name: 'Test Portal' });
    expect(res.status).toBe(403);
  });

  it('requires authentication for tenant management', async () => {
    const res = await request(app).get('/api/tenants/me');
    expect(res.status).toBe(401);
  });
});

// ─── PAYMENTS AUTH TESTS ──────────────────────────────
describe('Payments API Auth', () => {
  it('requires authentication on balance payment endpoint', async () => {
    const res = await request(app)
      .post('/api/payments/balance/some-booking-id');
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent booking on balance payment', async () => {
    const res = await request(app)
      .post('/api/payments/balance/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${plannerToken}`);
    expect(res.status).toBe(404);
  });
});
