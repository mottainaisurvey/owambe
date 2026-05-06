/**
 * ─── Coastal Corridor Inbound Channel Router ───────────────────────────────
 *
 * Handles inbound calls from Coastal Corridor to Owambe:
 *   - Flow 2: Stays Reservations (Coastal Corridor → Owambe)
 *   - Flow 4: Experiences Bookings (Coastal Corridor → Owambe)
 *   - Webhooks: Asynchronous event notifications
 *
 * Mounted at: /api/v1/channel
 *
 * Auth: HMAC-SHA256 signature verification on all inbound requests.
 *       Header: X-Signature: hmac-sha256=<hex-digest>
 *
 * API Contract: coastal-corridor-owambe-api.yaml v1.0.0
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';
import { verifyInboundSignature } from '../services/channels/adapters/coastal-corridor.adapter';
import { StayBookingStatus, ExperienceBookingStatus } from '@prisma/client';
import {
  notifyHostNewReservation,
  notifyHostReservationCancelled,
  notifyOperatorNewBooking,
} from '../services/notification.service';

const router = Router();

// ─── Raw Body Capture ─────────────────────────────────────────────────────
// Capture the raw request body bytes BEFORE any JSON parsing so that the
// HMAC verification middleware can compute the signature over the original
// wire bytes. This MUST be the first middleware on the router.
// Note: express.raw() leaves req.body as a Buffer; the body-parse middleware
// below converts it back to a plain object for route handlers.
router.use(express.raw({
  type: 'application/json',
  limit: '10mb',
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));

// ─── HMAC Signature Verification Middleware ────────────────────────────────

function verifyCoastalCorridorSignature(req: Request, res: Response, next: NextFunction): void {
  const signature = req.headers['x-signature'] as string | undefined;
  const secret = process.env.COASTAL_CORRIDOR_WEBHOOK_SECRET ?? process.env.COASTAL_CORRIDOR_SHARED_SECRET ?? '';

  if (!signature) {
    res.status(401).json({ error: 'MISSING_SIGNATURE', message: 'X-Signature header is required' });
    return;
  }

  // rawBody is set by express.raw() above — always use it for HMAC computation
  const rawBodyBuf = (req as Request & { rawBody?: Buffer }).rawBody;
  const rawBody = rawBodyBuf ? rawBodyBuf.toString('utf8') : '';

  if (!rawBody) {
    logger.warn('[Channel] Empty rawBody on inbound request — cannot verify signature', {
      path: req.path,
    });
    res.status(401).json({ error: 'INVALID_SIGNATURE', message: 'Request signature verification failed' });
    return;
  }

  if (!verifyInboundSignature(rawBody, signature, secret)) {
    logger.warn('[Channel] Invalid HMAC signature on inbound request', {
      path: req.path,
      requestId: req.headers['x-request-id'],
    });
    res.status(401).json({ error: 'INVALID_SIGNATURE', message: 'Request signature verification failed' });
    return;
  }

  next();
}

// Apply signature verification to all channel routes
router.use(verifyCoastalCorridorSignature);

// ─── Body Parsing Middleware ───────────────────────────────────────────────
// express.raw() above captures req.rawBody but leaves req.body as a Buffer.
// This middleware re-parses rawBody back into req.body so route handlers can
// destructure it normally.
router.use((req: Request, _res: Response, next: NextFunction) => {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (raw && Buffer.isBuffer(raw)) {
    try {
      req.body = JSON.parse(raw.toString('utf8'));
    } catch {
      // leave req.body as-is if parsing fails
    }
  }
  next();
});

// ─── FLOW 2: Stays Reservations ────────────────────────────────────────────

/**
 * POST /api/v1/channel/coastal-corridor/reservations
 *
 * Called by Coastal Corridor when a guest completes a reservation.
 * Owambe creates the reservation in the host's calendar and triggers
 * the host notification flow.
 *
 * Idempotent on coastalCorridorReservationId.
 * Returns 409 if dates are no longer available.
 */
router.post('/coastal-corridor/reservations', async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const {
    coastalCorridorReservationId,
    coastalCorridorPropertyId,
    owambeRoomId,
    guest,
    checkInDate,
    checkOutDate,
    numberOfGuests,
    totalAmount,
    currency,
    channelCommissionAmount,
    channelCommissionPercent,
    netToHost,
    specialRequests,
    paymentStatus,
    paystackReference,
  } = req.body;

  logger.info('[Channel] Inbound stays reservation', {
    coastalCorridorReservationId,
    owambeRoomId,
    checkInDate,
    checkOutDate,
    requestId,
  });

  try {
    // Idempotency check: return existing reservation if already processed
    const existing = await prisma.stayBooking.findFirst({
      where: { externalRef: coastalCorridorReservationId },
    });

    if (existing) {
      logger.info('[Channel] Idempotent reservation re-call', { coastalCorridorReservationId, existingId: existing.id });
      res.status(200).json({
        owambeReservationId: existing.id,
        coastalCorridorReservationId,
        status: existing.status,
        createdAt: existing.createdAt.toISOString(),
        hostNotified: true,
        contractGenerationStatus: 'PENDING',
      });
      return;
    }

    // Conflict check: verify dates are still available for the room
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    const conflictingBooking = await prisma.stayBooking.findFirst({
      where: {
        roomId: owambeRoomId,
        status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        OR: [
          { checkInDate: { lt: checkOut }, checkOutDate: { gt: checkIn } },
        ],
      },
    });

    if (conflictingBooking) {
      logger.warn('[Channel] Availability conflict for stays reservation', {
        coastalCorridorReservationId,
        owambeRoomId,
        conflictingBookingId: conflictingBooking.id,
      });
      res.status(409).json({
        error: 'AVAILABILITY_CONFLICT',
        message: 'Requested dates are no longer available',
        conflictingReservationId: conflictingBooking.id,
        conflictingChannelOrigin: conflictingBooking.channelOrigin ?? 'OWAMBE',
        resolution: 'Coastal Corridor must refund the guest and surface the conflict',
      });
      return;
    }

    // Find the room to get the property and host
    const room = await prisma.room.findUnique({
      where: { id: owambeRoomId },
      include: { property: { include: { host: true } } },
    });

    if (!room) {
      res.status(404).json({ error: 'ROOM_NOT_FOUND', message: `Room ${owambeRoomId} not found` });
      return;
    }

    // Compute nights between check-in and check-out
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    // Create the reservation in Owambe
    const reservation = await prisma.stayBooking.create({
      data: {
        reference: `CC-${coastalCorridorReservationId}`,
        propertyId: room.property.id,
        roomId: owambeRoomId,
        guestUserId: null, // Guest may not have an Owambe account
        guestName: `${guest.firstName} ${guest.lastName}`,
        guestEmail: guest.email,
        guestPhone: guest.phone ?? null,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        nights,
        numberOfGuests: numberOfGuests ?? null,
        totalAmount,
        currency,
        channelCommissionAmount: channelCommissionAmount ?? null,
        channelCommissionPercent: channelCommissionPercent ?? null,
        netToHost: netToHost ?? null,
        specialRequests: specialRequests ?? null,
        paymentStatus,
        paystackReference: paystackReference ?? null,
        status: StayBookingStatus.CONFIRMED,
        channelOrigin: 'COASTAL_CORRIDOR',
        externalRef: coastalCorridorReservationId,
        externalPropertyId: coastalCorridorPropertyId,
        depositAmount: 0,
      },
    });

    logger.info('[Channel] Stays reservation created', {
      owambeReservationId: reservation.id,
      coastalCorridorReservationId,
      hostId: room.property.hostId,
    });

    // Phase B: Trigger host notification (fire-and-forget)
    const host = room.property.host;
    const hostUser = await prisma.user.findUnique({ where: { id: host.userId } }).catch(() => null);
    if (hostUser?.email) {
      setImmediate(() =>
        notifyHostNewReservation({
          hostEmail: hostUser.email!,
          hostFirstName: hostUser.firstName ?? 'Host',
          propertyName: room.property.name,
          guestName: reservation.guestName,
          guestEmail: reservation.guestEmail,
          checkInDate: reservation.checkInDate,
          checkOutDate: reservation.checkOutDate,
          nights: reservation.nights,
          roomName: room.name,
          totalAmount: parseFloat(reservation.totalAmount.toString()),
          currency: reservation.currency,
          netToHost: reservation.netToHost ? parseFloat(reservation.netToHost.toString()) : null,
          channelCommissionPercent: reservation.channelCommissionPercent
            ? parseFloat(reservation.channelCommissionPercent.toString())
            : null,
          channelOrigin: reservation.channelOrigin ?? 'COASTAL_CORRIDOR',
          reservationReference: reservation.reference,
          reservationId: reservation.id,
          specialRequests: reservation.specialRequests,
        })
      );
    }

    // TODO: Trigger contract generation — Phase C contract service
    // await contractService.generateBookingContract(reservation);

    res.status(201).json({
      owambeReservationId: reservation.id,
      coastalCorridorReservationId,
      status: reservation.status,
      createdAt: reservation.createdAt.toISOString(),
      hostNotified: !!hostUser?.email,
      contractGenerationStatus: 'PENDING',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('[Channel] Error creating stays reservation', { error: msg, coastalCorridorReservationId });
    // DEBUG: Expose error detail temporarily for staging diagnosis
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to create reservation', requestId, debug: process.env.NODE_ENV !== 'production' ? msg : undefined });
  }
});

/**
 * PATCH /api/v1/channel/coastal-corridor/reservations/:coastalCorridorReservationId
 *
 * Called by Coastal Corridor when reservation status changes.
 */
router.patch('/coastal-corridor/reservations/:coastalCorridorReservationId', async (req: Request, res: Response): Promise<void> => {
  const { coastalCorridorReservationId } = req.params;
  const { status, cancellationReason, cancellationInitiatedBy, refundAmount, refundCurrency } = req.body;

  logger.info('[Channel] Reservation status update', { coastalCorridorReservationId, status });

  try {
    const reservation = await prisma.stayBooking.findFirst({
      where: { externalRef: coastalCorridorReservationId },
    });

    if (!reservation) {
      res.status(404).json({ error: 'RESERVATION_NOT_FOUND', message: `Reservation ${coastalCorridorReservationId} not found` });
      return;
    }

    // Map Coastal Corridor status to Owambe status
    const statusMap: Record<string, string> = {
      CONFIRMED: 'CONFIRMED',
      CHECKED_IN: 'CHECKED_IN',
      CHECKED_OUT: 'CHECKED_OUT',
      CANCELLED: 'CANCELLED',
      NO_SHOW: 'NO_SHOW',
    };

    const owambeStatus = statusMap[status] as StayBookingStatus | undefined;
    if (!owambeStatus) {
      res.status(409).json({ error: 'INVALID_STATUS_TRANSITION', message: `Unknown status: ${status}` });
      return;
    }

    const updated = await prisma.stayBooking.update({
      where: { id: reservation.id },
      data: {
        status: owambeStatus,
        cancellationReason: cancellationReason ?? null,
        cancelledBy: cancellationInitiatedBy ?? null,
        refundAmount: refundAmount ?? null,
        refundCurrency: refundCurrency ?? null,
        ...(owambeStatus === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
        ...(owambeStatus === 'CHECKED_IN' ? { checkedInAt: new Date() } : {}),
        ...(owambeStatus === 'CHECKED_OUT' ? { checkedOutAt: new Date() } : {}),
      },
    });

    res.status(200).json({
      owambeReservationId: updated.id,
      coastalCorridorReservationId,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      hostNotified: false,
      contractGenerationStatus: 'PENDING',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('[Channel] Error updating reservation status', { error: msg, coastalCorridorReservationId });
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update reservation status' });
  }
});

// ─── FLOW 4: Experiences Bookings ──────────────────────────────────────────

/**
 * POST /api/v1/channel/experiences/bookings
 *
 * Called by Coastal Corridor when a participant completes a booking.
 * Owambe creates the booking, decrements time slot capacity, and
 * triggers the operator notification flow.
 *
 * Idempotent on coastalCorridorBookingId.
 * Returns 409 if time slot is full or unavailable.
 */
router.post('/experiences/bookings', async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const {
    coastalCorridorBookingId,
    coastalCorridorExperienceId,
    owambeTimeSlotId,
    leadParticipant,
    numberOfParticipants,
    participantNames,
    totalAmount,
    currency,
    channelCommissionAmount,
    channelCommissionPercent,
    netToOperator,
    specialRequirements,
    pickupRequested,
    pickupAddress,
    paymentStatus,
    paystackReference,
  } = req.body;

  logger.info('[Channel] Inbound experience booking', {
    coastalCorridorBookingId,
    owambeTimeSlotId,
    numberOfParticipants,
    requestId,
  });

  try {
    // Idempotency check
    const existing = await prisma.experienceBooking.findFirst({
      where: { externalRef: coastalCorridorBookingId },
    });

    if (existing) {
      logger.info('[Channel] Idempotent experience booking re-call', { coastalCorridorBookingId, existingId: existing.id });
      res.status(200).json({
        owambeBookingId: existing.id,
        coastalCorridorBookingId,
        status: existing.status,
        createdAt: existing.createdAt.toISOString(),
        operatorNotified: true,
      });
      return;
    }

    // Check time slot capacity
    const slot = await prisma.experienceSlot.findUnique({
      where: { id: owambeTimeSlotId },
      include: { experience: { include: { operator: true } } },
    });

    if (!slot) {
      res.status(404).json({ error: 'SLOT_NOT_FOUND', message: `Time slot ${owambeTimeSlotId} not found` });
      return;
    }

    const currentBookedCount = await prisma.experienceBooking.aggregate({
      where: { slotId: owambeTimeSlotId, status: { in: [ExperienceBookingStatus.CONFIRMED] } },
      _sum: { numberOfParticipants: true },
    });

    const bookedCount = currentBookedCount._sum?.numberOfParticipants ?? 0;
    const availableSpots = slot.capacity - bookedCount;

    if (availableSpots < numberOfParticipants) {
      logger.warn('[Channel] Experience time slot full', {
        coastalCorridorBookingId,
        owambeTimeSlotId,
        availableSpots,
        requested: numberOfParticipants,
      });
      res.status(409).json({
        error: 'SLOT_FULL',
        message: `Time slot has only ${availableSpots} spots available, but ${numberOfParticipants} were requested`,
        resolution: 'Coastal Corridor must refund the participant and surface the conflict',
      });
      return;
    }

    // Create the booking in Owambe
    const booking = await prisma.experienceBooking.create({
      data: {
        reference: `CC-${coastalCorridorBookingId}`,
        experienceId: slot.experienceId,
        slotId: owambeTimeSlotId,
        guestUserId: null, // Participant may not have an Owambe account
        guestName: `${leadParticipant.firstName} ${leadParticipant.lastName}`,
        guestEmail: leadParticipant.email,
        guestPhone: leadParticipant.phone ?? null,
        numberOfParticipants,
        participantNames: participantNames ?? [],
        totalAmount,
        currency,
        channelCommissionAmount: channelCommissionAmount ?? null,
        channelCommissionPercent: channelCommissionPercent ?? null,
        netToOperator: netToOperator ?? null,
        specialRequests: specialRequirements ?? null,
        pickupRequested: pickupRequested ?? false,
        pickupAddress: pickupAddress ?? null,
        paymentStatus,
        paystackReference: paystackReference ?? null,
        status: 'CONFIRMED',
        channelOrigin: 'COASTAL_CORRIDOR',
        externalRef: coastalCorridorBookingId,
        externalExperienceId: coastalCorridorExperienceId,
        depositAmount: 0,
      },
    });

    logger.info('[Channel] Experience booking created', {
      owambeBookingId: booking.id,
      coastalCorridorBookingId,
      operatorId: slot.experience.operatorId,
    });

    // Phase B: Trigger operator notification (fire-and-forget)
    const operatorUser = await prisma.user.findUnique({ where: { id: slot.experience.operator.userId } }).catch(() => null);
    if (operatorUser?.email) {
      const slotDate = slot.startTime ? new Date(slot.startTime) : new Date();
      const slotTime = slot.startTime
        ? new Date(slot.startTime).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
        : 'TBC';
      setImmediate(() =>
        notifyOperatorNewBooking({
          operatorEmail: operatorUser.email!,
          operatorFirstName: operatorUser.firstName ?? 'Operator',
          experienceName: slot.experience.name,
          leadParticipantName: booking.guestName,
          leadParticipantEmail: booking.guestEmail,
          slotDate,
          slotTime,
          numberOfParticipants: booking.numberOfParticipants,
          totalAmount: parseFloat(booking.totalAmount.toString()),
          currency: booking.currency,
          netToOperator: booking.netToOperator ? parseFloat(booking.netToOperator.toString()) : null,
          channelCommissionPercent: booking.channelCommissionPercent
            ? parseFloat(booking.channelCommissionPercent.toString())
            : null,
          channelOrigin: booking.channelOrigin ?? 'COASTAL_CORRIDOR',
          bookingReference: booking.reference,
          bookingId: booking.id,
          specialRequirements: booking.specialRequests,
          pickupRequested: booking.pickupRequested,
          pickupAddress: booking.pickupAddress,
        })
      );
    }

    res.status(201).json({
      owambeBookingId: booking.id,
      coastalCorridorBookingId,
      status: booking.status,
      createdAt: booking.createdAt.toISOString(),
      operatorNotified: !!operatorUser?.email,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('[Channel] Error creating experience booking', { error: msg, coastalCorridorBookingId });
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to create booking', requestId });
  }
});

// ─── Webhooks ──────────────────────────────────────────────────────────────

/**
 * POST /api/v1/channel/webhooks/inbound
 *
 * Receives asynchronous event notifications from Coastal Corridor.
 * Signature already verified by the middleware above.
 */
router.post('/webhooks/inbound', async (req: Request, res: Response): Promise<void> => {
  const { eventType, eventId, timestamp, data } = req.body;

  logger.info('[Channel] Inbound webhook', { eventType, eventId, timestamp });

  try {
    switch (eventType) {
      case 'reservation.cancelled':
        // TODO Phase B: Handle reservation cancellation initiated by Coastal Corridor
        logger.info('[Channel] Webhook: reservation.cancelled', { data });
        break;

      case 'reservation.no_show':
        // TODO Phase B: Handle no-show recording
        logger.info('[Channel] Webhook: reservation.no_show', { data });
        break;

      case 'reservation.guest_checked_in':
        // TODO Phase B: Handle check-in confirmation
        logger.info('[Channel] Webhook: reservation.guest_checked_in', { data });
        break;

      case 'reservation.guest_checked_out':
        // TODO Phase B: Handle check-out confirmation and trigger payout
        logger.info('[Channel] Webhook: reservation.guest_checked_out', { data });
        break;

      case 'reservation.refunded':
        // TODO Phase B: Handle refund confirmation
        logger.info('[Channel] Webhook: reservation.refunded', { data });
        break;

      case 'booking.cancelled':
        // TODO Phase B: Handle experience booking cancellation
        logger.info('[Channel] Webhook: booking.cancelled', { data });
        break;

      case 'booking.completed':
        // TODO Phase B: Handle experience booking completion and trigger payout
        logger.info('[Channel] Webhook: booking.completed', { data });
        break;

      case 'booking.refunded':
        // TODO Phase B: Handle experience booking refund
        logger.info('[Channel] Webhook: booking.refunded', { data });
        break;

      case 'property.deactivated':
        // TODO Phase B: Handle property deactivation notification from CC
        logger.info('[Channel] Webhook: property.deactivated', { data });
        break;

      case 'experience.deactivated':
        // TODO Phase B: Handle experience deactivation notification from CC
        logger.info('[Channel] Webhook: experience.deactivated', { data });
        break;

      case 'reconciliation.requested':
        // TODO Phase B: Trigger reconciliation snapshot generation
        logger.info('[Channel] Webhook: reconciliation.requested', { data });
        break;

      default:
        logger.warn('[Channel] Unrecognised webhook event type', { eventType, eventId });
        res.status(422).json({ error: 'UNRECOGNISED_EVENT', message: `Unknown event type: ${eventType}` });
        return;
    }

    res.status(200).json({ acknowledged: true, eventId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('[Channel] Error processing webhook', { error: msg, eventType, eventId });
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to process webhook' });
  }
});

export default router;
