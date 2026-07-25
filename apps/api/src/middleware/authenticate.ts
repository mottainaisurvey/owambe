// ─── authenticate.ts ─────────────────────────────────
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', 401));
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
    (req as any).userId = payload.userId;
    (req as any).userRole = payload.role;
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
}

// ─── authenticateOptional ────────────────────────────
// For routes that accept both authenticated and guest (unauthenticated) callers.
// - No Authorization header → req.userId = undefined, req.userRole = undefined, proceed.
// - Valid Bearer token → req.userId and req.userRole set, proceed.
// - Invalid/expired Bearer token → 401 (caller presented a token but it was bad).
export function authenticateOptional(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    // No token — guest path
    return next();
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as any;
    (req as any).userId = payload.userId;
    (req as any).userRole = payload.role;
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
}
