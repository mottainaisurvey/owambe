/**
 * E2B Admin Surfaces Integration Tests
 * AC-8: Integration test coverage for new admin surface endpoints
 * AC-9: Backward compatibility verification
 *
 * Tests:
 * - GET /admin/platform/stats includes new pending approval and dispute fields
 * - GET /admin/vendors returns vendor list with commissionRate
 * - GET /admin/events returns event list with planner and attendee count
 * - Backward compatibility: existing fields still present in platform/stats
 */

import request from 'supertest';
import { app } from '../app';
import { prisma } from '../database/client';

// ─── MOCKS ───────────────────────────────────────────────────────────────────
jest.mock('../services/email.service', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../middleware/authenticate', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.userId = (global as any).__e2bAdminId ?? 'test-admin-id';
    req.userRole = 'ADMIN';
    next();
  },
  authenticateOptional: (_req: any, _res: any, next: any) => { next(); },
}));

jest.mock('../middleware/requireRole', () => ({
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

// ─── TEST DATA ────────────────────────────────────────────────────────────────
let testAdminId: string;
let testVendorId: string;
let testEventId: string;
let testPlannerUserId: string;
let testPlannerId: string;

beforeAll(async () => {
  // Create admin user
  const admin = await prisma.user.create({
    data: {
      email: `e2b-admin-${Date.now()}@test.com`,
      passwordHash: 'hash',
      firstName: 'E2B',
      lastName: 'Admin',
      role: 'ADMIN',
    },
  });
  testAdminId = admin.id;

  // Create vendor user + vendor
  const vendorUser = await prisma.user.create({
    data: {
      email: `e2b-vendor-${Date.now()}@test.com`,
      passwordHash: 'hash',
      firstName: 'E2B',
      lastName: 'Vendor',
      role: 'VENDOR',
    },
  });
  const vendor = await prisma.vendor.create({
    data: {
      userId: vendorUser.id,
      businessName: 'E2B Test Vendor',
      category: 'CATERING',
      status: 'VERIFIED',
      commissionRate: 8.5,
    },
  });
  testVendorId = vendor.id;

  // Create planner user + planner + event
  const plannerUser = await prisma.user.create({
    data: {
      email: `e2b-planner-${Date.now()}@test.com`,
      passwordHash: 'hash',
      firstName: 'E2B',
      lastName: 'Planner',
      role: 'PLANNER',
    },
  });
  testPlannerUserId = plannerUser.id;

  const planner = await prisma.planner.create({
    data: { userId: plannerUser.id },
  });
  testPlannerId = planner.id;

  const event = await prisma.event.create({
    data: {
      plannerId: planner.id,
      name: 'E2B Test Event',
      slug: `e2b-test-event-${Date.now()}`,
      type: 'WEDDING',
      status: 'PUBLISHED',
      startDate: new Date('2026-09-01'),
    },
  });
  testEventId = event.id;
});

afterAll(async () => {
  // Clean up in dependency order
  await prisma.event.deleteMany({ where: { id: testEventId } });
  await prisma.planner.deleteMany({ where: { id: testPlannerId } });
  await prisma.vendor.deleteMany({ where: { id: testVendorId } });
  await prisma.user.deleteMany({
    where: { id: { in: [testAdminId, testPlannerUserId] } },
  });
  // vendorUser is cascade-deleted with vendor
  await prisma.$disconnect();
});

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe('E2B Admin Surfaces — GET /admin/platform/stats', () => {
  it('AC-8: returns all original fields (backward compatibility)', async () => {
    const res = await request(app)
      .get('/api/admin/platform/stats')
      .expect(200);

    expect(res.body.success).toBe(true);
    const { stats } = res.body;
    expect(stats).toHaveProperty('totalUsers');
    expect(stats).toHaveProperty('totalVendors');
    expect(stats).toHaveProperty('pendingVendors');
    expect(stats).toHaveProperty('totalEvents');
    expect(stats).toHaveProperty('totalBookings');
    expect(stats).toHaveProperty('totalGMV');
    expect(stats).toHaveProperty('totalCommission');
  });

  it('AC-8: returns new E2B fields: pendingApprovals, pendingHosts, pendingProperties, pendingOperators, pendingExperiences, disputedBookings', async () => {
    const res = await request(app)
      .get('/api/admin/platform/stats')
      .expect(200);

    const { stats } = res.body;
    expect(stats).toHaveProperty('pendingApprovals');
    expect(stats).toHaveProperty('pendingHosts');
    expect(stats).toHaveProperty('pendingProperties');
    expect(stats).toHaveProperty('pendingOperators');
    expect(stats).toHaveProperty('pendingExperiences');
    expect(stats).toHaveProperty('disputedBookings');

    // All values must be non-negative integers
    expect(typeof stats.pendingApprovals).toBe('number');
    expect(stats.pendingApprovals).toBeGreaterThanOrEqual(0);
    expect(stats.pendingHosts).toBeGreaterThanOrEqual(0);
    expect(stats.pendingProperties).toBeGreaterThanOrEqual(0);
    expect(stats.pendingOperators).toBeGreaterThanOrEqual(0);
    expect(stats.pendingExperiences).toBeGreaterThanOrEqual(0);
    expect(stats.disputedBookings).toBeGreaterThanOrEqual(0);
  });

  it('AC-8: pendingApprovals equals sum of pendingHosts + pendingProperties + pendingOperators + pendingExperiences', async () => {
    const res = await request(app)
      .get('/api/admin/platform/stats')
      .expect(200);

    const { stats } = res.body;
    expect(stats.pendingApprovals).toBe(
      stats.pendingHosts + stats.pendingProperties + stats.pendingOperators + stats.pendingExperiences
    );
  });
});

describe('E2B Admin Surfaces — GET /admin/vendors', () => {
  it('AC-8: returns vendors array with commissionRate field', async () => {
    const res = await request(app)
      .get('/api/admin/vendors')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.vendors)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  it('AC-8: vendor objects include commissionRate and status fields', async () => {
    const res = await request(app)
      .get('/api/admin/vendors')
      .expect(200);

    const testVendor = res.body.vendors.find((v: any) => v.id === testVendorId);
    expect(testVendor).toBeDefined();
    expect(testVendor).toHaveProperty('commissionRate');
    expect(testVendor).toHaveProperty('status');
    expect(testVendor).toHaveProperty('businessName');
    expect(testVendor).toHaveProperty('user');
    expect(Number(testVendor.commissionRate)).toBeCloseTo(8.5, 1);
  });

  it('AC-8: search parameter filters vendors by businessName', async () => {
    const res = await request(app)
      .get('/api/admin/vendors')
      .query({ search: 'E2B Test Vendor' })
      .expect(200);

    expect(res.body.vendors.length).toBeGreaterThanOrEqual(1);
    expect(res.body.vendors.some((v: any) => v.id === testVendorId)).toBe(true);
  });

  it('AC-9: backward compatibility — existing PUT /admin/vendors/:id/commission still works', async () => {
    const res = await request(app)
      .put(`/api/admin/vendors/${testVendorId}/commission`)
      .send({ rate: 9.0 })
      .expect(200);

    expect(res.body.success).toBe(true);
    // Restore original rate
    await prisma.vendor.update({ where: { id: testVendorId }, data: { commissionRate: 8.5 } });
  });
});

describe('E2B Admin Surfaces — GET /admin/events', () => {
  it('AC-8: returns events array with planner and _count fields', async () => {
    const res = await request(app)
      .get('/api/admin/events')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  it('AC-8: event objects include planner relation and attendee count', async () => {
    const res = await request(app)
      .get('/api/admin/events')
      .expect(200);

    const testEvent = res.body.events.find((e: any) => e.id === testEventId);
    expect(testEvent).toBeDefined();
    expect(testEvent).toHaveProperty('name', 'E2B Test Event');
    expect(testEvent).toHaveProperty('status', 'PUBLISHED');
    expect(testEvent).toHaveProperty('planner');
    expect(testEvent).toHaveProperty('_count');
    expect(testEvent._count).toHaveProperty('attendees');
  });

  it('AC-8: status filter returns only events with matching status', async () => {
    const res = await request(app)
      .get('/api/admin/events')
      .query({ status: 'PUBLISHED' })
      .expect(200);

    expect(res.body.events.every((e: any) => e.status === 'PUBLISHED')).toBe(true);
  });

  it('AC-9: backward compatibility — existing GET /admin/platform/stats totalEvents still counts all events', async () => {
    const statsRes = await request(app)
      .get('/api/admin/platform/stats')
      .expect(200);

    const eventsRes = await request(app)
      .get('/api/admin/events')
      .expect(200);

    // totalEvents in stats should match total from /admin/events (both count all events)
    expect(statsRes.body.stats.totalEvents).toBe(eventsRes.body.total);
  });
});
