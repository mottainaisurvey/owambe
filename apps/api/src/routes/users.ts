/**
 * users.ts — /api/users routes
 *
 * Self-service user operations available to all authenticated roles.
 */
import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { changePassword } from '../controllers/users.controller';

export const usersRouter = Router();

// ─── PATCH /api/users/me/password ────────────────────────────────────────────
// Change own password. Available to ADMIN, PLANNER, VENDOR, HOST, OPERATOR,
// CONSUMER roles — any authenticated user.
usersRouter.patch(
  '/me/password',
  authenticate,
  [
    body('currentPassword')
      .notEmpty()
      .withMessage('currentPassword is required.'),
    body('newPassword')
      .isLength({ min: 12 })
      .withMessage('newPassword must be at least 12 characters.')
      .matches(/[A-Z]/)
      .withMessage('newPassword must contain at least one uppercase letter.')
      .matches(/[a-z]/)
      .withMessage('newPassword must contain at least one lowercase letter.')
      .matches(/\d/)
      .withMessage('newPassword must contain at least one digit.')
      .matches(/[!@#$%^&*()\-_=+[\]{};':",.<>?/\\|`~]/)
      .withMessage('newPassword must contain at least one special character.'),
  ],
  validate,
  changePassword
);
