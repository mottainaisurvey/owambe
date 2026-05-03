import { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { body, param } from 'express-validator';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { AppError } from '../utils/AppError';

export const promosRouter = Router();
promosRouter.use(authenticate);

// ─── LIST promo codes for an event ───────────────────
promosRouter.get('/event/:eventId', requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const promoCodes = await prisma.promoCode.findMany({
      where: { eventId: req.params.eventId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, promoCodes });
  } catch (err) { next(err); }
});

// ─── CREATE promo code ────────────────────────────────
promosRouter.post('/event/:eventId',
  requireRole('PLANNER'),
  [
    body('code').trim().notEmpty().toUpperCase().isLength({ max: 20 }),
    body('discountType').isIn(['PERCENTAGE', 'FIXED', 'FREE']),
    body('discountValue').optional().isNumeric(),
    body('maxUses').optional().isInt({ min: 1 }),
    body('expiresAt').optional().isISO8601(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.promoCode.findFirst({
        where: { code: req.body.code.toUpperCase(), eventId: req.params.eventId },
      });
      if (existing) throw new AppError('Promo code already exists for this event', 409);

      const promo = await prisma.promoCode.create({
        data: {
          eventId: req.params.eventId,
          code: req.body.code.toUpperCase(),
          discountType: req.body.discountType,
          discountValue: req.body.discountValue ? parseFloat(req.body.discountValue) : 0,
          maxUses: req.body.maxUses ? parseInt(req.body.maxUses) : null,
          expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
        },
      });
      res.status(201).json({ success: true, promo });
    } catch (err) { next(err); }
  }
);

// ─── VALIDATE a promo code (public — called during checkout) ───
promosRouter.post('/validate', [
  body('code').trim().notEmpty(),
  body('eventId').isUUID(),
], validate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, eventId } = req.body;
    const promo = await prisma.promoCode.findFirst({
      where: {
        code: code.toUpperCase(),
        eventId,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (!promo) throw new AppError('Invalid or expired promo code', 404);
    if (promo.maxUses && promo.usedCount >= promo.maxUses) {
      throw new AppError('This promo code has reached its maximum uses', 400);
    }

    // Calculate discount
    let discountAmount = 0;
    if (req.body.ticketPrice) {
      const price = parseFloat(req.body.ticketPrice);
      if (promo.discountType === 'PERCENTAGE') {
        discountAmount = (price * parseFloat(promo.discountValue.toString())) / 100;
      } else if (promo.discountType === 'FIXED') {
        discountAmount = Math.min(parseFloat(promo.discountValue.toString()), price);
      } else if (promo.discountType === 'FREE') {
        discountAmount = price;
      }
    }

    res.json({
      success: true,
      valid: true,
      promo: {
        id: promo.id,
        code: promo.code,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        discountAmount,
      },
    });
  } catch (err) { next(err); }
});

// ─── DELETE / deactivate ──────────────────────────────
promosRouter.delete('/:id', requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.promoCode.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── UPDATE (activate / change expiry) ───────────────
promosRouter.put('/:id', requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const promo = await prisma.promoCode.update({
      where: { id: req.params.id },
      data: {
        isActive: req.body.isActive,
        maxUses: req.body.maxUses,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
      },
    });
    res.json({ success: true, promo });
  } catch (err) { next(err); }
});
