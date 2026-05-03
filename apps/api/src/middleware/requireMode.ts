// ─── requireMode.ts ──────────────────────────────────
// Middleware to gate API routes by platform mode.
// Must be used AFTER authenticate middleware.
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database/client';
import { AppError } from '../utils/AppError';

export type PlatformMode = 'EVENTS' | 'STAYS' | 'EXPERIENCES';

/**
 * Require that the authenticated user has access to the specified mode.
 * Checks the user's availableModes array in the database.
 */
export function requireMode(...modes: PlatformMode[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const userId = (req as any).userId;
    if (!userId) {
      return next(new AppError('Authentication required', 401));
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { availableModes: true, activeMode: true }
      });

      if (!user) {
        return next(new AppError('User not found', 404));
      }

      const hasAccess = modes.some(mode => user.availableModes.includes(mode as any));
      if (!hasAccess) {
        return next(new AppError(
          `This feature requires access to: ${modes.join(' or ')} mode. Contact support to unlock.`,
          403
        ));
      }

      // Attach mode info to request for downstream use
      (req as any).userActiveMode = user.activeMode;
      (req as any).userAvailableModes = user.availableModes;

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Lightweight mode check using the JWT payload (no DB query).
 * Use this when you only need to check the active mode, not available modes.
 * The active mode must be included in the JWT payload.
 */
export function requireActiveMode(...modes: PlatformMode[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const activeMode = (req as any).userActiveMode as PlatformMode | undefined;
    if (!activeMode || !modes.includes(activeMode)) {
      return next(new AppError(
        `This endpoint requires active mode: ${modes.join(' or ')}`,
        403
      ));
    }
    next();
  };
}
