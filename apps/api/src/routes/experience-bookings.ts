// ─── experience-bookings.ts ──────────────────────────
// Experiences mode: ExperienceBooking management routes
//   POST   /api/experience-bookings              — create booking + Paystack init (consumer)
//   GET    /api/experience-bookings              — list my bookings (consumer)
//   GET    /api/experience-bookings/:id          — get booking details (consumer/operator/admin)
//   POST   /api/experience-bookings/:id/cancel   — cancel booking (consumer/operator/admin)
//   GET    /api/experience-bookings/operator     — list bookings for my experiences (OPERATOR)
//   POST   /api/experience-bookings/:id/verify   — verify Paystack payment and confirm booking
//
// C3 invariants:
//   - Seat reservation uses conditional UPDATE at DB level (atomic, race-safe)
//   - Cancellation decrements bookedCount synchronously in same transaction
//   - meetingDetails disclosed only when paymentStatus === 'PAID'
//   - Consumer booking endpoint requires authenticate only (no requireMode)
//   - Double publication gate: isApproved && isActive enforced at booking creation
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { requireMode } from '../middleware/requireMode';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { dispatchWebhookEvent } from '../services/webhookDispatcher.service';
import { initializeTransaction, verifyTransaction } from '../services/paystack.service';
import { sendEmail } from '../services/email.service';

const router = Router();
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'https://owambe.com';

router.use(authenticate);

// ─── POST /api/experience-bookings ───────────────────
// C3-c: Consumer booking creation with atomic seat reservation + Paystack init
// NOTE: requireMode('EXPERIENCES') removed — consumer users do not have EXPERIENCES mode.
//       This was a pre-existing scaffolding error (see OWB-C3-DESIGN-DECISIONS.md Q5).
router.post('/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const { slotId, guestCount, specialRequests } = req.body;

      if (!slotId || !guestCount) {
        throw new AppError('slotId and guestCount are required', 400);
      }
      if (!Number.isInteger(guestCount) || guestCount < 1) {
        throw new AppError('guestCount must be a positive integer', 400);
      }

      // C3-c: Load slot with experience — enforce double publication gate
      const slot = await prisma.experienceSlot.findUnique({
        where: { id: slotId },
        include: {
          experience: {
            include: {
              operator: { select: { id: true, userId: true, businessName: true } }
            }
          }
        }
      });

      if (!slot || !slot.isActive) throw new AppError('Slot not found or unavailable', 404);
      if (!slot.experience.isActive || !slot.experience.isApproved) {
        // C3 double publication gate: isApproved && isActive
        throw new AppError('This experience is not currently available for booking', 400);
      }
      if (slot.startTime < new Date()) throw new AppError('This slot has already passed', 400);

      if (slot.experience.minGroupSize && guestCount < slot.experience.minGroupSize) {
        throw new AppError(`Minimum group size is ${slot.experience.minGroupSize}`, 400);
      }
      if (slot.experience.maxGroupSize && guestCount > slot.experience.maxGroupSize) {
        throw new AppError(`Maximum group size is ${slot.experience.maxGroupSize}`, 400);
      }

      // C3-c: Get guest user details
      const guestUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, email: true, phone: true }
      });
      if (!guestUser) throw new AppError('User not found', 404);

      const totalAmount = Number(slot.experience.pricePerPerson) * guestCount;
      const reference = `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      // C3-c: ATOMIC SEAT RESERVATION — conditional UPDATE at DB level
      // This is the race-safe mechanism: two concurrent requests will serialise at the row lock.
      // Only one will satisfy the WHERE clause; the other gets rowsAffected === 0 → 409.
      const seatResult = await prisma.$executeRaw`
        UPDATE experience_slots
        SET "bookedCount" = "bookedCount" + ${guestCount}
        WHERE id = ${slotId}::uuid
          AND ("capacity" - "bookedCount") >= ${guestCount}
          AND "isActive" = true
      `;

      if (seatResult === 0) {
        // Slot is sold out or was cancelled between the read and the update
        const currentSlot = await prisma.experienceSlot.findUnique({
          where: { id: slotId },
          select: { capacity: true, bookedCount: true, isActive: true }
        });
        if (!currentSlot || !currentSlot.isActive) {
          throw new AppError('This slot is no longer available', 409);
        }
        const remaining = currentSlot.capacity - currentSlot.bookedCount;
        if (remaining < guestCount) {
          throw new AppError(
            remaining === 0
              ? 'This slot is sold out'
              : `Only ${remaining} spot${remaining !== 1 ? 's' : ''} remaining`,
            409
          );
        }
        throw new AppError('Slot reservation failed — please try again', 409);
      }

      // C3-c: Create booking record (seats already reserved atomically above)
      let booking;
      try {
        booking = await prisma.experienceBooking.create({
          data: {
            experienceId: slot.experience.id,
            slotId,
            guestUserId: userId,
            guestId: userId,
            guestName: `${guestUser.firstName} ${guestUser.lastName}`,
            guestEmail: guestUser.email,
            guestPhone: guestUser.phone || null,
            guestCount,
            totalAmount,
            currency: slot.experience.currency,
            reference,
            specialRequests: specialRequests || null,
            status: 'PENDING',
            paymentStatus: 'PENDING',
          },
          include: {
            slot: { select: { startTime: true, endTime: true } },
            experience: { select: { name: true, city: true, coverImageUrl: true } }
          }
        });
      } catch (createErr) {
        // Booking record creation failed — release the seats we already reserved
        await prisma.$executeRaw`
          UPDATE experience_slots
          SET "bookedCount" = GREATEST(0, "bookedCount" - ${guestCount})
          WHERE id = ${slotId}::uuid
        `;
        throw createErr;
      }

      // C3-c: Initialise Paystack transaction
      let paystackResult: { authorizationUrl: string; reference: string } | null = null;
      try {
        const paystack = await initializeTransaction({
          email: guestUser.email,
          amount: totalAmount,
          reference,
          callbackUrl: `${APP_URL}/experiences?booking=${booking.id}`,
          metadata: {
            bookingId: booking.id,
            experienceId: slot.experience.id,
            slotId,
            guestCount,
            type: 'EXPERIENCE_BOOKING',
          },
        });
        paystackResult = {
          authorizationUrl: paystack.authorization_url,
          reference: paystack.reference,
        };
        // Store Paystack reference on booking
        await prisma.experienceBooking.update({
          where: { id: booking.id },
          data: { paystackRef: paystack.reference },
        });
      } catch (paystackErr) {
        // Paystack init failed — booking persists with PENDING status (seats held)
        // This matches the Stays precedent: booking row exists, consumer can retry payment
        logger.error(`Paystack init failed for booking ${reference}:`, paystackErr);
      }

      logger.info(`Experience booking created: ${reference} for slot ${slotId}`);

      // C3-d: Notify operator (non-blocking)
      setImmediate(async () => {
        try {
          const operatorUser = await prisma.user.findUnique({
            where: { id: slot.experience.operator.userId },
            select: { email: true, firstName: true }
          });
          if (operatorUser) {
            const slotDate = slot.startTime.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const slotTime = slot.startTime.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
            await sendEmail({
              to: operatorUser.email,
              subject: `New Booking — ${slot.experience.name}`,
              template: 'operator-new-booking',
              data: {
                firstName: operatorUser.firstName,
                experienceName: slot.experience.name,
                channelLabel: 'Owambe Direct',
                leadParticipantName: `${guestUser.firstName} ${guestUser.lastName}`,
                leadParticipantEmail: guestUser.email,
                numberOfParticipants: guestCount,
                slotDate,
                slotTime,
                totalAmount: `₦${totalAmount.toLocaleString()}`,
                netToOperator: `₦${totalAmount.toLocaleString()}`,
                pickupRequested: 'No',
                pickupAddress: 'N/A',
                specialRequirements: specialRequests || 'None',
                reference,
                dashboardUrl: `${APP_URL}/dashboard/experiences/bookings`,
              }
            });
          }
        } catch (emailErr) {
          logger.error('Operator notification email failed (non-fatal):', emailErr);
        }
      });

      // C3-d: Guest confirmation email (non-blocking)
      setImmediate(async () => {
        try {
          const slotDate = slot.startTime.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
          const slotTime = slot.startTime.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
          await sendEmail({
            to: guestUser.email,
            subject: `Booking Created — ${slot.experience.name}`,
            template: 'guest-experience-booking-confirmed',
            data: {
              firstName: guestUser.firstName,
              experienceName: slot.experience.name,
              slotDate,
              slotTime,
              guestCount,
              totalAmount: `₦${totalAmount.toLocaleString()}`,
              reference,
              manageUrl: `${APP_URL}/experiences?booking=${booking.id}`,
            }
          });
        } catch (emailErr) {
          logger.error('Guest confirmation email failed (non-fatal):', emailErr);
        }
      });

      res.status(201).json({
        success: true,
        data: booking,
        payment: paystackResult,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/experience-bookings/:id/verify ────────
// C3-c: Verify Paystack payment and confirm booking
// Called by the web app after the consumer returns from Paystack redirect
router.post('/:id/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { reference } = req.body;

    const booking = await prisma.experienceBooking.findUnique({
      where: { id: req.params.id },
      include: {
        slot: { select: { startTime: true, endTime: true } },
        experience: {
          select: {
            name: true, city: true, coverImageUrl: true,
            meetingDetails: true,
            operator: { select: { userId: true } }
          }
        }
      }
    });

    if (!booking) throw new AppError('Booking not found', 404);
    if (booking.guestId !== userId) throw new AppError('Access denied', 403);

    if (booking.paymentStatus === 'PAID') {
      // Already confirmed — return current state with meetingDetails
      const response = {
        ...booking,
        experience: {
          ...booking.experience,
          meetingDetails: booking.experience.meetingDetails, // Disclosed: already paid
        }
      };
      return res.json({ success: true, data: response, alreadyConfirmed: true });
    }

    // Verify with Paystack
    const paystackRef = reference || booking.paystackRef || booking.reference;
    const verification = await verifyTransaction(paystackRef);

    if (verification.status !== 'success') {
      return res.status(402).json({
        success: false,
        error: 'Payment not yet confirmed',
        paystackStatus: verification.status,
      });
    }

    // Confirm booking
    const confirmed = await prisma.experienceBooking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: 'PAID',
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        paystackRef: paystackRef,
      },
      include: {
        slot: { select: { startTime: true, endTime: true } },
        experience: {
          select: {
            name: true, city: true, coverImageUrl: true,
            meetingDetails: true,
          }
        }
      }
    });

    logger.info(`Experience booking confirmed: ${booking.reference}`);

    res.json({ success: true, data: confirmed });
  } catch (err) {
    next(err);
  }
});

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

    // C3-d: meetingDetails disclosure gate — only include when paymentStatus === 'PAID'
    // For list view, meetingDetails is not included (per-booking detail view is the disclosure surface)

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
// Must be registered BEFORE /:id to avoid Express treating 'operator' as an ID
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
            experience: { select: { name: true, city: true, meetingDetails: true } },
            guest: { select: { firstName: true, lastName: true, email: true } }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
        }),
        prisma.experienceBooking.count({ where })
      ]);

      // C3-d: Operator sees meetingDetails always (they authored it)

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
        experience: {
          include: {
            operator: { select: { businessName: true, userId: true } }
          }
        },
        guest: { select: { firstName: true, lastName: true, email: true } }
      }
    });

    if (!booking) throw new AppError('Booking not found', 404);

    const isGuest = booking.guestId === userId;
    const isOperator = booking.experience.operator.userId === userId;
    if (!isGuest && !isOperator && userRole !== 'ADMIN') {
      throw new AppError('Access denied', 403);
    }

    // C3-d: meetingDetails disclosure gate
    // Guests see meetingDetails only after payment confirmation
    // Operators and admins always see meetingDetails
    const meetingDetails =
      isOperator || userRole === 'ADMIN'
        ? booking.experience.meetingDetails
        : booking.paymentStatus === 'PAID'
          ? booking.experience.meetingDetails
          : null;

    const responseData = {
      ...booking,
      experience: {
        ...booking.experience,
        meetingDetails,
      }
    };

    res.json({ success: true, data: responseData });
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

    // C3 invariant: synchronous seat release in same transaction as status update
    const [updated] = await prisma.$transaction([
      prisma.experienceBooking.update({
        where: { id: req.params.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: req.body.reason || null,
        }
      }),
      // Synchronous seat release — bookedCount cannot go below 0
      prisma.experienceSlot.updateMany({
        where: {
          id: booking.slotId,
          bookedCount: { gte: booking.guestCount }
        },
        data: { bookedCount: { decrement: booking.guestCount } }
      })
    ]);

    logger.info(`Experience booking cancelled: ${booking.reference}`);

    // Dispatch booking.cancelled outbound event (non-blocking)
    const cancelledBy: 'GUEST' | 'OPERATOR' | 'SYSTEM' =
      isGuest ? 'GUEST' : isOperator ? 'OPERATOR' : 'SYSTEM';
    setImmediate(async () => {
      try {
        await dispatchWebhookEvent({
          eventType: 'booking.cancelled',
          idempotencyKey: `booking.cancelled.${updated.id}`,
          data: {
            booking_id: updated.id,
            external_ref: booking.externalRef ?? null,
            cancellation_reason: req.body.reason || 'GUEST_REQUEST',
            cancellation_initiated_by: cancelledBy,
            cancelled_at: (updated.cancelledAt ?? new Date()).toISOString(),
            capacity_restoration_required: true,
          },
        });
      } catch (dispatchErr) {
        logger.error('booking.cancelled dispatch error (non-fatal)', {
          bookingId: updated.id,
          error: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
        });
      }
    });

    res.json({ success: true, data: updated, message: 'Booking cancelled successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
