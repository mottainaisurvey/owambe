/**
 * change-password.test.ts
 *
 * Integration tests for PATCH /api/users/me/password
 *
 * Covers:
 *   1. Valid rotation — correct current password, strong new password → 200
 *   2. Wrong current password → 401
 *   3. Weak new password (too short) → 422
 *   4. Weak new password (missing uppercase) → 422
 *   5. Weak new password (missing digit) → 422
 *   6. Weak new password (missing special char) → 422
 *   7. New password same as current → 400
 *   8. Missing currentPassword field → 422
 *   9. Missing newPassword field → 422
 *  10. Unauthenticated request → 401
 *  11. Success: hash in DB is updated after rotation
 */

import request from 'supertest';
import { app } from '../app';
import { prisma } from '../database/client';
import bcrypt from 'bcryptjs';

// ── Test user state ────────────────────────────────────────────────────────────
const TEST_EMAIL = 'changepwd@test.owambe';
const INITIAL_PASSWORD = 'InitialPass1!abc';   // 16 chars, meets all rules
const NEW_STRONG_PASSWORD = 'NewStr0ng!Pass#2'; // 16 chars, meets all rules
const WEAK_SHORT = 'Short1!';                   // < 12 chars
const WEAK_NO_UPPER = 'weaknouppernumber1!';    // no uppercase
const WEAK_NO_DIGIT = 'NoDigitPass!abc';        // no digit
const WEAK_NO_SPECIAL = 'NoSpecialPass12';      // no special char

let accessToken: string;
let userId: string;

// ── Setup ──────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // Remove any leftover test user
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });

  // Create test user directly with known hash
  const passwordHash = await bcrypt.hash(INITIAL_PASSWORD, 12);
  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      passwordHash,
      firstName: 'ChangePwd',
      lastName: 'Test',
      role: 'PLANNER',
      isEmailVerified: true,
    },
  });
  userId = user.id;

  // Login to get access token
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_EMAIL, password: INITIAL_PASSWORD });

  expect(res.status).toBe(200);
  accessToken = res.body.accessToken;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('PATCH /api/users/me/password', () => {

  it('10. rejects unauthenticated request with 401', async () => {
    const res = await request(app)
      .patch('/api/users/me/password')
      .send({ currentPassword: INITIAL_PASSWORD, newPassword: NEW_STRONG_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('8. rejects missing currentPassword with 422', async () => {
    const res = await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ newPassword: NEW_STRONG_PASSWORD });
    expect(res.status).toBe(422);
  });

  it('9. rejects missing newPassword with 422', async () => {
    const res = await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: INITIAL_PASSWORD });
    expect(res.status).toBe(422);
  });

  it('3. rejects weak new password (too short) with 422', async () => {
    const res = await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: INITIAL_PASSWORD, newPassword: WEAK_SHORT });
    expect(res.status).toBe(422);
  });

  it('4. rejects weak new password (no uppercase) with 422', async () => {
    const res = await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: INITIAL_PASSWORD, newPassword: WEAK_NO_UPPER });
    expect(res.status).toBe(422);
  });

  it('5. rejects weak new password (no digit) with 422', async () => {
    const res = await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: INITIAL_PASSWORD, newPassword: WEAK_NO_DIGIT });
    expect(res.status).toBe(422);
  });

  it('6. rejects weak new password (no special char) with 422', async () => {
    const res = await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: INITIAL_PASSWORD, newPassword: WEAK_NO_SPECIAL });
    expect(res.status).toBe(422);
  });

  it('2. rejects wrong current password with 401', async () => {
    const res = await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'WrongPassword1!x', newPassword: NEW_STRONG_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('7. rejects new password same as current with 400', async () => {
    const res = await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: INITIAL_PASSWORD, newPassword: INITIAL_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('1. accepts valid rotation and returns 200', async () => {
    const res = await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: INITIAL_PASSWORD, newPassword: NEW_STRONG_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/changed/i);
  });

  it('11. DB passwordHash is updated after successful rotation', async () => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    expect(user?.passwordHash).toBeDefined();
    // New hash should validate against NEW_STRONG_PASSWORD
    const valid = await bcrypt.compare(NEW_STRONG_PASSWORD, user!.passwordHash!);
    expect(valid).toBe(true);
    // And should NOT validate against the old password
    const oldValid = await bcrypt.compare(INITIAL_PASSWORD, user!.passwordHash!);
    expect(oldValid).toBe(false);
  });

  it('can login with the new password after rotation', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: NEW_STRONG_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('cannot login with the old password after rotation', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: INITIAL_PASSWORD });
    expect(res.status).toBe(401);
  });
});
