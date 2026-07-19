/**
 * OWB-C-CONSUMER-ENTRY-01 — AC-2 Test Suite
 *
 * Tests:
 *   T1: CONSUMER registration without intent → activeMode EVENTS, availableModes ['EVENTS']
 *   T2: CONSUMER registration with BOOK_STAY intent → activeMode STAYS, availableModes ['STAYS']
 *   T3: CONSUMER registration with BOOK_EXPERIENCE intent → activeMode EXPERIENCES, availableModes ['EXPERIENCES']
 *   T4: CONSUMER registration with ATTEND_EVENT intent → activeMode EVENTS, availableModes ['EVENTS']
 *   T5: CONSUMER registration with PLAN_EVENT intent → activeMode EVENTS, availableModes ['EVENTS']
 *   T6: Supply roles (PLANNER, OPERATOR, HOST) are unaffected by the consumerIntent field
 */

import request from 'supertest';
import { app } from '../app';
import { prisma } from '../database/client';

const BASE = '/api';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: '@ce01.owambe' } } });
  await prisma.$disconnect();
});

// ─── T1: CONSUMER without intent → EVENTS default ────────────────────────────
describe('OWB-C-CONSUMER-ENTRY-01 T1: CONSUMER no-intent default', () => {
  it('registers with activeMode EVENTS and availableModes [EVENTS] when no consumerIntent supplied', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/register`)
      .send({
        email: 'consumer-nointent@ce01.owambe',
        password: 'Test1234!',
        firstName: 'Test',
        lastName: 'Consumer',
        role: 'CONSUMER',
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const user = await prisma.user.findUnique({
      where: { email: 'consumer-nointent@ce01.owambe' },
      select: { activeMode: true, availableModes: true, role: true },
    });
    expect(user?.role).toBe('CONSUMER');
    expect(user?.activeMode).toBe('EVENTS');
    expect(user?.availableModes).toEqual(['EVENTS']);
  });
});

// ─── T2: CONSUMER BOOK_STAY → STAYS ──────────────────────────────────────────
describe('OWB-C-CONSUMER-ENTRY-01 T2: CONSUMER BOOK_STAY intent → STAYS', () => {
  it('registers with activeMode STAYS and availableModes [STAYS] for BOOK_STAY intent', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/register`)
      .send({
        email: 'consumer-bookstay@ce01.owambe',
        password: 'Test1234!',
        firstName: 'Stay',
        lastName: 'Guest',
        role: 'CONSUMER',
        consumerIntent: 'BOOK_STAY',
      });
    expect(res.status).toBe(201);

    const user = await prisma.user.findUnique({
      where: { email: 'consumer-bookstay@ce01.owambe' },
      select: { activeMode: true, availableModes: true },
    });
    expect(user?.activeMode).toBe('STAYS');
    expect(user?.availableModes).toEqual(['STAYS']);
  });
});

// ─── T3: CONSUMER BOOK_EXPERIENCE → EXPERIENCES ──────────────────────────────
describe('OWB-C-CONSUMER-ENTRY-01 T3: CONSUMER BOOK_EXPERIENCE intent → EXPERIENCES', () => {
  it('registers with activeMode EXPERIENCES and availableModes [EXPERIENCES] for BOOK_EXPERIENCE intent', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/register`)
      .send({
        email: 'consumer-bookexp@ce01.owambe',
        password: 'Test1234!',
        firstName: 'Exp',
        lastName: 'Guest',
        role: 'CONSUMER',
        consumerIntent: 'BOOK_EXPERIENCE',
      });
    expect(res.status).toBe(201);

    const user = await prisma.user.findUnique({
      where: { email: 'consumer-bookexp@ce01.owambe' },
      select: { activeMode: true, availableModes: true },
    });
    expect(user?.activeMode).toBe('EXPERIENCES');
    expect(user?.availableModes).toEqual(['EXPERIENCES']);
  });
});

// ─── T4: CONSUMER ATTEND_EVENT → EVENTS ──────────────────────────────────────
describe('OWB-C-CONSUMER-ENTRY-01 T4: CONSUMER ATTEND_EVENT intent → EVENTS', () => {
  it('registers with activeMode EVENTS and availableModes [EVENTS] for ATTEND_EVENT intent', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/register`)
      .send({
        email: 'consumer-attendevent@ce01.owambe',
        password: 'Test1234!',
        firstName: 'Event',
        lastName: 'Attendee',
        role: 'CONSUMER',
        consumerIntent: 'ATTEND_EVENT',
      });
    expect(res.status).toBe(201);

    const user = await prisma.user.findUnique({
      where: { email: 'consumer-attendevent@ce01.owambe' },
      select: { activeMode: true, availableModes: true },
    });
    expect(user?.activeMode).toBe('EVENTS');
    expect(user?.availableModes).toEqual(['EVENTS']);
  });
});

// ─── T5: CONSUMER PLAN_EVENT → EVENTS ────────────────────────────────────────
describe('OWB-C-CONSUMER-ENTRY-01 T5: CONSUMER PLAN_EVENT intent → EVENTS', () => {
  it('registers with activeMode EVENTS and availableModes [EVENTS] for PLAN_EVENT intent', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/register`)
      .send({
        email: 'consumer-planevent@ce01.owambe',
        password: 'Test1234!',
        firstName: 'Plan',
        lastName: 'User',
        role: 'CONSUMER',
        consumerIntent: 'PLAN_EVENT',
      });
    expect(res.status).toBe(201);

    const user = await prisma.user.findUnique({
      where: { email: 'consumer-planevent@ce01.owambe' },
      select: { activeMode: true, availableModes: true },
    });
    expect(user?.activeMode).toBe('EVENTS');
    expect(user?.availableModes).toEqual(['EVENTS']);
  });
});

// ─── T6: Supply roles unaffected by consumerIntent ───────────────────────────
describe('OWB-C-CONSUMER-ENTRY-01 T6: Supply roles unaffected by consumerIntent field', () => {
  it('PLANNER with consumerIntent field still gets EVENTS mode (consumerIntent ignored)', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/register`)
      .send({
        email: 'planner-ce01@ce01.owambe',
        password: 'Test1234!',
        firstName: 'Plan',
        lastName: 'Ner',
        role: 'PLANNER',
        consumerIntent: 'BOOK_STAY', // should be ignored for non-CONSUMER roles
      });
    expect(res.status).toBe(201);

    const user = await prisma.user.findUnique({
      where: { email: 'planner-ce01@ce01.owambe' },
      select: { activeMode: true, availableModes: true, role: true },
    });
    expect(user?.role).toBe('PLANNER');
    // PLANNER falls into the {} branch → Prisma defaults
    expect(user?.activeMode).toBe('EVENTS');
  });

  it('OPERATOR with consumerIntent field still gets EXPERIENCES mode', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/register`)
      .send({
        email: 'operator-ce01@ce01.owambe',
        password: 'Test1234!',
        firstName: 'Op',
        lastName: 'Erator',
        role: 'OPERATOR',
        consumerIntent: 'BOOK_STAY', // should be ignored for non-CONSUMER roles
      });
    expect(res.status).toBe(201);

    const user = await prisma.user.findUnique({
      where: { email: 'operator-ce01@ce01.owambe' },
      select: { activeMode: true, availableModes: true, role: true },
    });
    expect(user?.role).toBe('OPERATOR');
    expect(user?.activeMode).toBe('EXPERIENCES');
    expect(user?.availableModes).toEqual(['EXPERIENCES']);
  });
});
