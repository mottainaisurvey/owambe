/**
 * OWB-C2-EXPERIENCES-SLOT-SCHEDULING-01 — AC-4: Regression Tests
 *
 * Coverage:
 *   1.  RRULE bounds enforcement — open-ended series (no COUNT, no UNTIL) rejected
 *   2.  RRULE COUNT bound — series with COUNT=3 materialises exactly 3 instances
 *   3.  RRULE UNTIL bound — series with UNTIL in the past produces zero instances
 *   4.  RRULE BYDAY — WEEKLY;BYDAY=MO,WE,FR materialises correct day-of-week instances
 *   5.  Safety cap — series exceeding 365 instances rejected
 *   6.  Capacity enforcement — capacity cannot be reduced below bookedCount
 *   7.  Cancel semantics — slot with bookedCount > 0 cannot be cancelled
 *   8.  Cancel series — cancels future zero-booking instances; preserves booked instances
 *   9.  Foreign-operator authority — operator cannot manage another operator's slots
 *   10. Edit series requires parent slot ID — child instance rejected with 400
 *   11. Cancel series requires parent slot ID — child instance rejected with 400
 *   12. One-off slot creation — creates without rruleString or parentSlotId
 *   13. Recurring slot requires timezone — rejected without timezone
 *   14. Invalid RRULE string — rejected with 400
 *   15. Edit single instance — capacity update succeeds; other instances unaffected
 *   16. Existing-suite regression — C1 experience CRUD still functions correctly
 *
 * Strategy:
 *   - Uses real Prisma client connected to CI test database.
 *   - Seeds minimal test data in beforeAll; cleans up in afterAll.
 *   - Mocks authenticate middleware to inject operator identity.
 *   - Mocks requireMode middleware to bypass mode gating.
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

jest.mock('../middleware/authenticate', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.userId = (global as any).__c2UserId ?? 'test-id';
    req.userRole = (global as any).__c2Role ?? 'OPERATOR';
    next();
  },
  authenticateOptional: (_req: any, _res: any, next: any) => { next(); },
}));

jest.mock('../middleware/requireMode', () => ({
  requireMode: () => (_req: any, _res: any, next: any) => next(),
}));

// ─── Test State ───────────────────────────────────────────────────────────────
let operatorUserId: string;
let operatorId: string;
let foreignOperatorUserId: string;
let foreignOperatorId: string;
let experienceId: string;
let foreignExperienceId: string;

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const passwordHash = await bcrypt.hash('TestPass123!', 10);
  const ts = Date.now();

  // Primary operator
  const operatorUser = await prisma.user.create({
    data: {
      email: `c2-operator-${ts}@test.owambe.com`,
      passwordHash,
      firstName: 'C2',
      lastName: 'Operator',
      role: 'OPERATOR',
      isEmailVerified: true,
      activeMode: 'EXPERIENCES',
      availableModes: ['EXPERIENCES'],
    },
  });
  operatorUserId = operatorUser.id;

  const operator = await prisma.operator.create({
    data: {
      userId: operatorUserId,
      businessName: 'C2 Test Operator Co.',
      city: 'Lagos',
    },
  });
  operatorId = operator.id;

  // Foreign operator (for authority boundary tests)
  const foreignUser = await prisma.user.create({
    data: {
      email: `c2-foreign-${ts}@test.owambe.com`,
      passwordHash,
      firstName: 'Foreign',
      lastName: 'Operator',
      role: 'OPERATOR',
      isEmailVerified: true,
      activeMode: 'EXPERIENCES',
      availableModes: ['EXPERIENCES'],
    },
  });
  foreignOperatorUserId = foreignUser.id;

  const foreignOperator = await prisma.operator.create({
    data: {
      userId: foreignOperatorUserId,
      businessName: 'Foreign Operator Co.',
      city: 'Abuja',
    },
  });
  foreignOperatorId = foreignOperator.id;

  // Primary experience
  const experience = await prisma.experience.create({
    data: {
      operatorId,
      name: `C2 Test Experience ${ts}`,
      slug: `c2-test-experience-${ts}`,
      description: 'C2 regression test experience',
      city: 'Lagos',
      country: 'Nigeria',
      pricePerPerson: 5000,
      currency: 'NGN',
      maxGroupSize: 10,
      durationMinutes: 120,
      experienceType: 'CULTURAL_TOUR',
      isActive: false,
      isApproved: false,
    },
  });
  experienceId = experience.id;

  // Foreign experience
  const foreignExp = await prisma.experience.create({
    data: {
      operatorId: foreignOperatorId,
      name: `C2 Foreign Experience ${ts}`,
      slug: `c2-foreign-experience-${ts}`,
      description: 'Foreign operator experience',
      city: 'Abuja',
      country: 'Nigeria',
      pricePerPerson: 3000,
      currency: 'NGN',
      maxGroupSize: 5,
      durationMinutes: 60,
      experienceType: 'FOOD_TASTING',
      isActive: false,
      isApproved: false,
    },
  });
  foreignExperienceId = foreignExp.id;

  // Set primary operator as the authenticated user
  (global as any).__c2UserId = operatorUserId;
  (global as any).__c2Role = 'OPERATOR';
});

afterAll(async () => {
  const ts = Date.now();
  // Clean up in dependency order
  await prisma.experienceSlot.deleteMany({ where: { experienceId } });
  await prisma.experienceSlot.deleteMany({ where: { experienceId: foreignExperienceId } });
  await prisma.experience.deleteMany({ where: { id: { in: [experienceId, foreignExperienceId] } } });
  await prisma.operator.deleteMany({ where: { id: { in: [operatorId, foreignOperatorId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [operatorUserId, foreignOperatorUserId] } } });
  await prisma.$disconnect();
});

// ─── Helper: create a one-off slot directly via Prisma ────────────────────────
async function seedSlot(overrides: Partial<any> = {}) {
  const base = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 1 week from now
  return prisma.experienceSlot.create({
    data: {
      experienceId,
      startTime: base,
      endTime: new Date(base.getTime() + 2 * 60 * 60 * 1000),
      capacity: 10,
      ...overrides,
    },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('C2: RRULE bounds enforcement', () => {
  test('1. Open-ended series (no COUNT, no UNTIL) is rejected with 400', async () => {
    const res = await request(app)
      .post(`/api/experience-slots/${experienceId}`)
      .send({
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
        capacity: 5,
        rruleString: 'FREQ=WEEKLY;BYDAY=MO',
        timezone: 'Africa/Lagos',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/COUNT|UNTIL|bound/i);
  });

  test('2. COUNT=3 series materialises exactly 3 child instances', async () => {
    const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const res = await request(app)
      .post(`/api/experience-slots/${experienceId}`)
      .send({
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        capacity: 5,
        rruleString: 'FREQ=DAILY;COUNT=3',
        timezone: 'Africa/Lagos',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.instances).toHaveLength(3);
    expect(res.body.instanceCount).toBe(3);
    // Clean up
    await prisma.experienceSlot.deleteMany({ where: { parentSlotId: res.body.data.parent.id } });
    await prisma.experienceSlot.delete({ where: { id: res.body.data.parent.id } });
  });

  test('3. UNTIL in the past produces zero instances (no error)', async () => {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    // UNTIL=19700101 — always in the past
    const res = await request(app)
      .post(`/api/experience-slots/${experienceId}`)
      .send({
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        capacity: 5,
        rruleString: 'FREQ=DAILY;UNTIL=19700101T000000Z',
        timezone: 'Africa/Lagos',
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.message).toMatch(/zero instances/i);
  });

  test('4. WEEKLY;BYDAY=MO,WE,FR;COUNT=6 materialises 6 instances on correct days', async () => {
    const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const res = await request(app)
      .post(`/api/experience-slots/${experienceId}`)
      .send({
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        capacity: 5,
        rruleString: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6',
        timezone: 'Africa/Lagos',
      });
    expect(res.status).toBe(201);
    expect(res.body.instanceCount).toBe(6);
    // Verify each instance falls on Mon, Wed, or Fri (UTC day)
    const instances: any[] = res.body.data.instances;
    instances.forEach(inst => {
      const day = new Date(inst.startTime).getUTCDay();
      expect([1, 3, 5]).toContain(day); // 1=Mon, 3=Wed, 5=Fri
    });
    // Clean up
    await prisma.experienceSlot.deleteMany({ where: { parentSlotId: res.body.data.parent.id } });
    await prisma.experienceSlot.delete({ where: { id: res.body.data.parent.id } });
  });

  test('5. Series exceeding 365 instances is rejected with 400', async () => {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const res = await request(app)
      .post(`/api/experience-slots/${experienceId}`)
      .send({
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        capacity: 5,
        rruleString: 'FREQ=DAILY;COUNT=400',
        timezone: 'Africa/Lagos',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/365|maximum/i);
  });

  test('14. Invalid RRULE string is rejected with 400', async () => {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const res = await request(app)
      .post(`/api/experience-slots/${experienceId}`)
      .send({
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        capacity: 5,
        rruleString: 'NOT_A_VALID_RRULE_STRING',
        timezone: 'Africa/Lagos',
      });
    expect(res.status).toBe(400);
  });

  test('13. Recurring slot without timezone is rejected with 400', async () => {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const res = await request(app)
      .post(`/api/experience-slots/${experienceId}`)
      .send({
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        capacity: 5,
        rruleString: 'FREQ=DAILY;COUNT=3',
        // timezone intentionally omitted
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/timezone/i);
  });
});

describe('C2: One-off slot creation', () => {
  test('12. One-off slot created without rruleString or parentSlotId', async () => {
    const start = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const res = await request(app)
      .post(`/api/experience-slots/${experienceId}`)
      .send({ startTime: start.toISOString(), endTime: end.toISOString(), capacity: 8 });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('one-off');
    expect(res.body.data.rruleString).toBeNull();
    expect(res.body.data.parentSlotId).toBeNull();
    // Clean up
    await prisma.experienceSlot.delete({ where: { id: res.body.data.id } });
  });
});

describe('C2: Capacity enforcement', () => {
  test('6. Capacity cannot be reduced below bookedCount', async () => {
    // Seed a slot with bookedCount=3
    const slot = await seedSlot({ bookedCount: 3, capacity: 5 });
    const res = await request(app)
      .patch(`/api/experience-slots/${slot.id}`)
      .send({ capacity: 2 }); // 2 < bookedCount=3
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/capacity|bookings/i);
    await prisma.experienceSlot.delete({ where: { id: slot.id } });
  });
});

describe('C2: Cancel semantics', () => {
  test('7. Slot with bookedCount > 0 cannot be cancelled', async () => {
    const slot = await seedSlot({ bookedCount: 1 });
    const res = await request(app)
      .delete(`/api/experience-slots/${slot.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/booking/i);
    await prisma.experienceSlot.delete({ where: { id: slot.id } });
  });

  test('8. Cancel series cancels future zero-booking instances; preserves booked instances', async () => {
    // Create a parent slot row
    const now = new Date();
    const parentSlot = await prisma.experienceSlot.create({
      data: {
        experienceId,
        startTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
        capacity: 10,
        rruleString: 'FREQ=DAILY;COUNT=3',
        timezone: 'Africa/Lagos',
      },
    });
    // Create 3 child instances: 2 future zero-booking, 1 future with bookings
    const child1 = await prisma.experienceSlot.create({ data: { experienceId, startTime: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000), endTime: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), capacity: 10, parentSlotId: parentSlot.id, bookedCount: 0 } });
    const child2 = await prisma.experienceSlot.create({ data: { experienceId, startTime: new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000), endTime: new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), capacity: 10, parentSlotId: parentSlot.id, bookedCount: 0 } });
    const child3 = await prisma.experienceSlot.create({ data: { experienceId, startTime: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), endTime: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), capacity: 10, parentSlotId: parentSlot.id, bookedCount: 2 } }); // has bookings

    const res = await request(app)
      .patch(`/api/experience-slots/${parentSlot.id}/cancel-series`);
    expect(res.status).toBe(200);
    expect(res.body.cancelledCount).toBe(2); // child1 and child2 cancelled; child3 preserved

    // Verify child3 (booked) is still active
    const preserved = await prisma.experienceSlot.findUnique({ where: { id: child3.id } });
    expect(preserved?.isActive).toBe(true);

    // Clean up
    await prisma.experienceSlot.deleteMany({ where: { parentSlotId: parentSlot.id } });
    await prisma.experienceSlot.delete({ where: { id: parentSlot.id } });
  });
});

describe('C2: Foreign-operator authority boundary', () => {
  test('9. Operator cannot create slots for another operator\'s experience', async () => {
    const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const res = await request(app)
      .post(`/api/experience-slots/${foreignExperienceId}`)
      .send({ startTime: start.toISOString(), endTime: end.toISOString(), capacity: 5 });
    expect(res.status).toBe(403);
  });

  test('9b. Operator cannot cancel another operator\'s slot', async () => {
    // Seed a slot on the foreign experience (bypass auth by using Prisma directly)
    const foreignSlot = await prisma.experienceSlot.create({
      data: {
        experienceId: foreignExperienceId,
        startTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
        capacity: 5,
      },
    });
    const res = await request(app)
      .delete(`/api/experience-slots/${foreignSlot.id}`);
    expect(res.status).toBe(403);
    await prisma.experienceSlot.delete({ where: { id: foreignSlot.id } });
  });
});

describe('C2: Series operation guard — child instance rejected', () => {
  let parentSlotId: string;
  let childSlotId: string;

  beforeAll(async () => {
    const now = new Date();
    const parent = await prisma.experienceSlot.create({
      data: {
        experienceId,
        startTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
        capacity: 10,
        rruleString: 'FREQ=DAILY;COUNT=2',
        timezone: 'Africa/Lagos',
      },
    });
    parentSlotId = parent.id;
    const child = await prisma.experienceSlot.create({
      data: {
        experienceId,
        startTime: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
        capacity: 10,
        parentSlotId: parent.id,
      },
    });
    childSlotId = child.id;
  });

  afterAll(async () => {
    await prisma.experienceSlot.deleteMany({ where: { parentSlotId } });
    await prisma.experienceSlot.delete({ where: { id: parentSlotId } });
  });

  test('10. edit-series on a child instance returns 400', async () => {
    const res = await request(app)
      .patch(`/api/experience-slots/${childSlotId}/edit-series`)
      .send({
        rruleString: 'FREQ=DAILY;COUNT=2',
        startTime: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/parent/i);
  });

  test('11. cancel-series on a child instance returns 400', async () => {
    const res = await request(app)
      .patch(`/api/experience-slots/${childSlotId}/cancel-series`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/parent/i);
  });
});

describe('C2: Edit single instance', () => {
  test('15. Capacity update on single instance succeeds; does not affect other instances', async () => {
    const now = new Date();
    const parent = await prisma.experienceSlot.create({
      data: {
        experienceId,
        startTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
        capacity: 10,
        rruleString: 'FREQ=DAILY;COUNT=2',
        timezone: 'Africa/Lagos',
      },
    });
    const child1 = await prisma.experienceSlot.create({
      data: { experienceId, startTime: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000), endTime: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), capacity: 10, parentSlotId: parent.id },
    });
    const child2 = await prisma.experienceSlot.create({
      data: { experienceId, startTime: new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000), endTime: new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), capacity: 10, parentSlotId: parent.id },
    });

    const res = await request(app)
      .patch(`/api/experience-slots/${child1.id}`)
      .send({ capacity: 7 });
    expect(res.status).toBe(200);
    expect(res.body.data.capacity).toBe(7);

    // child2 should be unaffected
    const child2After = await prisma.experienceSlot.findUnique({ where: { id: child2.id } });
    expect(child2After?.capacity).toBe(10);

    await prisma.experienceSlot.deleteMany({ where: { parentSlotId: parent.id } });
    await prisma.experienceSlot.delete({ where: { id: parent.id } });
  });
});

describe('C2: Existing-suite regression — C1 experience CRUD', () => {
  test('16. C1 experience creation still returns DRAFT state (isActive=false, isApproved=false)', async () => {
    const ts = Date.now();
    const res = await request(app)
      .post('/api/experiences')
      .send({
        name: `C2 Regression Test Exp ${ts}`,
        slug: `c2-regression-${ts}`,
        description: 'Regression test experience',
        city: 'Lagos',
        country: 'Nigeria',
        pricePerPerson: 5000,
        currency: 'NGN',
        durationMinutes: 120,
        experienceType: 'CULTURAL_TOUR',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.isActive).toBe(false);
    expect(res.body.data.isApproved).toBe(false);
    // Clean up
    await prisma.experience.delete({ where: { id: res.body.data.id } });
  });
});
