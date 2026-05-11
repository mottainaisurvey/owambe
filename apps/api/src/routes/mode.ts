// ─── mode.ts ─────────────────────────────────────────
// Routes for platform mode management:
//   GET  /api/mode          — get current user's mode state
//   POST /api/mode/switch   — switch active mode
//   POST /api/mode/unlock   — unlock a mode via cohort code
import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

const router = Router();

// All mode routes require authentication
router.use(authenticate);

// ─── GET /api/mode ───────────────────────────────────
// Returns the user's current activeMode and availableModes
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        activeMode: true,
        availableModes: true,
        cohortCode: true,
      }
    });

    if (!user) throw new AppError('User not found', 404);

    res.json({
      success: true,
      activeMode: user.activeMode,
      availableModes: user.availableModes,
      cohortCode: user.cohortCode,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/mode/switch ───────────────────────────
// Switch the user's active mode. Must be in availableModes.
router.post('/switch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { mode } = req.body;

    const validModes = ['EVENTS', 'STAYS', 'EXPERIENCES'];
    if (!mode || !validModes.includes(mode)) {
      throw new AppError(`Invalid mode. Must be one of: ${validModes.join(', ')}`, 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { availableModes: true }
    });

    if (!user) throw new AppError('User not found', 404);

    if (!user.availableModes.includes(mode as any)) {
      throw new AppError(
        `Mode '${mode}' is not available on your account. Use a cohort code to unlock it.`,
        403
      );
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { activeMode: mode as any },
      select: { activeMode: true, availableModes: true }
    });

    logger.info(`User ${userId} switched to mode: ${mode}`);

    res.json({
      success: true,
      activeMode: updated.activeMode,
      availableModes: updated.availableModes,
      message: `Switched to ${mode} mode`,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/mode/unlock ───────────────────────────
// Unlock one or more modes using a cohort code.
router.post('/unlock', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
      throw new AppError('Cohort code is required', 400);
    }

    const cohort = await prisma.cohortCode.findUnique({
      where: { code: code.trim().toUpperCase() }
    });

    // OWB-REM-01: disambiguated error responses for each failure mode.
    // COHORT_CODE_INVALID  — code never existed in the database (404)
    // COHORT_CODE_INACTIVE — code was admin-deactivated (410 Gone)
    // COHORT_CODE_EXPIRED  — code passed its expiry date (410 Gone)
    // COHORT_CODE_EXHAUSTED — code reached its redemption cap (409 Conflict)
    if (!cohort) throw new AppError('Invalid cohort code', 404, 'COHORT_CODE_INVALID');
    if (!cohort.isActive) throw new AppError('This cohort code is no longer active', 410, 'COHORT_CODE_INACTIVE');
    if (cohort.expiresAt && cohort.expiresAt < new Date()) {
      throw new AppError('This cohort code has expired', 410, 'COHORT_CODE_EXPIRED');
    }
    if (cohort.maxRedemptions !== null && cohort.redemptionCount >= cohort.maxRedemptions) {
      // 409 Conflict distinguishes "already used / exhausted" from "expired / inactive" (410 Gone)
      throw new AppError('This cohort code has already been used the maximum number of times', 409, 'COHORT_CODE_EXHAUSTED');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { availableModes: true, cohortCode: true }
    });

    if (!user) throw new AppError('User not found', 404);

    // Merge existing modes with cohort modes (deduplicate)
    const existingModes = user.availableModes as string[];
    const newModes = cohort.modes as string[];
    const mergedModes = Array.from(new Set([...existingModes, ...newModes]));

    // OWB-REM-02: Atomic check-and-increment using an interactive transaction.
    // The conditional UPDATE on cohort_codes only succeeds when
    // redemptionCount < maxRedemptions (or maxRedemptions IS NULL).
    // This closes the TOCTOU race window that existed when the check and
    // increment were separate operations.
    let updatedUser: { activeMode: any; availableModes: any; cohortCode: string | null };

    try {
      updatedUser = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Atomic conditional increment: only increments if the cap has not been reached.
        // Returns the updated row; throws P2025 (record not found) if the WHERE clause
        // eliminates the row — i.e., if a concurrent request already consumed the last slot.
        await tx.$executeRaw`
          UPDATE cohort_codes
          SET    redemption_count = redemption_count + 1,
                 updated_at       = NOW()
          WHERE  id               = ${cohort.id}::uuid
            AND  (max_redemptions IS NULL OR redemption_count < max_redemptions)
        `;

        // Verify the increment actually happened (rowsAffected = 0 means the slot was
        // taken by a concurrent request between our earlier read and this transaction).
        const fresh = await tx.cohortCode.findUnique({
          where: { id: cohort.id },
          select: { redemptionCount: true, maxRedemptions: true }
        });
        if (
          fresh &&
          fresh.maxRedemptions !== null &&
          fresh.redemptionCount > fresh.maxRedemptions
        ) {
          // Rollback by throwing — Prisma will abort the transaction.
          throw new AppError(
            'This cohort code has already been used the maximum number of times',
            409,
            'COHORT_CODE_EXHAUSTED'
          );
        }

        // Update the user's modes and cohort code reference.
        return tx.user.update({
          where: { id: userId },
          data: {
            availableModes: { set: mergedModes as any[] },
            cohortCode: cohort.code,
          },
          select: { activeMode: true, availableModes: true, cohortCode: true }
        });
      });
    } catch (txErr: any) {
      // Re-throw AppErrors (e.g. COHORT_CODE_EXHAUSTED from inside the transaction)
      // so the outer catch passes them to the error handler.
      if (txErr instanceof AppError) throw txErr;
      throw txErr;
    }

    const unlockedModes = newModes.filter(m => !existingModes.includes(m));

    logger.info(`User ${userId} unlocked modes via cohort code ${cohort.code}: ${unlockedModes.join(', ')}`);

    res.json({
      success: true,
      message: unlockedModes.length > 0
        ? `Unlocked: ${unlockedModes.join(', ')} mode${unlockedModes.length > 1 ? 's' : ''}`
        : 'All modes in this cohort were already unlocked',
      unlockedModes,
      availableModes: updatedUser.availableModes,
      activeMode: updatedUser.activeMode,
      cohortCode: updatedUser.cohortCode,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
