/**
 * users.controller.ts
 *
 * Handles user self-service operations that are not part of the auth flow:
 *   - PATCH /api/users/me/password  — change own password (all roles)
 */
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../database/client';
import { AppError } from '../utils/AppError';

// ─── Password complexity rules ────────────────────────────────────────────────
// Minimum 12 characters, at least one uppercase, one lowercase, one digit,
// one special character from the allowed set.
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+[\]{};':",.<>?/\\|`~]).{12,}$/;

function validatePasswordComplexity(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  }
  if (!PASSWORD_REGEX.test(password)) {
    return 'Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character.';
  }
  return null; // valid
}

// ─── PATCH /api/users/me/password ────────────────────────────────────────────
/**
 * Change the authenticated user's own password.
 *
 * Request body:
 *   { currentPassword: string, newPassword: string }
 *
 * Responses:
 *   200 { success: true, message: 'Password changed successfully.' }
 *   400 Weak new password
 *   401 Wrong current password
 *   403 OAuth-only account (no passwordHash)
 *   404 User not found
 */
export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).userId as string;
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    // ── Input presence ──────────────────────────────────────────────────────
    if (!currentPassword || !newPassword) {
      throw new AppError('currentPassword and newPassword are required.', 400);
    }

    // ── New password complexity ─────────────────────────────────────────────
    const complexityError = validatePasswordComplexity(newPassword);
    if (complexityError) {
      throw new AppError(complexityError, 400);
    }

    // ── Prevent reuse of same password ──────────────────────────────────────
    if (currentPassword === newPassword) {
      throw new AppError('New password must differ from the current password.', 400);
    }

    // ── Fetch user ──────────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, passwordHash: true, authProvider: true },
    });

    if (!user) {
      throw new AppError('User not found.', 404);
    }

    // ── OAuth-only accounts have no passwordHash ────────────────────────────
    if (!user.passwordHash) {
      throw new AppError(
        'Your account uses social sign-in. Password change is not available for OAuth accounts.',
        403
      );
    }

    // ── Verify current password ─────────────────────────────────────────────
    const currentValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentValid) {
      throw new AppError('Current password is incorrect.', 401);
    }

    // ── Hash and persist new password ───────────────────────────────────────
    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, updatedAt: new Date() },
    });

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    next(err);
  }
}
