/**
 * ONE-TIME admin password reset endpoint.
 * DELETE THIS FILE after the fix has been applied.
 *
 * Protected by a secret token passed as a query parameter.
 * Resets admin@owambe.com password hash to bcrypt('Admin@Owambe2026!', 12).
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';

export const adminResetRouter = Router();

// One-time secret — hardcoded here, used once, endpoint deleted after.
const RESET_SECRET = 'owambe-admin-reset-2026-05-27-x9k2m';

adminResetRouter.post('/admin-password-reset', async (req, res, next) => {
  try {
    const { secret } = req.query;

    if (secret !== RESET_SECRET) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const newHash = await bcrypt.hash('Admin@Owambe2026!', 12);

    const result = await prisma.user.updateMany({
      where: { email: 'admin@owambe.com', role: 'ADMIN' },
      data: {
        passwordHash: newHash,
        isEmailVerified: true,
        isActive: true,
      },
    });

    if (result.count === 0) {
      // Admin user does not exist — create it
      await prisma.user.create({
        data: {
          email: 'admin@owambe.com',
          passwordHash: newHash,
          firstName: 'Owambe',
          lastName: 'Admin',
          role: 'ADMIN',
          isEmailVerified: true,
          isActive: true,
        },
      });
      logger.info('ONE-TIME admin reset: admin user created');
      res.json({ success: true, action: 'created', email: 'admin@owambe.com' });
    } else {
      logger.info(`ONE-TIME admin reset: updated ${result.count} admin user(s)`);
      res.json({ success: true, action: 'updated', count: result.count, email: 'admin@owambe.com' });
    }
  } catch (err) {
    next(err);
  }
});
