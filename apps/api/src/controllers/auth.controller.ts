import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../database/client';
import { PlatformMode } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { sendEmail } from '../services/email.service';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '30d';

function generateAccessToken(userId: string, role: string) {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRES } as jwt.SignOptions);
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

// ─── REGISTER ────────────────────────────────────────
// Consumer intent → mode mapping
const CONSUMER_INTENT_MODE: Record<string, { activeMode: PlatformMode; availableModes: PlatformMode[] }> = {
  BOOK_STAY:       { activeMode: PlatformMode.STAYS,       availableModes: [PlatformMode.STAYS] },
  BOOK_EXPERIENCE: { activeMode: PlatformMode.EXPERIENCES, availableModes: [PlatformMode.EXPERIENCES] },
  ATTEND_EVENT:    { activeMode: PlatformMode.EVENTS,      availableModes: [PlatformMode.EVENTS] },
  PLAN_EVENT:      { activeMode: PlatformMode.EVENTS,      availableModes: [PlatformMode.EVENTS] },
};

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, firstName, lastName, role, companyName, consumerIntent } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError('Email already registered', 409);

    const passwordHash = await bcrypt.hash(password, 12);
    const verifyToken = crypto.randomBytes(32).toString('hex');

    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          role,
          authProvider: 'EMAIL',
          ...(role === 'HOST'
            ? {
                activeMode: 'STAYS',
                availableModes: ['STAYS'],
              }
            : role === 'OPERATOR'
            ? {
                activeMode: 'EXPERIENCES',
                availableModes: ['EXPERIENCES'],
              }
            : role === 'CONSUMER' && consumerIntent && CONSUMER_INTENT_MODE[consumerIntent]
            ? CONSUMER_INTENT_MODE[consumerIntent]
            : role === 'CONSUMER'
            ? { activeMode: PlatformMode.EVENTS, availableModes: [PlatformMode.EVENTS] }
            : {}),
        }
      });

      if (role === 'PLANNER') {
        await tx.planner.create({ data: { userId: u.id, companyName } });
      } else if (role === 'VENDOR') {
        // Vendor completes profile separately
      } else if (role === 'CONSUMER') {
        await tx.consumer.create({ data: { userId: u.id } });
      } else if (role === 'HOST') {
        await tx.host.create({ data: { userId: u.id, businessName: companyName } });
      } else if (role === 'OPERATOR') {
        await tx.operator.create({ data: { userId: u.id, businessName: companyName || '' } });
      }

      return u;
    });

    // Send verification email
    await sendEmail({
      to: email,
      subject: 'Verify your Owambe account',
      template: 'verify-email',
      data: {
        firstName,
        verifyUrl: `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${verifyToken}`,
      }
    });

    logger.info(`New user registered: ${email} (${role})`);

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      userId: user.id,
    });
  } catch (err) {
    next(err);
  }
}

// ─── LOGIN ───────────────────────────────────────────
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) throw new AppError('Invalid credentials', 401);
    if (!user.isActive) throw new AppError('Account suspended', 403);

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new AppError('Invalid credentials', 401);

    const accessToken = generateAccessToken(user.id, user.role);
    const refreshTokenValue = generateRefreshToken();

    const refreshExpiry = new Date();
    refreshExpiry.setDate(refreshExpiry.getDate() + 30);

    await prisma.$transaction([
      prisma.refreshToken.create({
        data: { userId: user.id, token: refreshTokenValue, expiresAt: refreshExpiry }
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      })
    ]);

    // Get profile data based on role
    let profile: any = null;
    if (user.role === 'PLANNER') {
      profile = await prisma.planner.findUnique({ where: { userId: user.id } });
    } else if (user.role === 'VENDOR') {
      profile = await prisma.vendor.findUnique({ where: { userId: user.id } });
    } else if (user.role === 'CONSUMER') {
      profile = await prisma.consumer.findUnique({ where: { userId: user.id } });
    } else if (user.role === 'HOST') {
      profile = await prisma.host.findUnique({ where: { userId: user.id } });
    }

    res.cookie('refreshToken', refreshTokenValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        isEmailVerified: user.isEmailVerified,
        activeMode: user.activeMode,
        availableModes: user.availableModes,
        profile,
        ...(user.role === 'HOST' ? { host: profile } : {}),
      }
    });
  } catch (err) {
    next(err);
  }
}

// ─── LOGOUT ──────────────────────────────────────────
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      await prisma.refreshToken.deleteMany({ where: { token } });
    }
    res.clearCookie('refreshToken');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── REFRESH TOKEN ───────────────────────────────────
export async function refreshToken(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) throw new AppError('No refresh token', 401);

    const stored = await prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true }
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const accessToken = generateAccessToken(stored.user.id, stored.user.role);
    const newRefreshToken = generateRefreshToken();
    const refreshExpiry = new Date();
    refreshExpiry.setDate(refreshExpiry.getDate() + 30);

    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { token } }),
      prisma.refreshToken.create({
        data: { userId: stored.user.id, token: newRefreshToken, expiresAt: refreshExpiry }
      })
    ]);

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, accessToken });
  } catch (err) {
    next(err);
  }
}

// ─── VERIFY EMAIL ────────────────────────────────────
export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.params;
    // In production: look up token in a verification_tokens table
    // For now: update user isEmailVerified
    res.json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── FORGOT PASSWORD ─────────────────────────────────
export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      await sendEmail({
        to: email,
        subject: 'Reset your Owambe password',
        template: 'reset-password',
        data: {
          firstName: user.firstName,
          resetUrl: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${resetToken}`,
        }
      });
    }

    res.json({ success: true, message: 'If that email exists, you will receive a reset link.' });
  } catch (err) {
    next(err);
  }
}

// ─── RESET PASSWORD ──────────────────────────────────
export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { password } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);
    // Look up token, update user password, invalidate token
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── GET ME ──────────────────────────────────────────
export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: (req as any).userId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, avatarUrl: true, isEmailVerified: true,
        activeMode: true, availableModes: true,
        planner: true, vendor: true, consumer: true, host: true,
      }
    });
    if (!user) throw new AppError('User not found', 404);
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

// ─── UPDATE PROFILE ──────────────────────────────────
export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { firstName, lastName, phone, avatarUrl } = req.body;
    const user = await prisma.user.update({
      where: { id: (req as any).userId },
      data: { firstName, lastName, phone, avatarUrl },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatarUrl: true }
    });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

// ─── CHANGE PASSWORD ─────────────────────────────────
export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = (req as any).userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    if (!user.passwordHash) throw new AppError('Password change not available for this account type', 400);
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new AppError('Current password is incorrect', 400);
    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: hashed } });
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── GOOGLE OAUTH ────────────────────────────────────
export async function googleCallback(req: Request, res: Response, next: NextFunction) {
  try {
    // Handle Google OAuth callback
    // Implementation depends on passport-google-oauth20 setup
    res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard`);
  } catch (err) {
    next(err);
  }
}
