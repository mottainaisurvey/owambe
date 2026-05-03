// ─── experience-bookings.ts ──────────────────────────
// Experiences mode: ExperienceBooking management routes
//   POST   /api/experience-bookings              — create booking
//   GET    /api/experience-bookings              — list my bookings
//   GET    /api/experience-bookings/:id          — get booking details
//   POST   /api/experience-bookings/:id/cancel   — cancel booking
//   GET    /api/experience-bookings/operator     — list bookings for my experiences (OPERATOR)
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { requireMode } from '../middleware/requireMode';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

const router = Router();

router.use(authenticate);

// ─── POST /api/experience-bookings ───────────────────
router.post('/',
  requireMode('EXPERIENCES'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const { slotId, guestCount, specialRequests } = req.body;

      if (!slotId || !guestCount) {
        throw new AppError('slotId and guestCount are required', 400);
      }

      const slot = await prisma.experienceSlot.findUnique({
        where: { id: slotId },
        include: { experience: true }
      });

      if (!slot || !slot.isActive) throw new AppError('Slot not found or unavailable', 404);
      if (slot.startTime < new Date()) throw new AppError('This slot has already passed', 400);

      const availableSpots = slot.capacity - slot.bookedCount;
      if (guestCount > availableSpots) {
        throw new AppError(`Only ${availableSpots} spot${availableSpots !== 1 ? 's' : ''} remaining for this slot`, 400);
      }

      if (slot.experience.minGroupSize && guestCount < slot.experience.minGroupSize) {
        throw new AppError(`Minimum group size is ${slot.experience.minGroupSize}`, 400);
      }

       const totalAmount = Number(slot.experience.pricePerPerson) * guestCount;
      const reference = `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      // Get guest name/email from user record
      const guestUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, email: true, phone: true }
      });

      const [booking] = await prisma.$transaction([
        prisma.experienceBooking.create({
          data: {
            experienceId: slot.experience.id,
            slotId,
            guestUserId: userId,
            guestId: userId,
            guestName: guestUser ? `${guestUser.firstName} ${guestUser.lastName}` : 'Guest',
            guestEmail: guestUser?.email || '',
            guestPhone: guestUser?.phone || null,
            guestCount,
            totalAmount,
            currency: slot.experience.currency,
            reference,
            specialRequests: specialRequests || null,
            status: 'PENDING',
          },
          include: {
            slot: { select: { startTime: true, endTime: true } },
            experience: { select: { name: true, city: true, coverImageUrl: true } }
          }
        }),
        prisma.experienceSlot.update({
          where: { id: slotId },
          data: { bookedCount: { increment: guestCount } }
        })
      ]);

      logger.info(`Experience booking created: ${reference} for slot ${slotId}`);

      res.status(201).json({ success: true, data: booking });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/experience-bookings ────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { status, page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, parseInt(limit as string));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      guestId: userId,
      ...(status && { status: status as any })
    };

    const [bookings, total] = await Promise.all([
      prisma.experienceBooking.findMany({
        where,
        include: {
          slot: { select: { startTime: true, endTime: true } },
          experience: { select: { name: true, city: true, coverImageUrl: true, pricePerPerson: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.experienceBooking.count({ where })
    ]);

    res.json({
      success: true,
      data: bookings,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/experience-bookings/operator ───────────
router.get('/operator',
  requireRole('OPERATOR', 'ADMIN'),
  requireMode('EXPERIENCES'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const { status, page = '1', limit = '20' } = req.query;

      const operator = await prisma.operator.findUnique({ where: { userId } });
      if (!operator) throw new AppError('Operator profile not found', 404);

      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(50, parseInt(limit as string));
      const skip = (pageNum - 1) * limitNum;

      const where: any = {
        experience: { operatorId: operator.id },
        ...(status && { status: status as any })
      };

      const [bookings, total] = await Promise.all([
        prisma.experienceBooking.findMany({
          where,
          include: {
            slot: { select: { startTime: true, endTime: true } },
            experience: { select: { name: true, city: true } },
            guest: { select: { firstName: true, lastName: true, email: true } }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
        }),
        prisma.experienceBooking.count({ where })
      ]);

      res.json({
        success: true,
        data: bookings,
        pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/experience-bookings/:id ────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const userRole = (req as any).userRole;

    const booking = await prisma.experienceBooking.findUnique({
      where: { id: req.params.id },
      include: {
        slot: true,
        experience: { include: { operator: { select: { businessName: true, userId: true } } } },
        guest: { select: { firstName: true, lastName: true, email: true } }
      }
    });

    if (!booking) throw new AppError('Booking not found', 404);

    const isGuest = booking.guestId === userId;
    const isOperator = booking.experience.operator.userId === userId;
    if (!isGuest && !isOperator && userRole !== 'ADMIN') {
      throw new AppError('Access denied', 403);
    }

    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/experience-bookings/:id/cancel ────────
router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const userRole = (req as any).userRole;

    const booking = await prisma.experienceBooking.findUnique({
      where: { id: req.params.id },
      include: { experience: { include: { operator: true } } }
    });

    if (!booking) throw new AppError('Booking not found', 404);

    const isGuest = booking.guestId === userId;
    const isOperator = booking.experience.operator.userId === userId;
    if (!isGuest && !isOperator && userRole !== 'ADMIN') {
      throw new AppError('Access denied', 403);
    }

    if (['CANCELLED', 'COMPLETED'].includes(booking.status)) {
      throw new AppError(`Cannot cancel a booking with status: ${booking.status}`, 400);
    }

    const [updated] = await prisma.$transaction([
      prisma.experienceBooking.update({
        where: { id: req.params.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() }
      }),
      // Return the spots to the slot
      prisma.experienceSlot.update({
        where: { id: booking.slotId },
        data: { bookedCount: { decrement: booking.guestCount } }
      })
    ]);

    logger.info(`Experience booking cancelled: ${booking.reference}`);

    res.json({ success: true, data: updated, message: 'Booking cancelled successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
