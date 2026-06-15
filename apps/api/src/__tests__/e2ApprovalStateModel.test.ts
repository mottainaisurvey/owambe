/**
 * OWB-E2-IMPLEMENTATION-01 Rev 1 — AC-8: Approval State Model Integration Tests
 *
 * Tests for the isApproved field on Host, Property, Operator, and Experience entities.
 *
 * Coverage:
 *   1. Default approval state — new entities have isApproved: false
 *   2. Consumer-side filtering — GET /api/properties and GET /api/experiences
 *      only return isApproved: true records
 *   3. Admin approve endpoint — POST /admin/hosts/:id/approve sets isApproved: true
 *   4. Admin revoke endpoint — POST /admin/hosts/:id/revoke sets isApproved: false
 *   5. Backward compatibility — isApproved: false default does not break existing
 *      operator/host profile creation paths
 *
 * Strategy:
 *   - Uses the real Prisma client connected to the CI test database.
 *   - Seeds minimal test data in beforeAll; cleans up in afterAll.
 *   - Mocks authenticate middleware to inject admin identity for admin endpoints.
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

let adminUserId: string;
let hostUserId: string;
let operatorUserId: string;
let hostId: string;
let propertyId: string;
let operatorId: string;
let experienceId: string;
let experienceSlug: string;

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const passwordHash = await bcrypt.hash('TestPass123!', 10);

  // Admin user
  const adminUser = await prisma.user.create({
    data: {
      email: `e2-admin-${Date.now()}@test.owambe.com`,
      passwordHash,
      firstName: 'E2',
      lastName: 'Admin',
      role: 'ADMIN',
      isEmailVerified: true,
    },
  });
  adminUserId = adminUser.id;

  // Host user + Host profile
  const hostUser = await prisma.user.create({
    data: {
      email: `e2-host-${Date.now()}@test.owambe.com`,
      passwordHash,
      firstName: 'E2',
      lastName: 'Host',
      role: 'HOST',
      isEmailVerified: true,
    },
  });
  hostUserId = hostUser.id;

  const host = await prisma.host.create({
    data: {
      userId: hostUserId,
      businessName: 'E2 Test Host',
      city: 'Lagos',
      isVerified: true,
    },
  });
  hostId = host.id;

  // Property (isApproved defaults to false)
  const property = await prisma.property.create({
    data: {
      hostId,
      name: 'E2 Test Property',
      slug: `e2-test-property-${Date.now()}`,
      propertyType: 'APARTMENT',
      city: 'Lagos',
      address: '1 Test Street',
      country: 'NG',
      isActive: true,
      // isApproved not set — should default to false
    },
  });
  propertyId = property.id;

  // Operator user + Operator profile
  const operatorUser = await prisma.user.create({
    data: {
      email: `e2-operator-${Date.now()}@test.owambe.com`,
      passwordHash,
      firstName: 'E2',
      lastName: 'Operator',
      role: 'OPERATOR',
      isEmailVerified: true,
    },
  });
  operatorUserId = operatorUser.id;

  const operator = await prisma.operator.create({
    data: {
      userId: operatorUserId,
      businessName: 'E2 Test Operator',
      city: 'Lagos',
      isVerified: true,
    },
  });
  operatorId = operator.id;

  // Experience (isApproved defaults to false)
  const slug = `e2-test-experience-${Date.now()}`;
  const experience = await prisma.experience.create({
    data: {
      operatorId,
      name: 'E2 Test Experience',
      slug,
      experienceType: 'FOOD_TASTING',
      city: 'Lagos',
      pricePerPerson: 5000,
      currency: 'NGN',
      isActive: true,
      // isApproved not set — should default to false
    },
  });
  experienceId = experience.id;
  experienceSlug = slug;
});

afterAll(async () => {
  // Clean up in reverse dependency order
  await prisma.experience.deleteMany({ where: { operatorId } });
  await prisma.operator.delete({ where: { id: operatorId } });
  await prisma.user.delete({ where: { id: operatorUserId } });

  await prisma.property.deleteMany({ where: { hostId } });
  await prisma.host.delete({ where: { id: hostId } });
  await prisma.user.delete({ where: { id: hostUserId } });

  await prisma.user.delete({ where: { id: adminUserId } });
});

// ─── Mock authenticate to inject admin identity for admin routes ──────────────
// We override per-test using (global as any).__e2AdminId
jest.mock('../middleware/authenticate', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.userId = (global as any).__e2AdminId ?? (global as any).__e2HostId ?? 'test-id';
    req.userRole = (global as any).__e2Role ?? 'ADMIN';
    next();
  },
}));

jest.mock('../middleware/requireMode', () => ({
  requireMode: () => (_req: any, _res: any, next: any) => next(),
}));

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('E2 Approval State Model — Default State', () => {
  it('AC-7: new Property has isApproved: false by default', async () => {
    const property = await prisma.property.findUnique({ where: { id: propertyId } });
    expect(property).not.toBeNull();
    expect(property!.isApproved).toBe(false);
  });

  it('AC-7: new Experience has isApproved: false by default', async () => {
    const experience = await prisma.experience.findUnique({ where: { id: experienceId } });
    expect(experience).not.toBeNull();
    expect(experience!.isApproved).toBe(false);
  });

  it('AC-7: new Host has isApproved: false by default', async () => {
    const host = await prisma.host.findUnique({ where: { id: hostId } });
    expect(host).not.toBeNull();
    expect(host!.isApproved).toBe(false);
  });

  it('AC-7: new Operator has isApproved: false by default', async () => {
    const operator = await prisma.operator.findUnique({ where: { id: operatorId } });
    expect(operator).not.toBeNull();
    expect(operator!.isApproved).toBe(false);
  });
});

describe('E2 Approval State Model — Consumer-Side Filtering', () => {
  it('AC-6: GET /api/properties does NOT return unapproved properties', async () => {
    const res = await request(app).get('/api/properties').query({ city: 'Lagos' });
    expect(res.status).toBe(200);
    const ids = (res.body.data ?? []).map((p: any) => p.id);
    expect(ids).not.toContain(propertyId);
  });

  it('AC-6: GET /api/experiences does NOT return unapproved experiences', async () => {
    const res = await request(app).get('/api/experiences').query({ city: 'Lagos' });
    expect(res.status).toBe(200);
    const ids = (res.body.data ?? []).map((e: any) => e.id);
    expect(ids).not.toContain(experienceId);
  });

  it('AC-6: GET /api/experiences/:slug returns 404 for unapproved experience', async () => {
    const res = await request(app).get(`/api/experiences/${experienceSlug}`);
    expect(res.status).toBe(404);
  });
});

describe('E2 Approval State Model — Admin Approve/Revoke', () => {
  beforeEach(() => {
    (global as any).__e2AdminId = adminUserId;
    (global as any).__e2Role = 'ADMIN';
  });

  it('AC-3: POST /admin/hosts/:id/approve sets isApproved: true', async () => {
    const res = await request(app)
      .post(`/api/admin/hosts/${hostId}/approve`)
      .set('Authorization', 'Bearer test-admin-token');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const host = await prisma.host.findUnique({ where: { id: hostId } });
    expect(host!.isApproved).toBe(true);
    expect(host!.approvedAt).not.toBeNull();
  });

  it('AC-3: POST /admin/hosts/:id/revoke sets isApproved: false', async () => {
    const res = await request(app)
      .post(`/api/admin/hosts/${hostId}/revoke`)
      .set('Authorization', 'Bearer test-admin-token');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const host = await prisma.host.findUnique({ where: { id: hostId } });
    expect(host!.isApproved).toBe(false);
    expect(host!.approvedAt).toBeNull();
  });

  it('AC-3: POST /admin/experiences/:id/approve sets isApproved: true', async () => {
    const res = await request(app)
      .post(`/api/admin/experiences/${experienceId}/approve`)
      .set('Authorization', 'Bearer test-admin-token');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const experience = await prisma.experience.findUnique({ where: { id: experienceId } });
    expect(experience!.isApproved).toBe(true);
  });

  it('AC-6 + AC-3: approved experience IS returned by consumer listing', async () => {
    // Experience is now approved from the previous test
    const res = await request(app).get('/api/experiences').query({ city: 'Lagos' });
    expect(res.status).toBe(200);
    const ids = (res.body.data ?? []).map((e: any) => e.id);
    expect(ids).toContain(experienceId);
  });

  it('AC-6 + AC-3: approved experience slug IS accessible to consumers', async () => {
    const res = await request(app).get(`/api/experiences/${experienceSlug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(experienceId);
  });

  it('AC-3: POST /admin/experiences/:id/revoke sets isApproved: false', async () => {
    const res = await request(app)
      .post(`/api/admin/experiences/${experienceId}/revoke`)
      .set('Authorization', 'Bearer test-admin-token');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const experience = await prisma.experience.findUnique({ where: { id: experienceId } });
    expect(experience!.isApproved).toBe(false);
  });
});
