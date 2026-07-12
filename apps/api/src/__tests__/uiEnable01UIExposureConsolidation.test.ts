/**
 * OWB-C-UIENABLE-01 — AC-4: UI Exposure Consolidation Tests
 *
 * Coverage:
 *   UI-1  Registration option — OPERATOR role accepted; existing personas unaffected
 *   UI-2  Publication copy — publish 403 message no longer contains "Submit for review"
 *   UI-4  Day-mapping — BYDAY expansion correct for all 7 days, single and multi-day
 *   UI-5  PUT field integrity — isActive rejected via PUT; dedicated endpoints still work
 *
 * Note: UI-3 (slow-load notice), UI-6 (capacity placeholder), and UI-7 (toast suppression)
 * are pure front-end changes with no API-layer test surface; they are covered by the
 * browser-level smoke (AC-5) and the web Vitest suite (api.test.ts extension).
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
    req.userId = (global as any).__uienable01UserId ?? 'test-id';
    req.userRole = (global as any).__uienable01Role ?? 'OPERATOR';
    next();
  },
}));
jest.mock('../middleware/requireMode', () => ({
  requireMode: () => (_req: any, _res: any, next: any) => next(),
}));

// ─── Test State ───────────────────────────────────────────────────────────────
let operatorUserId: string;
let operatorId: string;
let experienceId: string;

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const passwordHash = await bcrypt.hash('TestPass123!', 10);
  const ts = Date.now();

  const operatorUser = await prisma.user.create({
    data: {
      email: `uienable01-operator-${ts}@test.owambe.com`,
      passwordHash,
      firstName: 'UIEnable',
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
      businessName: 'UIEnable Test Operator Co.',
      city: 'Lagos',
    },
  });
  operatorId = operator.id;

  // Create a test experience for lifecycle and PUT tests
  const experience = await prisma.experience.create({
    data: {
      operatorId,
      name: `UIEnable Test Experience ${ts}`,
      slug: `uienable-test-experience-${ts}`,
      description: 'UIENABLE-01 regression test experience',
      city: 'Lagos',
      country: 'Nigeria',
      pricePerPerson: 8000,
      currency: 'NGN',
      maxGroupSize: 12,
      durationMinutes: 90,
      experienceType: 'FOOD_TASTING',
      isActive: false,
      isApproved: false,
    },
  });
  experienceId = experience.id;
});

afterAll(async () => {
  if (experienceId) {
    await prisma.experienceSlot.deleteMany({ where: { experienceId } });
    await prisma.experience.deleteMany({ where: { operatorId } });
  }
  await prisma.operator.deleteMany({ where: { userId: operatorUserId } });
  await prisma.user.deleteMany({ where: { id: operatorUserId } });
});

function setIdentity(userId: string, role: string) {
  (global as any).__uienable01UserId = userId;
  (global as any).__uienable01Role = role;
}

// ─── UI-1: Registration — OPERATOR role accepted ──────────────────────────────
describe('UI-1: OPERATOR registration option', () => {
  it('POST /api/auth/register with OPERATOR role returns 201 and creates Operator profile', async () => {
    const ts = Date.now();
    const email = `uienable01-reg-operator-${ts}@test.owambe.com`;

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        firstName: 'New',
        lastName: 'Operator',
        role: 'OPERATOR',
        companyName: 'New Experience Co.',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(user!.role).toBe('OPERATOR');
    expect(user!.activeMode).toBe('EXPERIENCES');
    expect(user!.availableModes).toContain('EXPERIENCES');

    const operator = await prisma.operator.findUnique({ where: { userId: user!.id } });
    expect(operator).not.toBeNull();
    expect(operator!.businessName).toBe('New Experience Co.');

    // Cleanup
    await prisma.operator.delete({ where: { userId: user!.id } });
    await prisma.user.delete({ where: { id: user!.id } });
  });

  it('PLANNER registration still sets EVENTS mode (regression)', async () => {
    const ts = Date.now();
    const email = `uienable01-reg-planner-${ts}@test.owambe.com`;

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        firstName: 'Reg',
        lastName: 'Planner',
        role: 'PLANNER',
        companyName: 'Planner Co.',
      });

    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user!.role).toBe('PLANNER');
    expect(user!.activeMode).toBe('EVENTS');
    expect(user!.availableModes).toContain('EVENTS');

    // Cleanup
    await prisma.user.delete({ where: { id: user!.id } });
  });

  it('HOST registration still sets STAYS mode (regression)', async () => {
    const ts = Date.now();
    const email = `uienable01-reg-host-${ts}@test.owambe.com`;

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        firstName: 'Reg',
        lastName: 'Host',
        role: 'HOST',
        companyName: 'Host Co.',
      });

    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user!.role).toBe('HOST');
    expect(user!.activeMode).toBe('STAYS');
    expect(user!.availableModes).toContain('STAYS');

    // Cleanup
    await prisma.host.deleteMany({ where: { userId: user!.id } });
    await prisma.user.delete({ where: { id: user!.id } });
  });

  it('CONSUMER registration still works (regression)', async () => {
    const ts = Date.now();
    const email = `uienable01-reg-consumer-${ts}@test.owambe.com`;

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        firstName: 'Reg',
        lastName: 'Consumer',
        role: 'CONSUMER',
      });

    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user!.role).toBe('CONSUMER');

    // Cleanup
    await prisma.consumer.deleteMany({ where: { userId: user!.id } });
    await prisma.user.delete({ where: { id: user!.id } });
  });

  it('VENDOR registration still works (regression)', async () => {
    const ts = Date.now();
    const email = `uienable01-reg-vendor-${ts}@test.owambe.com`;

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        firstName: 'Reg',
        lastName: 'Vendor',
        role: 'VENDOR',
        companyName: 'Vendor Co.',
      });

    expect(res.status).toBe(201);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user!.role).toBe('VENDOR');

    // Cleanup
    await prisma.vendor.deleteMany({ where: { userId: user!.id } });
    await prisma.user.delete({ where: { id: user!.id } });
  });
});

// ─── UI-2: Publication copy — 403 message no longer says "Submit for review" ──
describe('UI-2: Publication control — 403 copy fix', () => {
  it('PATCH /publish returns 403 with updated message (no "Submit for review" text)', async () => {
    setIdentity(operatorUserId, 'OPERATOR');
    const res = await request(app).patch(`/api/experiences/${experienceId}/publish`);
    expect(res.status).toBe(403);
    // Must contain "approval" or "approved"
    expect(res.body.error).toMatch(/approv/i);
    // Must NOT contain the old misleading copy
    expect(res.body.error).not.toMatch(/submit for review/i);
  });

  it('PATCH /publish returns 200 after admin approval (dedicated endpoint works)', async () => {
    // Simulate admin approval via direct DB update (E2 capability)
    await prisma.experience.update({
      where: { id: experienceId },
      data: { isApproved: true },
    });

    setIdentity(operatorUserId, 'OPERATOR');
    const res = await request(app).patch(`/api/experiences/${experienceId}/publish`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);
    expect(res.body.data.isApproved).toBe(true);

    // Reset for subsequent tests
    await prisma.experience.update({
      where: { id: experienceId },
      data: { isActive: false, isApproved: false },
    });
  });
});

// ─── UI-4: Day-mapping — BYDAY expansion for all 7 days ──────────────────────
describe('UI-4: Recurrence day-mapping — all 7 days', () => {
  // Helper: find the next occurrence of a given UTC day-of-week from a base date
  function nextDayOfWeek(baseDate: Date, targetUtcDay: number): Date {
    const d = new Date(baseDate);
    d.setUTCHours(10, 0, 0, 0);
    const currentDay = d.getUTCDay();
    const daysUntil = (targetUtcDay - currentDay + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + daysUntil);
    return d;
  }

  const WEEKDAY_MAP: Array<{ rruleDay: string; utcDay: number; label: string }> = [
    { rruleDay: 'MO', utcDay: 1, label: 'Monday' },
    { rruleDay: 'TU', utcDay: 2, label: 'Tuesday' },
    { rruleDay: 'WE', utcDay: 3, label: 'Wednesday' },
    { rruleDay: 'TH', utcDay: 4, label: 'Thursday' },
    { rruleDay: 'FR', utcDay: 5, label: 'Friday' },
    { rruleDay: 'SA', utcDay: 6, label: 'Saturday' },
    { rruleDay: 'SU', utcDay: 0, label: 'Sunday' },
  ];

  for (const { rruleDay, utcDay, label } of WEEKDAY_MAP) {
    it(`BYDAY=${rruleDay} — all 3 instances land on ${label} (UTC day ${utcDay})`, async () => {
      setIdentity(operatorUserId, 'OPERATOR');
      const base = new Date();
      const firstOccurrence = nextDayOfWeek(base, utcDay);
      const endTime = new Date(firstOccurrence.getTime() + 2 * 60 * 60 * 1000);

      const res = await request(app)
        .post(`/api/experience-slots/${experienceId}`)
        .send({
          startTime: firstOccurrence.toISOString(),
          endTime: endTime.toISOString(),
          capacity: 8,
          rruleString: `FREQ=WEEKLY;BYDAY=${rruleDay};COUNT=3`,
          timezone: 'Africa/Lagos',
        });

      expect(res.status).toBe(201);
      expect(res.body.instanceCount).toBe(3);

      const instances: any[] = res.body.data.instances;
      expect(instances).toHaveLength(3);
      instances.forEach(inst => {
        const dayOfWeek = new Date(inst.startTime).getUTCDay();
        expect(dayOfWeek).toBe(utcDay);
      });

      // Cleanup
      await prisma.experienceSlot.deleteMany({ where: { parentSlotId: res.body.data.parent.id } });
      await prisma.experienceSlot.delete({ where: { id: res.body.data.parent.id } });
    });
  }

  it('BYDAY=SA,SU — all instances land on Saturday or Sunday (multi-day selection)', async () => {
    setIdentity(operatorUserId, 'OPERATOR');
    const base = new Date();
    const firstSat = nextDayOfWeek(base, 6);
    const endTime = new Date(firstSat.getTime() + 2 * 60 * 60 * 1000);

    const res = await request(app)
      .post(`/api/experience-slots/${experienceId}`)
      .send({
        startTime: firstSat.toISOString(),
        endTime: endTime.toISOString(),
        capacity: 8,
        rruleString: 'FREQ=WEEKLY;BYDAY=SA,SU;COUNT=4',
        timezone: 'Africa/Lagos',
      });

    expect(res.status).toBe(201);
    expect(res.body.instanceCount).toBe(4);

    const instances: any[] = res.body.data.instances;
    instances.forEach(inst => {
      const dayOfWeek = new Date(inst.startTime).getUTCDay();
      expect([0, 6]).toContain(dayOfWeek); // 0=Sunday, 6=Saturday
    });

    // Cleanup
    await prisma.experienceSlot.deleteMany({ where: { parentSlotId: res.body.data.parent.id } });
    await prisma.experienceSlot.delete({ where: { id: res.body.data.parent.id } });
  });

  it('BYDAY=MO,WE,FR — all instances land on Mon, Wed, or Fri (three-day selection)', async () => {
    setIdentity(operatorUserId, 'OPERATOR');
    const base = new Date();
    const firstMon = nextDayOfWeek(base, 1);
    const endTime = new Date(firstMon.getTime() + 2 * 60 * 60 * 1000);

    const res = await request(app)
      .post(`/api/experience-slots/${experienceId}`)
      .send({
        startTime: firstMon.toISOString(),
        endTime: endTime.toISOString(),
        capacity: 8,
        rruleString: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6',
        timezone: 'Africa/Lagos',
      });

    expect(res.status).toBe(201);
    expect(res.body.instanceCount).toBe(6);

    const instances: any[] = res.body.data.instances;
    instances.forEach(inst => {
      const dayOfWeek = new Date(inst.startTime).getUTCDay();
      expect([1, 3, 5]).toContain(dayOfWeek); // 1=Mon, 3=Wed, 5=Fri
    });

    // Cleanup
    await prisma.experienceSlot.deleteMany({ where: { parentSlotId: res.body.data.parent.id } });
    await prisma.experienceSlot.delete({ where: { id: res.body.data.parent.id } });
  });
});

// ─── UI-5: PUT field integrity — isActive rejected via PUT ───────────────────
describe('UI-5: PUT /api/experiences/:id — isActive excluded from allowlist', () => {
  it('PUT with isActive=true does NOT change isActive (field silently ignored)', async () => {
    setIdentity(operatorUserId, 'OPERATOR');

    // Confirm starting state is isActive=false
    const before = await prisma.experience.findUnique({ where: { id: experienceId } });
    expect(before!.isActive).toBe(false);

    const res = await request(app)
      .put(`/api/experiences/${experienceId}`)
      .send({
        name: 'UIEnable Updated Name',
        isActive: true,   // UI-5: this must be silently ignored
      });

    expect(res.status).toBe(200);
    // isActive must remain false — the PUT must not have changed it
    expect(res.body.data.isActive).toBe(false);

    // Verify in DB too
    const after = await prisma.experience.findUnique({ where: { id: experienceId } });
    expect(after!.isActive).toBe(false);
    // The name update should still have worked
    expect(after!.name).toBe('UIEnable Updated Name');
  });

  it('PUT with isFeatured=true does NOT change isFeatured (field silently ignored)', async () => {
    setIdentity(operatorUserId, 'OPERATOR');

    const res = await request(app)
      .put(`/api/experiences/${experienceId}`)
      .send({
        description: 'Updated description via PUT',
        isFeatured: true, // UI-5: this must also be silently ignored
      });

    expect(res.status).toBe(200);
    expect(res.body.data.isFeatured).toBe(false);

    const after = await prisma.experience.findUnique({ where: { id: experienceId } });
    expect(after!.isFeatured).toBe(false);
  });

  it('PATCH /publish still works after UI-5 fix (dedicated endpoint unaffected)', async () => {
    // Approve first
    await prisma.experience.update({
      where: { id: experienceId },
      data: { isApproved: true },
    });

    setIdentity(operatorUserId, 'OPERATOR');
    const res = await request(app).patch(`/api/experiences/${experienceId}/publish`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);

    // Cleanup
    await prisma.experience.update({
      where: { id: experienceId },
      data: { isActive: false, isApproved: false },
    });
  });

  it('PATCH /unpublish still works after UI-5 fix (dedicated endpoint unaffected)', async () => {
    // Set active first
    await prisma.experience.update({
      where: { id: experienceId },
      data: { isActive: true, isApproved: true },
    });

    setIdentity(operatorUserId, 'OPERATOR');
    const res = await request(app).patch(`/api/experiences/${experienceId}/unpublish`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    // Cleanup
    await prisma.experience.update({
      where: { id: experienceId },
      data: { isApproved: false },
    });
  });
});
