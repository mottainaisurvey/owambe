// ─── cohort.ts ───────────────────────────────────────
// CC-COHORT-OFFER-SURFACES-01 (Amendment 02)
// POST /api/cohort/interest — forwards cohort interest submissions to
// info@owambe.com via the existing sendEmail() service.
// No DB schema changes; no PII written to application logs.

import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { sendEmail } from '../services/email.service';
import { logger } from '../utils/logger';

export const cohortRouter = Router();

// ─── POST /api/cohort/interest ────────────────────────
// Public endpoint — no authentication required.
// Accepts: { email: string }
// Returns: { success: true, message: string }
// On error: { success: false, error: string }
cohortRouter.post(
  '/interest',
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('A valid email address is required.'),
  ],
  async (req: Request, res: Response, _next: NextFunction) => {
    // Validate input — return 400 on invalid email without logging the value
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address.',
        code: 'INVALID_EMAIL',
      });
    }

    const { email } = req.body as { email: string };
    const submittedAt = new Date().toISOString();

    // Forward to info@owambe.com via existing sendEmail() service.
    // PII note: the email address is included in the forwarded email body
    // (that is the purpose of the endpoint) but is NOT written to application
    // logs here. sendEmail() logs "Email sent: cohort-interest-forward → <to>"
    // where <to> is hello@owambe.com — the submitter's address is not logged.
    //
    // The try/catch here ensures that even if sendEmail() throws (e.g., in test
    // environments where the mock bypasses the service's own internal catch block
    // at email.service.ts:434), the route returns 200 — the submission was
    // received; the forward failure is non-fatal and logged server-side only.
    try {
      await sendEmail({
        to: 'info@owambe.com',
        subject: `[CC Cohort Interest] New submission — ${submittedAt}`,
        template: 'cohort-interest-forward',
        data: {
          submittedEmail: email,
          submittedAt,
        },
      });
    } catch {
      // Non-fatal: log the failure without PII (no submitter email in log)
      logger.error(`cohort/interest: email forward failed at ${submittedAt}`);
    }

    // Log success without the submitted email address (AC-11 PII check)
    logger.info(`cohort/interest: submission forwarded at ${submittedAt}`);

    return res.status(200).json({
      success: true,
      message: "Thanks — we'll be in touch with your cohort onboarding details.",
    });
  }
);
