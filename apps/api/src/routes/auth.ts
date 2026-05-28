import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import {
  register,
  login,
  logout,
  refreshToken,
  verifyEmail,
  forgotPassword,
  resetPassword,
  getMe,
  updateProfile,
  changePassword,
  googleCallback,
} from '../controllers/auth.controller';

export const authRouter = Router();

// ─── REGISTER ────────────────────────────────────────
authRouter.post('/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty(),
    body('role').isIn(['PLANNER', 'VENDOR', 'CONSUMER']),
  ],
  validate,
  register
);

// ─── LOGIN ───────────────────────────────────────────
authRouter.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  validate,
  login
);

// ─── LOGOUT ──────────────────────────────────────────
authRouter.post('/logout', authenticate, logout);

// ─── REFRESH TOKEN ───────────────────────────────────
authRouter.post('/refresh', refreshToken);

// ─── EMAIL VERIFICATION ──────────────────────────────
authRouter.get('/verify-email/:token', verifyEmail);

// ─── PASSWORD RESET ──────────────────────────────────
authRouter.post('/forgot-password',
  [body('email').isEmail().normalizeEmail()],
  validate,
  forgotPassword
);

authRouter.post('/reset-password/:token',
  [body('password').isLength({ min: 8 })],
  validate,
  resetPassword
);

// ─── PROFILE ─────────────────────────────────────────
authRouter.get('/me', authenticate, getMe);
authRouter.put('/me', authenticate, updateProfile);

authRouter.post('/change-password',
  authenticate,
  [body('currentPassword').notEmpty(), body('newPassword').isLength({ min: 8 })],
  validate,
  changePassword
);

// ─── OAUTH ───────────────────────────────────────────
authRouter.get('/google/callback', googleCallback);
