// ─── stay-bookings.ts ────────────────────────────────
// Stays mode: StayBooking management routes
//   POST   /api/stay-bookings              — create booking (CONSUMER)
//   GET    /api/stay-bookings              — list my bookings (CONSUMER)
//   GET    /api/stay-bookings/:id          — get booking details
//   POST   /api/stay-bookings/:id/cancel   — cancel booking
//   GET    /api/stay-bookings/host         — list bookings for my properties (HOST)
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { requireMode } from '../middleware/requireMode';
import { initializeTransaction } from '../services/paystack.service';
import { notifyHostNewReservation } from '../services/notification.service';
import { sendEmail } from '../services/email.service';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

const router = Router();

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'https://owambe.com';

function parseStayDate(value: unknown, fieldName: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(`${fieldName} must be provided in YYYY-MM-DD format`, 400);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(`${fieldName} must be a valid date`, 400);
  }
  return parsed;
}

async function notifyDirectStayBooking(booking: any): Promise<void> {
  const hostUser = booking.property?.host?.user;
  if (!hostUser?.email) return;

  await notifyHostNewReservation({
    hostEmail: hostUser.email,
    hostFirstName: hostUser.firstName || booking.property.host.businessName || 'Host',
    propertyName: booking.property.name,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    checkInDate: booking.checkInDate,
    checkOutDate: booking.checkOutDate,
    nights: booking.nights,
    roomName: booking.room.name,
    totalAmount: Number(booking.totalAmount),
    currency: booking.currency,
    netToHost: Number(booking.totalAmount),
    channelCommissionPercent: null,
    channelOrigin: 'DIRECT',
    reservationReference: booking.reference,
    reservationId: booking.id,
    specialRequests: booking.specialRequests,
  });

  await sendEmail({
    to: booking.guestEmail,
    subject: `Stays reservation pending deposit — ${booking.property.name} (${booking.reference})`,
    template: 'guest-stay-reservation-pending',
    data: {
      firstName: booking.guestName.split(' ')[0] || 'Guest',
      propertyName: booking.property.name,
      roomName: booking.room.name,
      checkIn: booking.checkInDate.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      checkOut: booking.checkOutDate.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      nights: booking.nights,
      totalAmount: `${booking.currency} ${Number(booking.totalAmount).toLocaleString('en-NG')}`,
      depositAmount: `${booking.currency} ${Number(booking.depositAmount).toLocaleString('en-NG')}`,
      reference: booking.reference,
      manageUrl: `${APP_URL}/stays?booking=${booking.id}`,
    },
  });
}

// All stay booking routes require authentication
router.use(authenticate);

// ─── POST /api/stay-bookings ─────────────────────────
// Create a new stay booking
router.post('/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const { roomId, checkInDate, checkOutDate, guestCount, specialRequests } = req.body;

      if (!roomId || !checkInDate || !checkOutDate || !guestCount) {
        throw new AppError('roomId, checkInDate, checkOutDate, and guestCount are required', 400);
      }

      const requestedGuestCount = Number(guestCount);
      if (!Number.isInteger(requestedGuestCount) || requestedGuestCount < 1) {
        throw new AppError('guestCount must be a positive integer', 400);
      }

      const checkIn = parseStayDate(checkInDate, 'checkInDate');
      const checkOut = parseStayDate(checkOutDate, 'checkOutDate');

      if (checkOut <= checkIn) {
        throw new AppError('checkOut must be after checkIn', 400);
      }

      const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / MS_PER_DAY);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      if (checkIn < today) {
        throw new AppError('checkInDate cannot be in the past', 400);
      }

      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          property: {
            include: {
              host: { include: { user: { select: { email: true, firstName: true } } } },
            },
          },
        },
      });

      if (!room || !room.isActive || !room.property.isActive || !room.property.isApproved) {
        throw new AppError('Room not found or unavailable', 404);
      }
      if (room.capacity < requestedGuestCount) {
        throw new AppError(`This room has a maximum capacity of ${room.capacity} guests`, 400);
      }

      const [conflict, blockedEntry] = await Promise.all([
        prisma.stayBooking.findFirst({
          where: {
            roomId,
            status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
            OR: [{ checkInDate: { lt: checkOut }, checkOutDate: { gt: checkIn } }],
          },
        }),
        prisma.calendarEntry.findFirst({
          where: {
            roomId,
            date: { gte: checkIn, lt: checkOut },
            status: { in: ['BLOCKED', 'MAINTENANCE', 'BOOKED'] },
          },
        }),
      ]);

      if (conflict || blockedEntry) {
        throw new AppError('This room is not available for the selected dates', 409);
      }

      const totalAmount = Number(room.pricePerNight) * nights;
      const depositAmount = totalAmount * 0.3;
      const reference = `STAY-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      const guestUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, email: true, phone: true },
      });
      if (!guestUser?.email) {
        throw new AppError('A verified guest email is required to create a stay booking', 400);
      }

      const guestName = `${guestUser.firstName ?? ''} ${guestUser.lastName ?? ''}`.trim() || 'Guest';

      const booking = await prisma.stayBooking.create({
        data: {
          propertyId: room.property.id,
          roomId,
          guestUserId: userId,
          guestId: userId,
          guestName,
          guestEmail: guestUser.email,
          guestPhone: guestUser.phone || null,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          nights,
          guestCount: requestedGuestCount,
          numberOfGuests: requestedGuestCount,
          totalAmount,
          depositAmount,
          currency: room.currency,
          reference,
          specialRequests: specialRequests || null,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          channelOrigin: 'DIRECT',
          netToHost: totalAmount,
        },
        include: {
          room: true,
          property: {
            include: {
              host: { include: { user: { select: { email: true, firstName: true } } } },
            },
          },
        },
      });

      const paymentInit = await initializeTransaction({
        email: guestUser.email,
        amount: depositAmount,
        reference: `${reference}-DEP`,
        metadata: {
          bookingId: booking.id,
          bookingReference: reference,
          type: 'STAY_DEPOSIT',
          propertyName: room.property.name,
          roomId,
          checkInDate,
          checkOutDate,
        },
        callbackUrl: `${APP_URL}/stays?booking=${booking.id}`,
      });

      await prisma.stayBooking.update({
        where: { id: booking.id },
        data: { paystackRef: paymentInit.reference, paystackReference: paymentInit.reference },
      });

      setImmediate(() => {
        notifyDirectStayBooking(booking).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error('[StayBookings] Direct booking notification failed', { bookingId: booking.id, error: msg });
        });
      });

      logger.info(`Stay booking created: ${reference} for room ${roomId}`);

      res.status(201).json({
        success: true,
        data: booking,
        payment: {
          authorizationUrl: paymentInit.authorization_url,
          reference: paymentInit.reference,
          depositAmount,
          balanceAmount: totalAmount - depositAmount,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/stay-bookings ──────────────────────────
// List my stay bookings (as guest)
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
      prisma.stayBooking.findMany({
        where,
        include: {
          room: { select: { name: true, roomType: true, pricePerNight: true } },
          property: { select: { name: true, city: true, coverImageUrl: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.stayBooking.count({ where })
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

// ─── GET /api/stay-bookings/host ─────────────────────
// List bookings for my properties (as HOST)
router.get('/host',
  requireRole('HOST', 'ADMIN'),
  requireMode('STAYS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const { status, page = '1', limit = '20' } = req.query;

      const host = await prisma.host.findUnique({ where: { userId } });
      if (!host) throw new AppError('Host profile not found', 404);

      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(50, parseInt(limit as string));
      const skip = (pageNum - 1) * limitNum;

      const where: any = {
        property: { hostId: host.id },
        ...(status && { status: status as any })
      };

      // OWB-C-08 (AC3): Include commission fields and aggregate revenue summary
      const [bookings, total, revenueSummary] = await Promise.all([
        prisma.stayBooking.findMany({
          where,
          select: {
            id: true,
            reference: true,
            checkInDate: true,
            checkOutDate: true,
            nights: true,
            guestName: true,
            guestEmail: true,
            guestPhone: true,
            status: true,
            paymentStatus: true,
            totalAmount: true,
            currency: true,
            channelOrigin: true,
            channelCommissionAmount: true,
            channelCommissionPercent: true,
            netToHost: true,
            externalRef: true,
            specialRequests: true,
            createdAt: true,
            room: { select: { name: true, roomType: true } },
            property: { select: { name: true, city: true } },
            guest: { select: { firstName: true, lastName: true, email: true } },
          },
          orderBy: { checkInDate: 'asc' },
          skip,
          take: limitNum,
        }),
        prisma.stayBooking.count({ where }),
        // Aggregate revenue summary across ALL matching bookings (not just this page)
        prisma.stayBooking.aggregate({
          where,
          _sum: {
            totalAmount: true,
            channelCommissionAmount: true,
            netToHost: true,
          },
          _count: { id: true },
        }),
      ]);

      const revenueSummaryData = {
        totalBookings: revenueSummary._count.id,
        totalGrossRevenue: revenueSummary._sum.totalAmount?.toFixed(2) ?? '0.00',
        totalChannelCommission: revenueSummary._sum.channelCommissionAmount?.toFixed(2) ?? '0.00',
        totalNetToHost: revenueSummary._sum.netToHost?.toFixed(2) ?? '0.00',
        currency: 'NGN',
      };

      res.json({
        success: true,
        data: bookings,
        revenueSummary: revenueSummaryData,
        pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/stay-bookings/:id ──────────────────────
// Get booking details
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const userRole = (req as any).userRole;

    const booking = await prisma.stayBooking.findUnique({
      where: { id: req.params.id },
      include: {
        room: true,
        property: { include: { host: { select: { businessName: true, userId: true } } } },
        guest: { select: { firstName: true, lastName: true, email: true } }
      }
    });

    if (!booking) throw new AppError('Booking not found', 404);

    // Only the guest, the host, or admin can view
    const isGuest = booking.guestId === userId;
    const isHost = booking.property.host.userId === userId;
    if (!isGuest && !isHost && userRole !== 'ADMIN') {
      throw new AppError('Access denied', 403);
    }

    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/stay-bookings/:id/cancel ──────────────
// Cancel a booking
router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const userRole = (req as any).userRole;

    const booking = await prisma.stayBooking.findUnique({
      where: { id: req.params.id },
      include: { property: { include: { host: true } } }
    });

    if (!booking) throw new AppError('Booking not found', 404);

    const isGuest = booking.guestId === userId;
    const isHost = booking.property.host.userId === userId;
    if (!isGuest && !isHost && userRole !== 'ADMIN') {
      throw new AppError('Access denied', 403);
    }

    if (['CANCELLED', 'CHECKED_OUT'].includes(booking.status)) {
      throw new AppError(`Cannot cancel a booking with status: ${booking.status}`, 400);
    }

    const updated = await prisma.stayBooking.update({
      where: { id: req.params.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: isGuest ? 'GUEST' : 'HOST',
      }
    });

    logger.info(`Stay booking cancelled: ${booking.reference} by ${isGuest ? 'guest' : 'host'}`);

    res.json({ success: true, data: updated, message: 'Booking cancelled successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
