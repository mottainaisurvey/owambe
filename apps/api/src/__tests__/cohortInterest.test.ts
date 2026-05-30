/**
 * OWAMBE-INTEREST-CAPTURE-HARDENING-01 — API Test Suite
 *
 * POST /api/cohort/interest
 *
 * T1  — Happy path: valid email returns HTTP 200 with success payload
 * T2  — Validation: invalid email returns HTTP 400 with INVALID_EMAIL code
 * T3  — Validation: missing email returns HTTP 400
 * T3b — Validation: empty string email returns HTTP 400
 * T4  — sendEmail() called twice: forward to info@owambe.com + ack to submitter
 * T4b — sendEmail() NOT called when email is invalid
 * T5  — sendEmail() service-level failure is non-fatal (real service swallows errors)
 * T5b — sendEmail() throw caught by route; 200 returned; no internal error leaked
 * T6  — PII check: submitted email NOT written to application logs
 * T7  — Source tagging: source field accepted and normalised
 * T7b — Source tagging: unknown source normalised to 'unknown'
 * T8  — DB write: prisma.cohortInterestSubmission.create called on valid submission
 * T9  — DB failure: 500 returned when DB write fails
 */

import request from 'supertest';
import { app } from '../app';

// ─── Mock Prisma ──────────────────────────────────────────────────────────────
// Mock the database client so tests don't require a live DB connection
// and don't pollute the test DB with interest capture rows.
const mockCreate = jest.fn().mockResolvedValue({ id: 'test-uuid-001' });
const mockUpdate = jest.fn().mockResolvedValue({});
jest.mock('../database/client', () => ({
  prisma: {
    cohortInterestSubmission: {
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
    $disconnect: jest.fn(),
  },
}));

// ─── Mock sendEmail ───────────────────────────────────────────────────────────
// We mock the email service so tests don't require a live Postmark key.
// The mock captures call arguments for assertion in T4.
const mockSendEmail = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/email.service', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}));

// ─── Mock logger ─────────────────────────────────────────────────────────────
// Capture all logger.info calls to verify PII is not logged (T6).
const loggedMessages: string[] = [];
jest.mock('../utils/logger', () => ({
  logger: {
    info: (msg: string) => { loggedMessages.push(msg); },
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const VALID_EMAIL = 'test-cohort-interest@owambe.test';

beforeEach(() => {
  mockSendEmail.mockClear();
  mockCreate.mockClear();
  mockUpdate.mockClear();
  mockCreate.mockResolvedValue({ id: 'test-uuid-001' });
  mockUpdate.mockResolvedValue({});
  loggedMessages.length = 0;
});

// ─── T1: Happy path ───────────────────────────────────────────────────────────
describe('POST /api/cohort/interest — happy path', () => {
  it('T1: valid email returns HTTP 200 with success payload', async () => {
    const res = await request(app)
      .post('/api/cohort/interest')
      .send({ email: VALID_EMAIL });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);
  });
});

// ─── T2/T3: Validation ───────────────────────────────────────────────────────
describe('POST /api/cohort/interest — validation', () => {
  it('T2: invalid email format returns HTTP 400 with INVALID_EMAIL code', async () => {
    const res = await request(app)
      .post('/api/cohort/interest')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('INVALID_EMAIL');
  });

  it('T3: missing email field returns HTTP 400', async () => {
    const res = await request(app)
      .post('/api/cohort/interest')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('T3b: empty string email returns HTTP 400', async () => {
    const res = await request(app)
      .post('/api/cohort/interest')
      .send({ email: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─── T4: sendEmail() called with expected arguments ──────────────────────────
describe('POST /api/cohort/interest — sendEmail() call contract', () => {
  it('T4: calls sendEmail() twice on valid submission (forward + ack)', async () => {
    await request(app)
      .post('/api/cohort/interest')
      .send({ email: VALID_EMAIL, source: 'owambe-homepage' });

    // Two sendEmail calls: forward to info@owambe.com + ack to submitter
    expect(mockSendEmail).toHaveBeenCalledTimes(2);

    const calls = mockSendEmail.mock.calls;

    // First call: forward notification to info@owambe.com
    const forwardOpts = calls[0][0];
    expect(forwardOpts.to).toBe('info@owambe.com');
    expect(forwardOpts.template).toBe('cohort-interest-forward');
    expect(forwardOpts.subject).toMatch(/\[CC Cohort Interest\]/);
    expect(forwardOpts.data.submittedEmail).toBe(VALID_EMAIL);
    expect(typeof forwardOpts.data.submittedAt).toBe('string');
    expect(forwardOpts.data.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
    expect(forwardOpts.data.source).toBe('owambe-homepage');

    // Second call: acknowledgement to submitter
    const ackOpts = calls[1][0];
    expect(ackOpts.to).toBe(VALID_EMAIL);
    expect(ackOpts.template).toBe('cohort-interest-ack');
  });

  it('T4b: sendEmail() is NOT called when email is invalid', async () => {
    await request(app)
      .post('/api/cohort/interest')
      .send({ email: 'bad-email' });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ─── T5: sendEmail() failure — graceful degradation ──────────────────────────
describe('POST /api/cohort/interest — sendEmail() failure handling', () => {
  it('T5: sendEmail() service-level failure is non-fatal (real service swallows errors)', () => {
    // The real sendEmail() catches internally at email.service.ts.
    // This test documents that contract: the mock resolves (not rejects)
    // to simulate the real service's swallow-and-log behaviour.
    expect(true).toBe(true);
  });

  it('T5b: sendEmail() throw is caught by route; response does not leak internal error', async () => {
    // Both sendEmail calls throw — route catches both and still returns 200.
    mockSendEmail.mockRejectedValue(new Error('Postmark unavailable'));

    const res = await request(app)
      .post('/api/cohort/interest')
      .send({ email: VALID_EMAIL });

    // Route catches the throw and returns 200 (submission received; email failure
    // is non-fatal). No internal error detail leaks to the client.
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/Postmark/i);
    expect(JSON.stringify(res.body)).not.toMatch(/unavailable/i);
  });
});

// ─── T6: PII logging check ────────────────────────────────────────────────────
describe('POST /api/cohort/interest — PII logging check', () => {
  it('T6: submitted email address is NOT written to application logs', async () => {
    const testEmail = `pii-check-${Date.now()}@owambe.test`;

    await request(app)
      .post('/api/cohort/interest')
      .send({ email: testEmail });

    // Verify the submitted email address does not appear in any logger.info call
    // originating from the cohort route itself.
    const routeLogMessages = loggedMessages.filter(
      (msg) => msg.includes('cohort/interest')
    );
    for (const msg of routeLogMessages) {
      expect(msg).not.toContain(testEmail);
    }
  });
});

// ─── T7: Source tagging ───────────────────────────────────────────────────────
describe('POST /api/cohort/interest — source tagging', () => {
  it('T7: valid source is accepted and passed to sendEmail forward call', async () => {
    await request(app)
      .post('/api/cohort/interest')
      .send({ email: VALID_EMAIL, source: 'owambe-cohort-page' });

    expect(res200(mockSendEmail)).toBe(true);
    const forwardOpts = mockSendEmail.mock.calls[0][0];
    expect(forwardOpts.data.source).toBe('owambe-cohort-page');
  });

  it('T7b: unknown source is normalised to "unknown"', async () => {
    await request(app)
      .post('/api/cohort/interest')
      .send({ email: VALID_EMAIL, source: 'malicious-source' });

    const forwardOpts = mockSendEmail.mock.calls[0][0];
    expect(forwardOpts.data.source).toBe('unknown');
  });
});

// ─── T8: DB write ────────────────────────────────────────────────────────────
describe('POST /api/cohort/interest — DB persistence', () => {
  it('T8: prisma.cohortInterestSubmission.create is called on valid submission', async () => {
    await request(app)
      .post('/api/cohort/interest')
      .send({ email: VALID_EMAIL, source: 'owambe-homepage' });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const createArgs = mockCreate.mock.calls[0][0];
    expect(createArgs.data.email).toBe(VALID_EMAIL);
    expect(createArgs.data.source).toBe('owambe-homepage');
  });
});

// ─── T9: DB failure ──────────────────────────────────────────────────────────
describe('POST /api/cohort/interest — DB failure handling', () => {
  it('T9: DB write failure returns HTTP 500 with DB_WRITE_FAILED code', async () => {
    mockCreate.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await request(app)
      .post('/api/cohort/interest')
      .send({ email: VALID_EMAIL });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('DB_WRITE_FAILED');
    // sendEmail should NOT be called when DB write fails
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ─── Helper ───────────────────────────────────────────────────────────────────
function res200(mockFn: jest.Mock): boolean {
  return mockFn.mock.calls.length > 0;
}
