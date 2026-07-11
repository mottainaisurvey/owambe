/**
 * OWB-C1-EXPERIENCES-OPERATOR-SCAFFOLD-01 — AC-4: Regression Tests
 *
 * Coverage:
 *   1. Role gating — OPERATOR-only endpoints reject non-OPERATOR roles (401/403)
 *   2. Registration → mode hydration — OPERATOR registration creates Operator profile
 *      and sets activeMode=EXPERIENCES, availableModes=[EXPERIENCES]
 *   3. CRUD — create experience creates in DRAFT state (isActive=false, isApproved=false)
 *   4. Lifecycle transitions — publish blocked if !isApproved; unpublish always permitted
 *   5. Soft-delete (archive) — archive sets isActive=false; hard DELETE is not available
 *   6. GET /mine — returns operator's own experiences across all lifecycle states
 *   7. Route ordering — GET /mine does not collide with GET /:slug
 *   8. Existing-persona regression — HOST registration still sets STAYS mode hydration
 *
 * Strategy:
 *   - Uses real Prisma client connected to CI test database.
 *   - Seeds minimal test data in beforeAll; cleans up in afterAll.
 *   - Mocks authenticate middleware to inject operator/host/consumer identity.
 *   - Mocks requireMode middleware to bypass mode gating for non-mode tests.
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
    req.userId = (global as any).__c1UserId ?? 'test-id';
    req.userRole = (global as any).__c1Role ?? 'OPERATOR';
    next();
  },
}));

jest.mock('../middleware/requireMode', () => ({
  requireMode: () => (_req: any, _res: any, next: any) => next(),
}));

// ─── Test State ───────────────────────────────────────────────────────────────
let operatorUserId: string;
let operatorId: string;
let hostUserId: string;
let consumerUserId: string;
let experienceId: string;
let experienceSlug: string;

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const passwordHash = await bcrypt.hash('TestPass123!', 10);
  const ts = Date.now();

  // Operator user + profile
  const operatorUser = await prisma.user.create({
    data: {
      email: `c1-operator-${ts}@test.owambe.com`,
      passwordHash,
      firstName: 'C1',
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
      businessName: 'C1 Test Operator Co.',
      city: 'Lagos',
    },
  });
  operatorId = operator.id;

  // Host user (for regression)
  const hostUser = await prisma.user.create({
    data: {
      email: `c1-host-${ts}@test.owambe.com`,
      passwordHash,
      firstName: 'C1',
      lastName: 'Host',
      role: 'HOST',
      isEmailVerified: true,
      activeMode: 'STAYS',
      availableModes: ['STAYS'],
    },
  });
  hostUserId = hostUser.id;
  await prisma.host.create({ data: { userId: hostUserId } });

  // Consumer user (for role-gating tests)
  const consumerUser = await prisma.user.create({
    data: {
      email: `c1-consumer-${ts}@test.owambe.com`,
      passwordHash,
      firstName: 'C1',
      lastName: 'Consumer',
      role: 'CONSUMER',
      isEmailVerified: true,
    },
  });
  consumerUserId = consumerUser.id;
  await prisma.consumer.create({ data: { userId: consumerUserId } });
});

afterAll(async () => {
  // Clean up in reverse dependency order
  if (experienceId) {
    await prisma.experience.deleteMany({ where: { operatorId } });
  }
  await prisma.operator.deleteMany({ where: { userId: operatorUserId } });
  await prisma.user.deleteMany({
    where: { id: { in: [operatorUserId, hostUserId, consumerUserId] } },
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────
function setIdentity(userId: string, role: string) {
  (global as any).__c1UserId = userId;
  (global as any).__c1Role = role;
}

// ─── 1. Role Gating ───────────────────────────────────────────────────────────
describe('C1-a: Role Gating', () => {
  it('POST /api/experiences returns 403 for CONSUMER role', async () => {
    setIdentity(consumerUserId, 'CONSUMER');
    const res = await request(app)
      .post('/api/experiences')
      .send({ name: 'Test', experienceType: 'ADVENTURE', city: 'Lagos', pricePerPerson: 5000 });
    expect(res.status).toBe(403);
  });

  it('POST /api/experiences returns 403 for HOST role', async () => {
    setIdentity(hostUserId, 'HOST');
    const res = await request(app)
      .post('/api/experiences')
      .send({ name: 'Test', experienceType: 'ADVENTURE', city: 'Lagos', pricePerPerson: 5000 });
    expect(res.status).toBe(403);
  });

  it('GET /api/experiences/mine returns 403 for CONSUMER role', async () => {
    setIdentity(consumerUserId, 'CONSUMER');
    const res = await request(app).get('/api/experiences/mine');
    expect(res.status).toBe(403);
  });

  it('PATCH /api/experiences/:id/publish returns 403 for CONSUMER role', async () => {
    setIdentity(consumerUserId, 'CONSUMER');
    const res = await request(app).patch('/api/experiences/some-id/publish');
    expect(res.status).toBe(403);
  });
});

// ─── 2. Registration → Mode Hydration ────────────────────────────────────────
describe('C1-a: Registration → Mode Hydration', () => {
  it('OPERATOR registration creates Operator profile with EXPERIENCES mode', async () => {
    const ts = Date.now();
    const email = `c1-reg-operator-${ts}@test.owambe.com`;

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        firstName: 'Reg',
        lastName: 'Operator',
        role: 'OPERATOR',
        companyName: 'Reg Operator Co.',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // Verify user was created with EXPERIENCES mode
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(user!.role).toBe('OPERATOR');
    expect(user!.activeMode).toBe('EXPERIENCES');
    expect(user!.availableModes).toContain('EXPERIENCES');

    // Verify Operator profile was created
    const operator = await prisma.operator.findUnique({ where: { userId: user!.id } });
    expect(operator).not.toBeNull();
    expect(operator!.businessName).toBe('Reg Operator Co.');

    // Cleanup
    await prisma.operator.delete({ where: { userId: user!.id } });
    await prisma.user.delete({ where: { id: user!.id } });
  });

  it('HOST registration still sets STAYS mode (regression)', async () => {
    const ts = Date.now();
    const email = `c1-reg-host-${ts}@test.owambe.com`;

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        firstName: 'Reg',
        lastName: 'Host',
        role: 'HOST',
        companyName: 'Reg Host Co.',
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

  it('OPERATOR not accepted in role validation returns 4xx for invalid role', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `c1-invalid-${Date.now()}@test.owambe.com`,
        password: 'TestPass123!',
        firstName: 'Bad',
        lastName: 'Role',
        role: 'INVALID_ROLE',
      });
    // Auth route returns 422 (Zod validation) for invalid enum values
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

// ─── 3. CRUD — Create in DRAFT State ─────────────────────────────────────────
describe('C1-b.1: Create Experience — DRAFT State', () => {
  it('POST /api/experiences creates experience with isActive=false, isApproved=false', async () => {
    setIdentity(operatorUserId, 'OPERATOR');
    const ts = Date.now();

    const res = await request(app)
      .post('/api/experiences')
      .send({
        name: `C1 Test Experience ${ts}`,
        experienceType: 'CULTURAL_TOUR',
        city: 'Lagos',
        pricePerPerson: 15000,
        currency: 'NGN',
        description: 'A test experience for C1 regression',
        meetingDetails: 'Meet at the main gate',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isActive).toBe(false);   // C1-b.0: DRAFT
    expect(res.body.data.isApproved).toBe(false); // E2: not yet approved
    expect(res.body.data.meetingDetails).toBe('Meet at the main gate'); // C1 field

    experienceId = res.body.data.id;
    experienceSlug = res.body.data.slug;
  });
});

// ─── 4. Lifecycle Transitions ─────────────────────────────────────────────────
describe('C1-b.0: Lifecycle Transitions', () => {
  it('PATCH /publish returns 403 when isApproved=false (authority matrix)', async () => {
    setIdentity(operatorUserId, 'OPERATOR');
    const res = await request(app).patch(`/api/experiences/${experienceId}/publish`);
    expect(res.status).toBe(403);
    // AppError is serialized as { success: false, error: '...' } by errorHandler
    expect(res.body.error).toMatch(/approved/i);
  });

  it('PATCH /unpublish succeeds even when isActive=false (no-op is permitted)', async () => {
    setIdentity(operatorUserId, 'OPERATOR');
    const res = await request(app).patch(`/api/experiences/${experienceId}/unpublish`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('PATCH /publish succeeds after isApproved=true is set directly', async () => {
    // Simulate admin approval by directly updating the DB
    await prisma.experience.update({
      where: { id: experienceId },
      data: { isApproved: true },
    });

    setIdentity(operatorUserId, 'OPERATOR');
    const res = await request(app).patch(`/api/experiences/${experienceId}/publish`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);
    expect(res.body.data.isApproved).toBe(true);
  });

  it('PATCH /unpublish after publish sets isActive=false', async () => {
    setIdentity(operatorUserId, 'OPERATOR');
    const res = await request(app).patch(`/api/experiences/${experienceId}/unpublish`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });
});

// ─── 5. Soft-Delete (Archive) ─────────────────────────────────────────────────
describe('C1-b.2: Soft-Delete (Archive)', () => {
  it('PATCH /archive sets isActive=false (soft-delete)', async () => {
    setIdentity(operatorUserId, 'OPERATOR');
    const res = await request(app).patch(`/api/experiences/${experienceId}/archive`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('Experience still exists in DB after archive (not hard-deleted)', async () => {
    const exp = await prisma.experience.findUnique({ where: { id: experienceId } });
    expect(exp).not.toBeNull();
    expect(exp!.isActive).toBe(false);
  });

  it('Archived experience is NOT returned by consumer listing', async () => {
    const res = await request(app).get('/api/experiences').query({ city: 'Lagos' });
    expect(res.status).toBe(200);
    const ids = (res.body.data ?? []).map((e: any) => e.id);
    expect(ids).not.toContain(experienceId);
  });
});

// ─── 6. GET /mine ─────────────────────────────────────────────────────────────
describe('C1-b.2: GET /api/experiences/mine', () => {
  it('returns operator own experiences including archived (all lifecycle states)', async () => {
    setIdentity(operatorUserId, 'OPERATOR');
    const res = await request(app).get('/api/experiences/mine');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const ids = (res.body.data ?? []).map((e: any) => e.id);
    expect(ids).toContain(experienceId);
  });

  it('returns 403 for CONSUMER on GET /mine', async () => {
    setIdentity(consumerUserId, 'CONSUMER');
    const res = await request(app).get('/api/experiences/mine');
    expect(res.status).toBe(403);
  });
});

// ─── 7. Route Ordering ────────────────────────────────────────────────────────
describe('C1: Route Ordering — /mine before /:slug', () => {
  it('GET /api/experiences/mine is not treated as a slug lookup', async () => {
    setIdentity(operatorUserId, 'OPERATOR');
    const res = await request(app).get('/api/experiences/mine');
    // Should return 200 with operator data, not a 404 slug lookup
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ─── 8. Ownership Gating ─────────────────────────────────────────────────────
describe('C1-b.0: Ownership Gating', () => {
  it('PATCH /publish returns 403 for OPERATOR who does not own the experience', async () => {
    // Create a second operator
    const ts = Date.now();
    const otherUser = await prisma.user.create({
      data: {
        email: `c1-other-operator-${ts}@test.owambe.com`,
        passwordHash: await bcrypt.hash('TestPass123!', 10),
        firstName: 'Other',
        lastName: 'Operator',
        role: 'OPERATOR',
        isEmailVerified: true,
      },
    });
    await prisma.operator.create({ data: { userId: otherUser.id } });

    setIdentity(otherUser.id, 'OPERATOR');
    const res = await request(app).patch(`/api/experiences/${experienceId}/publish`);
    expect(res.status).toBe(403);

    // Cleanup
    await prisma.operator.deleteMany({ where: { userId: otherUser.id } });
    await prisma.user.delete({ where: { id: otherUser.id } });
  });
});
