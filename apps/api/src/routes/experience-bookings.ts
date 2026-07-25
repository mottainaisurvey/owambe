// ─── experience-bookings.ts ──────────────────────────
// OWB-C-GUEST-CHECKOUT-01: G-2/G-3/G-4(ii)/G-5 changes applied.
// G-2: POST / accepts unauthenticated (guest) callers via authenticateOptional.
// G-3: X-Idempotency-Key header deduplication (24h TTL via cache).
// G-4(ii): GET /public/:reference — no auth, PII-gated, meetingDetails never returned.
// G-5: POST /:id/claim-account — issues GuestClaimToken + sends magic link email.
// CS-1.2: claim-account is idempotent: same-account → 200; different-account → 409.
// CS-1.5: meetingDetails disclosure gated on verified email control (valid unused
//         GuestClaimToken in X-Claim-Token header OR authenticated user whose email
//         matches booking.guestEmail). Operator/admin retain access. Disclosure denied
//         before verification and before the approved payment state.
import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../database/client';
import { authenticate, authenticateOptional } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { requireMode } from '../middleware/requireMode';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { dispatchWebhookEvent } from '../services/webhookDispatcher.service';
import { initializeTransaction, verifyTransaction } from '../services/paystack.service';
import { sendEmail } from '../services/email.service';
import { cacheGet, cacheSet } from '../services/cache.service';

const router = Router();
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'https://owambe.com';

// ─── GET /api/experience-bookings/public/:reference ──
// G-4(ii): Public retrieval — no auth. PII-gated. meetingDetails NEVER returned.
// Registered BEFORE /:id to avoid Express treating 'public' as an ID.
router.get('/public/:reference', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await prisma.experienceBooking.findUnique({
      where: { reference: req.params.reference },
      include: {
        slot: { select: { startTime: true, endTime: true } },
        experience: { select: { name: true, city: true, coverImageUrl: true } },
      },
    });
    if (!booking) throw new AppError('Booking not found', 404);
    const publicData = {
      id: booking.id,
      reference: booking.reference,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      guestCount: booking.guestCount,
      totalAmount: booking.totalAmount,
      currency: booking.currency,
      createdAt: booking.createdAt,
      slot: booking.slot,
      experience: booking.experience,
    };
    res.json({ success: true, data: publicData });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/experience-bookings ───────────────────
// G-2: Guest checkout — authenticateOptional.
// G-3: X-Idempotency-Key header deduplication.
router.post('/',
  authenticateOptional,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId as string | undefined;
      const { slotId, guestCount, specialRequests, guestName, guestEmail, guestPhone } = req.body;

      // G-3: Idempotency guard
      const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = await cacheGet<object>(`idempotency:booking:${idempotencyKey}`);
        if (cached) {
          logger.info('[GCO01] Idempotent booking re-call', { idempotencyKey });
          return res.status(201).json(cached);
        }
      }

      if (!slotId || !guestCount) throw new AppError('slotId and guestCount are required', 400);
      if (!Number.isInteger(guestCount) || guestCount < 1) throw new AppError('guestCount must be a positive integer', 400);

      // G-2: Resolve guest identity
      let resolvedGuestName: string;
      let resolvedGuestEmail: string;
      let resolvedGuestPhone: string | null;

      if (userId) {
        const guestUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, lastName: true, email: true, phone: true }
        });
        if (!guestUser) throw new AppError('User not found', 404);
        resolvedGuestName = `${guestUser.firstName} ${guestUser.lastName}`;
        resolvedGuestEmail = guestUser.email;
        resolvedGuestPhone = guestUser.phone || null;
      } else {
        if (!guestName || typeof guestName !== 'string' || !guestName.trim()) throw new AppError('guestName is required for guest checkout', 400);
        if (!guestEmail || typeof guestEmail !== 'string' || !guestEmail.trim()) throw new AppError('guestEmail is required for guest checkout', 400);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) throw new AppError('guestEmail must be a valid email address', 400);
        resolvedGuestName = guestName.trim();
        resolvedGuestEmail = guestEmail.trim().toLowerCase();
        resolvedGuestPhone = guestPhone?.trim() || null;
      }

      const slot = await prisma.experienceSlot.findUnique({
        where: { id: slotId },
        include: { experience: { include: { operator: { select: { id: true, userId: true, businessName: true } } } } }
      });

      if (!slot || !slot.isActive) throw new AppError('Slot not found or unavailable', 404);
      if (!slot.experience.isActive || !slot.experience.isApproved) throw new AppError('This experience is not currently available for booking', 400);
      if (slot.startTime < new Date()) throw new AppError('This slot has already passed', 400);
      if (slot.experience.minGroupSize && guestCount < slot.experience.minGroupSize) throw new AppError(`Minimum group size is ${slot.experience.minGroupSize}`, 400);
      if (slot.experience.maxGroupSize && guestCount > slot.experience.maxGroupSize) throw new AppError(`Maximum group size is ${slot.experience.maxGroupSize}`, 400);

      const totalAmount = Number(slot.experience.pricePerPerson) * guestCount;
      const reference = `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      const seatResult = await prisma.$executeRaw`
        UPDATE experience_slots
        SET "bookedCount" = "bookedCount" + ${guestCount}
        WHERE id = ${slotId}::uuid
          AND ("capacity" - "bookedCount") >= ${guestCount}
          AND "isActive" = true
      `;

      if (seatResult === 0) {
        const currentSlot = await prisma.experienceSlot.findUnique({ where: { id: slotId }, select: { capacity: true, bookedCount: true, isActive: true } });
        if (!currentSlot || !currentSlot.isActive) throw new AppError('This slot is no longer available', 409);
        const remaining = currentSlot.capacity - currentSlot.bookedCount;
        if (remaining < guestCount) throw new AppError(remaining === 0 ? 'This slot is sold out' : `Only ${remaining} spot${remaining !== 1 ? 's' : ''} remaining`, 409);
        throw new AppError('Slot reservation failed — please try again', 409);
      }

      let booking;
      try {
        booking = await prisma.experienceBooking.create({
          data: {
            experienceId: slot.experience.id,
            slotId,
            guestUserId: userId || null,
            guestId: userId || null,
            guestName: resolvedGuestName,
            guestEmail: resolvedGuestEmail,
            guestPhone: resolvedGuestPhone,
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
        await prisma.$executeRaw`UPDATE experience_slots SET "bookedCount" = GREATEST(0, "bookedCount" - ${guestCount}) WHERE id = ${slotId}::uuid`;
        throw createErr;
      }

      let paystackResult: { authorizationUrl: string; reference: string } | null = null;
      try {
        const paystack = await initializeTransaction({
          email: resolvedGuestEmail,
          amount: totalAmount,
          reference,
          callbackUrl: `${APP_URL}/experiences/booking/${booking.id}`,
          metadata: { bookingId: booking.id, experienceId: slot.experience.id, slotId, guestCount, type: 'EXPERIENCE_BOOKING' },
        });
        paystackResult = { authorizationUrl: paystack.authorization_url, reference: paystack.reference };
        await prisma.experienceBooking.update({ where: { id: booking.id }, data: { paystackRef: paystack.reference } });
      } catch (paystackErr) {
        logger.error(`Paystack init failed for booking ${reference}:`, paystackErr);
      }

      logger.info(`Experience booking created: ${reference} (${userId ? 'authenticated' : 'guest'})`);

      setImmediate(async () => {
        try {
          const operatorUser = await prisma.user.findUnique({ where: { id: slot.experience.operator.userId }, select: { email: true, firstName: true } });
          if (operatorUser) {
            const slotDate = slot.startTime.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const slotTime = slot.startTime.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
            await sendEmail({ to: operatorUser.email, subject: `New Booking — ${slot.experience.name}`, template: 'operator-new-booking', data: { firstName: operatorUser.firstName, experienceName: slot.experience.name, channelLabel: 'Owambe Direct', leadParticipantName: resolvedGuestName, leadParticipantEmail: resolvedGuestEmail, numberOfParticipants: guestCount, slotDate, slotTime, totalAmount: `₦${totalAmount.toLocaleString()}`, netToOperator: `₦${totalAmount.toLocaleString()}`, pickupRequested: 'No', pickupAddress: 'N/A', specialRequirements: specialRequests || 'None', reference, dashboardUrl: `${APP_URL}/dashboard/experiences/bookings` } });
          }
        } catch (emailErr) { logger.error('Operator notification email failed (non-fatal):', emailErr); }
      });

      setImmediate(async () => {
        try {
          const slotDate = slot.startTime.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
          const slotTime = slot.startTime.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
          await sendEmail({ to: resolvedGuestEmail, subject: `Booking Created — ${slot.experience.name}`, template: 'guest-experience-booking-confirmed', data: { firstName: resolvedGuestName.split(' ')[0], experienceName: slot.experience.name, slotDate, slotTime, guestCount, totalAmount: `₦${totalAmount.toLocaleString()}`, reference, manageUrl: `${APP_URL}/experiences/booking/${booking.id}` } });
        } catch (emailErr) { logger.error('Guest confirmation email failed (non-fatal):', emailErr); }
      });

      const responseBody = { success: true, data: booking, payment: paystackResult, isGuestBooking: !userId };
      if (idempotencyKey) await cacheSet(`idempotency:booking:${idempotencyKey}`, responseBody, 86400);
      res.status(201).json(responseBody);
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/experience-bookings/:id/verify ────────
// G-2: Accepts both authenticated and guest callers.
router.post('/:id/verify',
  authenticateOptional,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId as string | undefined;
      const { reference } = req.body;

      const booking = await prisma.experienceBooking.findUnique({
        where: { id: req.params.id },
        include: {
          slot: { select: { startTime: true, endTime: true } },
          experience: { select: { name: true, city: true, coverImageUrl: true, meetingDetails: true, operator: { select: { userId: true } } } }
        }
      });

      if (!booking) throw new AppError('Booking not found', 404);

      if (userId) {
        const userRole = (req as any).userRole;
        const isGuest = booking.guestId === userId;
        const isOperator = booking.experience.operator.userId === userId;
        if (!isGuest && !isOperator && userRole !== 'ADMIN') {
          // CS-1.5: also allow authenticated user whose email matches booking.guestEmail
          const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
          if (!user || user.email !== booking.guestEmail) throw new AppError('Access denied', 403);
        }
      }

      // CS-1.5: Verified email control — check for a valid unused GuestClaimToken
      // presented in X-Claim-Token header, OR an authenticated user whose email matches
      // booking.guestEmail. Operator and admin retain access for operational purposes.
      // Disclosure is denied before verification and before the approved payment state.
      const claimTokenHeader = req.headers['x-claim-token'] as string | undefined;
      let emailVerified = false;
      if (claimTokenHeader) {
        const claimToken = await prisma.guestClaimToken.findFirst({
          where: { token: claimTokenHeader, bookingId: booking.id, usedAt: null },
        });
        if (claimToken && claimToken.expiresAt > new Date()) emailVerified = true;
      }
      if (!emailVerified && userId) {
        const userRole = (req as any).userRole;
        const isOperator = booking.experience.operator.userId === userId;
        if (isOperator || userRole === 'ADMIN') {
          emailVerified = true;
        } else {
          const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
          if (user && user.email === booking.guestEmail) emailVerified = true;
        }
      }

      if (booking.paymentStatus === 'PAID') {
        const meetingDetails = emailVerified ? booking.experience.meetingDetails : null;
        return res.json({ success: true, data: { ...booking, experience: { ...booking.experience, meetingDetails } }, alreadyConfirmed: true });
      }

      const paystackRef = reference || booking.paystackRef || booking.reference;
      const verification = await verifyTransaction(paystackRef);
      if (verification.status !== 'success') return res.status(402).json({ success: false, error: 'Payment not yet confirmed', paystackStatus: verification.status });

      const confirmed = await prisma.experienceBooking.update({
        where: { id: booking.id },
        data: { paymentStatus: 'PAID', status: 'CONFIRMED', confirmedAt: new Date(), paystackRef },
        include: { slot: { select: { startTime: true, endTime: true } }, experience: { select: { name: true, city: true, coverImageUrl: true, meetingDetails: true } } }
      });

      logger.info(`Experience booking confirmed: ${booking.reference}`);
      const meetingDetails = emailVerified ? confirmed.experience.meetingDetails : null;
      res.json({ success: true, data: { ...confirmed, experience: { ...confirmed.experience, meetingDetails } } });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/experience-bookings/:id/claim-account ─
// G-5: Post-purchase account creation — sends magic link to guest's email.
// CS-1.2: authenticateOptional so userId is available for same-account idempotency check.
router.post('/:id/claim-account', authenticateOptional, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await prisma.experienceBooking.findUnique({
      where: { id: req.params.id },
      include: { experience: { select: { name: true } }, slot: { select: { startTime: true } } },
    });
    if (!booking) throw new AppError('Booking not found', 404);
    // CS-1.2: Idempotent claim — same-account succeeds silently; different-account is a conflict.
    if (booking.guestUserId) {
      const requestUserId = (req as any).userId as string | undefined;
      if (requestUserId && booking.guestUserId === requestUserId) {
        // Same account re-claiming — idempotent success
        return res.json({ success: true, message: 'Booking is already linked to your account.', alreadyClaimed: true });
      }
      // Different account (or unauthenticated) — explicit conflict
      return res.status(409).json({ success: false, error: 'This booking has already been claimed by another account', code: 'BOOKING_ALREADY_CLAIMED' });
    }
    if (booking.paymentStatus !== 'PAID') return res.status(400).json({ success: false, error: 'Account claim is only available after payment is confirmed' });

    const existingUser = await prisma.user.findUnique({ where: { email: booking.guestEmail } });
    if (existingUser) return res.status(400).json({ success: false, error: 'An account already exists for this email. Please sign in.', hint: 'sign_in' });

    await prisma.guestClaimToken.updateMany({ where: { bookingId: booking.id, usedAt: null }, data: { usedAt: new Date() } });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.guestClaimToken.create({ data: { token, bookingId: booking.id, guestEmail: booking.guestEmail, expiresAt } });

    const claimUrl = `${APP_URL}/claim-account?token=${token}`;
    const slotDate = booking.slot.startTime.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    setImmediate(async () => {
      try {
        await sendEmail({ to: booking.guestEmail, subject: `Your Owambe booking is confirmed — create your account`, template: 'guest-booking-claim-account', data: { guestName: booking.guestName, firstName: booking.guestName.split(' ')[0], experienceName: booking.experience.name, slotDate, claimUrl, expiryHours: 24 } });
        logger.info(`[GCO01] Claim account email sent to ${booking.guestEmail} for booking ${booking.id}`);
      } catch (emailErr) { logger.error('[GCO01] Claim account email failed (non-fatal):', emailErr); }
    });

    res.json({ success: true, message: 'Magic link sent. Check your email to create your account.', emailSentTo: booking.guestEmail });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/experience-bookings ────────────────────
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { status, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, parseInt(limit as string));
    const skip = (pageNum - 1) * limitNum;
    const where: any = { guestId: userId, ...(status && { status: status as any }) };
    const [bookings, total] = await Promise.all([
      prisma.experienceBooking.findMany({ where, include: { slot: { select: { startTime: true, endTime: true } }, experience: { select: { name: true, city: true, coverImageUrl: true, pricePerPerson: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limitNum }),
      prisma.experienceBooking.count({ where })
    ]);
    res.json({ success: true, data: bookings, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (err) { next(err); }
});

// ─── GET /api/experience-bookings/operator ───────────
router.get('/operator', authenticate, requireRole('OPERATOR', 'ADMIN'), requireMode('EXPERIENCES'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { status, page = '1', limit = '20' } = req.query;
    const operator = await prisma.operator.findUnique({ where: { userId } });
    if (!operator) throw new AppError('Operator profile not found', 404);
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, parseInt(limit as string));
    const skip = (pageNum - 1) * limitNum;
    const where: any = { experience: { operatorId: operator.id }, ...(status && { status: status as any }) };
    const [bookings, total] = await Promise.all([
      prisma.experienceBooking.findMany({ where, include: { slot: { select: { startTime: true, endTime: true } }, experience: { select: { name: true, city: true, meetingDetails: true } }, guest: { select: { firstName: true, lastName: true, email: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limitNum }),
      prisma.experienceBooking.count({ where })
    ]);
    res.json({ success: true, data: bookings, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (err) { next(err); }
});

// ─── GET /api/experience-bookings/:id ────────────────
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const userRole = (req as any).userRole;
    const booking = await prisma.experienceBooking.findUnique({
      where: { id: req.params.id },
      include: { slot: true, experience: { include: { operator: { select: { businessName: true, userId: true } } } }, guest: { select: { firstName: true, lastName: true, email: true } } }
    });
    if (!booking) throw new AppError('Booking not found', 404);
    const isGuest = booking.guestId === userId;
    const isOperator = booking.experience.operator.userId === userId;
    if (!isGuest && !isOperator && userRole !== 'ADMIN') throw new AppError('Access denied', 403);
    const meetingDetails = isOperator || userRole === 'ADMIN' ? booking.experience.meetingDetails : booking.paymentStatus === 'PAID' ? booking.experience.meetingDetails : null;
    res.json({ success: true, data: { ...booking, experience: { ...booking.experience, meetingDetails } } });
  } catch (err) { next(err); }
});

// ─── POST /api/experience-bookings/:id/cancel ────────
router.post('/:id/cancel', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const userRole = (req as any).userRole;
    const booking = await prisma.experienceBooking.findUnique({ where: { id: req.params.id }, include: { experience: { include: { operator: true } } } });
    if (!booking) throw new AppError('Booking not found', 404);
    const isGuest = booking.guestId === userId;
    const isOperator = booking.experience.operator.userId === userId;
    if (!isGuest && !isOperator && userRole !== 'ADMIN') throw new AppError('Access denied', 403);
    if (['CANCELLED', 'COMPLETED'].includes(booking.status)) throw new AppError(`Cannot cancel a booking with status: ${booking.status}`, 400);

    const [updated] = await prisma.$transaction([
      prisma.experienceBooking.update({ where: { id: req.params.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: req.body.reason || null } }),
      prisma.experienceSlot.updateMany({ where: { id: booking.slotId, bookedCount: { gte: booking.guestCount } }, data: { bookedCount: { decrement: booking.guestCount } } })
    ]);

    logger.info(`Experience booking cancelled: ${booking.reference}`);
    const cancelledBy: 'GUEST' | 'OPERATOR' | 'SYSTEM' = isGuest ? 'GUEST' : isOperator ? 'OPERATOR' : 'SYSTEM';
    setImmediate(async () => {
      try {
        await dispatchWebhookEvent({ eventType: 'booking.cancelled', idempotencyKey: `booking.cancelled.${updated.id}`, data: { booking_id: updated.id, external_ref: booking.externalRef ?? null, cancellation_reason: req.body.reason || 'GUEST_REQUEST', cancellation_initiated_by: cancelledBy, cancelled_at: (updated.cancelledAt ?? new Date()).toISOString(), capacity_restoration_required: true } });
      } catch (dispatchErr) { logger.error('booking.cancelled dispatch error (non-fatal)', { bookingId: updated.id, error: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr) }); }
    });

    res.json({ success: true, data: updated, message: 'Booking cancelled successfully' });
  } catch (err) { next(err); }
});

export default router;
