// ─── mode.ts ─────────────────────────────────────────
// Routes for platform mode management:
//   GET  /api/mode          — get current user's mode state
//   POST /api/mode/switch   — switch active mode
//   POST /api/mode/unlock   — unlock a mode via cohort code
import { Router, Request, Response, NextFunction } from 'express';
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

    if (!cohort) throw new AppError('Invalid cohort code', 404);
    if (!cohort.isActive) throw new AppError('This cohort code is no longer active', 410);
    if (cohort.expiresAt && cohort.expiresAt < new Date()) {
      throw new AppError('This cohort code has expired', 410);
    }
    if (cohort.maxRedemptions !== null && cohort.redemptionCount >= cohort.maxRedemptions) {
      throw new AppError('This cohort code has reached its maximum redemptions', 410);
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

    // Update user and increment redemption count in a transaction
    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          availableModes: { set: mergedModes as any[] },
          cohortCode: cohort.code,
        },
        select: { activeMode: true, availableModes: true, cohortCode: true }
      }),
      prisma.cohortCode.update({
        where: { id: cohort.id },
        data: { redemptionCount: { increment: 1 } }
      })
    ]);

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
