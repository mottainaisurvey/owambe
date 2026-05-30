// ─── cohort.ts ───────────────────────────────────────
// OWAMBE-INTEREST-CAPTURE-HARDENING-01
// POST /api/cohort/interest — v2 lead infrastructure
// Operational model: "DB is persistence; email is notification"
//
// Five-step flow:
//   1. Validate email + source
//   2. Write to cohort_interest_submissions (primary persistence)
//   3. Forward email to info@owambe.com (operational notification)
//   4. Acknowledgement email to submitter (non-blocking)
//   5. Return 200

import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { sendEmail } from '../services/email.service';
import { prisma } from '../database/client';
import { rateLimiter } from '../middleware/rateLimiter';
import { logger } from '../utils/logger';

export const cohortRouter = Router();

// ─── Source whitelist ─────────────────────────────────
const VALID_SOURCES = ['owambe-homepage', 'owambe-cohort-page', 'cc-for-operators'] as const;
type ValidSource = typeof VALID_SOURCES[number];

function normaliseSource(raw: unknown): string {
  if (typeof raw === 'string' && (VALID_SOURCES as readonly string[]).includes(raw)) {
    return raw;
  }
  return 'unknown';
}

// ─── Per-endpoint rate limit: 5 req/min per IP ───────
const cohortInterestLimiter = rateLimiter({ windowMs: 60_000, max: 5 });

// ─── POST /api/cohort/interest ────────────────────────
// Public endpoint — no authentication required.
// Accepts: { email: string, source?: string }
// Returns: { success: true, message: string }
// On validation error: 400
// On rate limit: 429
// On DB failure: 500
cohortRouter.post(
  '/interest',
  cohortInterestLimiter,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('A valid email address is required.'),
  ],
  async (req: Request, res: Response, _next: NextFunction) => {
    // ── Step 1: Validate ─────────────────────────────
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address.',
        code: 'INVALID_EMAIL',
      });
    }

    const { email, source: rawSource } = req.body as { email: string; source?: unknown };
    const source = normaliseSource(rawSource);
    const submittedAt = new Date().toISOString();

    // Capture IP + User-Agent for abuse detection (not written to app logs)
    const ipAddress = (
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      null
    );
    const userAgent = (req.headers['user-agent'] || null) as string | null;

    // ── Step 2: DB write (primary persistence) ───────
    let submissionId: string;
    try {
      const row = await prisma.cohortInterestSubmission.create({
        data: {
          email,
          source,
          ipAddress,
          userAgent,
          // status flags set after email dispatch attempts below
        },
      });
      submissionId = row.id;
      logger.info(`cohort/interest: DB row created id=${submissionId} source=${source}`);
    } catch (dbErr: any) {
      // DB write failure is a substantive failure — return 500
      logger.error(`cohort/interest: DB write failed at ${submittedAt}`, dbErr?.message || dbErr);
      return res.status(500).json({
        success: false,
        error: 'Something went wrong — please try again in a moment.',
        code: 'DB_WRITE_FAILED',
      });
    }

    // ── Step 3: Forward email to info@owambe.com ─────
    let emailForwardStatus: 'sent' | 'failed' = 'sent';
    try {
      await sendEmail({
        to: 'info@owambe.com',
        subject: `[CC Cohort Interest] New submission — ${submittedAt}`,
        template: 'cohort-interest-forward',
        data: {
          submittedEmail: email,
          submittedAt,
          source,
        },
      });
    } catch {
      emailForwardStatus = 'failed';
      logger.error(`cohort/interest: email forward failed id=${submissionId}`);
    }

    // ── Step 4: Acknowledgement email to submitter ───
    let ackEmailStatus: 'sent' | 'failed' = 'sent';
    try {
      await sendEmail({
        to: email,
        subject: "You're on the Owambe list — we'll be in touch",
        template: 'cohort-interest-ack',
        data: {},
      });
    } catch {
      ackEmailStatus = 'failed';
      logger.error(`cohort/interest: ack email failed id=${submissionId}`);
    }

    // ── Update DB row with email status flags ────────
    try {
      await prisma.cohortInterestSubmission.update({
        where: { id: submissionId },
        data: { emailForwardStatus, ackEmailStatus },
      });
    } catch (updateErr: any) {
      // Non-fatal: row exists, status flags just not set
      logger.error(`cohort/interest: status flag update failed id=${submissionId}`, updateErr?.message);
    }

    logger.info(`cohort/interest: complete id=${submissionId} forward=${emailForwardStatus} ack=${ackEmailStatus}`);

    // ── Step 5: Return 200 ───────────────────────────
    return res.status(200).json({
      success: true,
      message: "Thanks — we'll be in touch with your cohort onboarding details.",
    });
  }
);
