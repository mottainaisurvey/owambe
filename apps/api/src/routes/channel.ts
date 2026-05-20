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
 *       CC → Owambe: x-cc-signature (HMAC-SHA256 of timestamp.body), x-cc-timestamp, x-idempotency-key
 *       Owambe → CC: x-owambe-signature (HMAC-SHA256 of timestamp.body), x-owambe-timestamp, x-idempotency-key
 *
 * Field naming: CC sends all payload fields in snake_case + flat structure.
 *   e.g. owambe_room_id, check_in_date, guest_first_name, total_amount, etc.
 *   Internal variables use camelCase after destructuring.
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
import { cacheGet, cacheSet } from '../services/cache.service';
import { channelRateLimiter } from '../middleware/channelRateLimiter';
import { dispatchWebhookEvent } from '../services/webhookDispatcher.service';
import { dispatchReconciliationNow } from '../services/reconciliation.service';
import { validatePaymentStatusTransition, CanonicalPaymentStatus, PAYMENT_STATUS_TRANSITIONS } from '../utils/paymentStatusTransitions';

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
  // CC signs outbound webhooks with x-cc-signature and x-cc-timestamp (symmetric naming: signer's name in header)
  const signature = req.headers['x-cc-signature'] as string | undefined;
  const timestamp = req.headers['x-cc-timestamp'] as string | undefined;
  const secret = process.env.COASTAL_CORRIDOR_WEBHOOK_SECRET ?? process.env.COASTAL_CORRIDOR_SHARED_SECRET ?? '';

  if (!signature || !timestamp) {
    res.status(401).json({
      error: 'MISSING_SIGNATURE',
      message: 'x-cc-signature and x-cc-timestamp headers are required',
    });
    return;
  }

  // rawBody is set by express.raw() above — always use it for HMAC computation.
  // For empty-body requests (e.g. GET), rawBody is an empty string; the signed
  // message is {timestamp}.{empty-string} = "{timestamp}." which matches the
  // CC-side signing convention. Do NOT reject empty bodies before verification.
  const rawBodyBuf = (req as Request & { rawBody?: Buffer }).rawBody;
  const rawBody = rawBodyBuf ? rawBodyBuf.toString('utf8') : '';

  // OWB-FIX-02: removed empty-body early-return guard (was lines 68-74).
  // The HMAC verifier handles empty strings correctly.

  if (!verifyInboundSignature(rawBody, signature, secret, timestamp)) {
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

// ─── OWB-WAVE-4-04: Per-channel-partner rate limiting ────────────────────────
// Applied after HMAC verification (partner identity derived from x-cc-signature)
// and after body parsing. Limits: RESERVATION 60/min, AVAILABILITY 100/min,
// WEBHOOK 120/min, RECONCILIATION 10/hr — each per channel partner.
router.use(channelRateLimiter());

// ─── FLOW 2: Stays Reservations ────────────────────────────────────────────

/**
 * POST /api/v1/channel/coastal-corridor/reservations
 *
 * Called by Coastal Corridor when a guest completes a reservation.
 * Owambe creates the reservation in the host's calendar and triggers
 * the host notification flow.
 *
 * Idempotent on cc_reservation_id.
 * Returns 409 if dates are no longer available.
 *
 * CC sends snake_case fields:
 *   cc_reservation_id, owambe_property_id, owambe_room_id,
 *   guest_first_name, guest_last_name, guest_email, guest_phone,
 *   check_in_date, check_out_date, number_of_guests,
 *   total_amount, currency, channel_commission_amount,
 *   channel_commission_percent, net_to_host, special_requests,
 *   payment_status, paystack_reference
 */
// PAY-CANONICAL-01-OWB-FIX-PATHS-CLEANUP Phase B: removed legacy /coastal-corridor/reservations
// and Phase-1-misfire /coastal-corridor/stays/reservations paths. Only canonical path remains.
// Amendment 007 (12 May 2026) — deployed code now matches contract v1.3.
router.post('/stays/reservations', async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';

  // Destructure snake_case fields from CC's payload and alias to camelCase internal variables
  const {
    cc_reservation_id: coastalCorridorReservationId,
    owambe_property_id: coastalCorridorPropertyId,
    // ccPropertyId is scaffolded for the CC->Owambe inbound reservation flow.
    // The CC originator (CC outbound stays-reservation sender) is not yet built --
    // verified during OWB-WAVE-4-01 joint window cycle (CC Path 2 stays/reservations
    // PATCH is scaffolded constant-only with no caller built per Brief 3 finding
    // 19 May 2026). This field stays null in practice until CC ships its outbound
    // sender. Symmetric CC-side documentation: commit 858e31f on CC repo.
    cc_property_id: ccPropertyId,
    owambe_room_id: owambeRoomId,
    // Guest fields — CC sends flat snake_case (guest_first_name etc.) or nested guest object
    // Support both forms for forward compatibility
    guest,
    guest_first_name,
    guest_last_name,
    guest_email,
    guest_phone,
    check_in_date: checkInDate,
    check_out_date: checkOutDate,
    number_of_guests: numberOfGuests,
    total_amount: totalAmount,
    deposit_amount: depositAmount,
    currency,
    channel_commission_amount: channelCommissionAmount,
    channel_commission_percent: channelCommissionPercent,
    net_to_host: netToHost,
    special_requests: specialRequests,
    payment_status: paymentStatus,
    paystack_reference: paystackReference,
  } = req.body;

  // Normalise guest fields — support both flat and nested forms
  const guestFirstName: string = guest_first_name ?? guest?.first_name ?? guest?.firstName ?? '';
  const guestLastName: string = guest_last_name ?? guest?.last_name ?? guest?.lastName ?? '';
  const guestEmail: string = guest_email ?? guest?.email ?? '';
  const guestPhone: string | null = guest_phone ?? guest?.phone ?? null;

  // Validate required fields — reject early to prevent CC-undefined references
  if (!coastalCorridorReservationId || !owambeRoomId || !checkInDate || !checkOutDate) {
    res.status(400).json({
      error: 'MISSING_REQUIRED_FIELDS',
      message: 'cc_reservation_id, owambe_room_id, check_in_date, and check_out_date are required',
    });
    return;
  }

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
        owambe_reservation_id: existing.id,
        cc_reservation_id: coastalCorridorReservationId,
        status: existing.status,
        created_at: existing.createdAt.toISOString(),
        host_notified: true,
        contract_generation_status: 'PENDING',
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
        conflicting_reservation_id: conflictingBooking.id,
        conflicting_channel_origin: conflictingBooking.channelOrigin ?? 'OWAMBE',
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

    // ─── OWB-C-08: Commission validation and computation ─────────────────────
    // Determine the host's cohort status to apply the correct commission rate.
    // Cohort hosts (COASTAL_CORRIDOR_HOST): 12% commission.
    // Standard hosts: 15% commission.
    // CC-provided values are accepted as the source of truth but cross-checked
    // against the computed values; discrepancies are flagged in the audit log.
    const hostUser = await prisma.user.findUnique({ where: { id: room.property.host.userId } }).catch(() => null);
    const isCohortHost = hostUser?.cohortMember === true &&
      (hostUser?.cohortType === 'COASTAL_CORRIDOR_HOST' || hostUser?.cohortType === 'BOTH');
    const expectedCommissionRate = isCohortHost ? 12 : 15;
    const parsedTotalAmount = parseFloat(totalAmount?.toString() ?? '0');
    const computedCommissionAmount = Math.round(parsedTotalAmount * expectedCommissionRate) / 100;
    const computedNetToHost = Math.round((parsedTotalAmount - computedCommissionAmount) * 100) / 100;

    // Use CC-provided values if present; fall back to computed values.
    const finalCommissionAmount = channelCommissionAmount != null
      ? parseFloat(channelCommissionAmount.toString())
      : computedCommissionAmount;
    const finalCommissionPercent = channelCommissionPercent != null
      ? parseFloat(channelCommissionPercent.toString())
      : expectedCommissionRate;
    const finalNetToHost = netToHost != null
      ? parseFloat(netToHost.toString())
      : computedNetToHost;

    // Detect discrepancy: CC-provided rate differs from expected by more than 0.5%
    const ccRate = channelCommissionPercent != null ? parseFloat(channelCommissionPercent.toString()) : null;
    const hasDiscrepancy = ccRate !== null && Math.abs(ccRate - expectedCommissionRate) > 0.5;
    const discrepancyNote = hasDiscrepancy
      ? `CC provided ${ccRate}% commission; expected ${expectedCommissionRate}% for ${isCohortHost ? 'cohort' : 'standard'} host`
      : null;

    const rateSource = channelCommissionPercent != null ? 'CC_PROVIDED' :
      (isCohortHost ? 'COHORT_COMPUTED' : 'STANDARD_COMPUTED');

    logger.info('[Channel] Commission computed', {
      coastalCorridorReservationId,
      isCohortHost,
      expectedCommissionRate,
      finalCommissionPercent,
      finalCommissionAmount,
      finalNetToHost,
      hasDiscrepancy,
      rateSource,
    });
    // ─────────────────────────────────────────────────────────────────────────

    // Create the reservation in Owambe
    const reservation = await prisma.stayBooking.create({
      data: {
        reference: `CC-${coastalCorridorReservationId}`,
        propertyId: room.property.id,
        roomId: owambeRoomId,
        guestUserId: null, // Guest may not have an Owambe account
        guestName: `${guestFirstName} ${guestLastName}`.trim(),
        guestEmail,
        guestPhone,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        nights,
        numberOfGuests: numberOfGuests ?? null,
        totalAmount,
        currency,
        channelCommissionAmount: finalCommissionAmount,
        channelCommissionPercent: finalCommissionPercent,
        netToHost: finalNetToHost,
        specialRequests: specialRequests ?? null,
        paymentStatus,
        paystackReference: paystackReference ?? null,
        status: StayBookingStatus.CONFIRMED,
        channelOrigin: 'COASTAL_CORRIDOR',
        externalRef: coastalCorridorReservationId,
        externalPropertyId: coastalCorridorPropertyId,
        ccPropertyId: ccPropertyId ?? null,
        depositAmount: depositAmount != null ? parseFloat(depositAmount.toString()) : 0,
      },
    });

    // ─── OWB-C-08: Create commission audit log entry ──────────────────────────
    await prisma.commissionAuditLog.create({
      data: {
        stayBookingId: reservation.id,
        reservationReference: reservation.reference,
        channelOrigin: 'COASTAL_CORRIDOR',
        totalAmount: parsedTotalAmount,
        currency: currency ?? 'NGN',
        cohortMember: isCohortHost,
        cohortType: hostUser?.cohortType ?? null,
        appliedCommissionRate: finalCommissionPercent,
        rateSource,
        channelCommissionAmount: finalCommissionAmount,
        channelCommissionPercent: finalCommissionPercent,
        netToHost: finalNetToHost,
        ccProvidedCommissionAmount: channelCommissionAmount != null ? parseFloat(channelCommissionAmount.toString()) : null,
        ccProvidedCommissionPercent: ccRate,
        ccProvidedNetToHost: netToHost != null ? parseFloat(netToHost.toString()) : null,
        hasDiscrepancy,
        discrepancyNote,
      },
    });
    // ─────────────────────────────────────────────────────────────────────────

    logger.info('[Channel] Stays reservation created', {
      owambeReservationId: reservation.id,
      coastalCorridorReservationId,
      hostId: room.property.hostId,
    });

    // Phase B: Trigger host notification (fire-and-forget)
    // hostUser was already fetched above for commission computation
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
      owambe_reservation_id: reservation.id,
      cc_reservation_id: coastalCorridorReservationId,
      status: reservation.status,
      created_at: reservation.createdAt.toISOString(),
      host_notified: !!hostUser?.email,
      contract_generation_status: 'PENDING',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('[Channel] Error creating stays reservation', { error: msg, coastalCorridorReservationId });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to create reservation',
      requestId,
      debug: process.env.NODE_ENV !== 'production' ? msg : undefined,
    });
  }
});

/**
 * PATCH /api/v1/channel/coastal-corridor/reservations/:cc_reservation_id
 *
 * Called by Coastal Corridor when reservation status changes.
 *
 * CC sends snake_case fields:
 *   status, cancellation_reason, cancellation_initiated_by,
 *   refund_amount, refund_currency, updated_at
 */
// PAY-CANONICAL-01-OWB-FIX-PATHS-CLEANUP Phase B: removed legacy /coastal-corridor/reservations/:cc_reservation_id
// and Phase-1-misfire /coastal-corridor/stays/reservations/:cc_reservation_id paths. Only canonical path remains.
router.patch('/stays/reservations/:cc_reservation_id', async (req: Request, res: Response): Promise<void> => {
  const { cc_reservation_id: coastalCorridorReservationId } = req.params;
  const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
  const {
    status,
    payment_status: incomingPaymentStatus,
    cancellation_reason: cancellationReason,
    cancellation_initiated_by: cancellationInitiatedBy,
    refund_amount: refundAmount,
    refund_currency: refundCurrency,
  } = req.body;

  logger.info('[Channel] Reservation status update', { coastalCorridorReservationId, status, idempotencyKey });

  try {
    // OWB-C-04 AC-6: Idempotency — return cached response if this key was already processed
    if (idempotencyKey) {
      const cached = await cacheGet<object>(`idempotency:patch:${idempotencyKey}`);
      if (cached) {
        logger.info('[Channel] Idempotent PATCH re-call — returning cached response', { idempotencyKey, coastalCorridorReservationId });
        res.status(200).json(cached);
        return;
      }
    }

    const reservation = await prisma.stayBooking.findFirst({
      where: { externalRef: coastalCorridorReservationId },
      include: { room: { include: { property: { include: { host: true } } } } },
    });

    if (!reservation) {
      res.status(404).json({ error: 'RESERVATION_NOT_FOUND', message: `Reservation ${coastalCorridorReservationId} not found` });
      return;
    }

    // Map Coastal Corridor status to Owambe status
    const statusMap: Record<string, StayBookingStatus> = {
      CONFIRMED: StayBookingStatus.CONFIRMED,
      CHECKED_IN: StayBookingStatus.CHECKED_IN,
      CHECKED_OUT: StayBookingStatus.CHECKED_OUT,
      CANCELLED: StayBookingStatus.CANCELLED,
      NO_SHOW: StayBookingStatus.NO_SHOW,
    };

    const owambeStatus = statusMap[status];
    if (!owambeStatus) {
      res.status(422).json({ error: 'UNKNOWN_STATUS', message: `Unknown status: ${status}` });
      return;
    }

    // OWB-C-04: Invalid transition guard.
    // Terminal states (CANCELLED, NO_SHOW, CHECKED_OUT) cannot be re-entered
    // or reversed. CHECKED_IN can only follow CONFIRMED.
    const validTransitions: Record<StayBookingStatus, StayBookingStatus[]> = {
      [StayBookingStatus.PENDING]:     [StayBookingStatus.CONFIRMED, StayBookingStatus.CANCELLED],
      [StayBookingStatus.CONFIRMED]:   [StayBookingStatus.CHECKED_IN, StayBookingStatus.CANCELLED, StayBookingStatus.NO_SHOW],
      [StayBookingStatus.CHECKED_IN]:  [StayBookingStatus.CHECKED_OUT, StayBookingStatus.CANCELLED],
      [StayBookingStatus.CHECKED_OUT]: [StayBookingStatus.REFUNDED],
      [StayBookingStatus.CANCELLED]:   [StayBookingStatus.REFUNDED],
      [StayBookingStatus.NO_SHOW]:     [],
      [StayBookingStatus.REFUNDED]:    [],
    };

    const allowed = validTransitions[reservation.status] ?? [];
    if (!allowed.includes(owambeStatus)) {
      res.status(409).json({
        error: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from ${reservation.status} to ${owambeStatus}`,
        current_status: reservation.status,
        requested_status: owambeStatus,
        allowed_transitions: allowed,
      });
      return;
    }

    // PAY-CANONICAL-01-OWB-FIX-FIELDS AC-1b: Explicit PaymentStatus enum validation.
    // If payment_status is present, validate it is a canonical value BEFORE
    // attempting the transition guard. An unrecognised value returns 400 (schema
    // validation error), not 422 (transition error).
    let newPaymentStatus: string | undefined = incomingPaymentStatus;
    if (newPaymentStatus) {
      const canonicalValues = Object.keys(PAYMENT_STATUS_TRANSITIONS) as CanonicalPaymentStatus[];
      if (!canonicalValues.includes(newPaymentStatus as CanonicalPaymentStatus)) {
        res.status(400).json({
          error: 'invalid_payment_status_value',
          field: 'payment_status',
          received: newPaymentStatus,
          allowed: canonicalValues,
          message: `payment_status must be one of: ${canonicalValues.join(', ')}`,
        });
        return;
      }

      // PAY-CANONICAL-01-OWB AC-3: PaymentStatus transition guard
      const paymentTransitionError = validatePaymentStatusTransition(
        reservation.paymentStatus as string,
        newPaymentStatus,
      );
      if (paymentTransitionError) {
        res.status(422).json(paymentTransitionError);
        return;
      }
    }

    // PAY-CANONICAL-01-OWB-FIX-REFUND-VALIDATION: Reject refund_amount that exceeds
    // the amount implied by the prior paymentStatus. Without this guard, an operator
    // or fraud vector could persist refund_amount=999999 on an 80,000 NGN reservation,
    // causing reconciliation chaos or downstream Paystack over-refund attempts.
    if (
      owambeStatus === StayBookingStatus.CANCELLED &&
      refundAmount !== undefined &&
      refundAmount !== null
    ) {
      const priorPaymentStatus = reservation.paymentStatus as string;
      let paidAmount: number;
      if (priorPaymentStatus === 'PENDING') {
        paidAmount = 0;
      } else if (priorPaymentStatus === 'DEPOSIT_PAID') {
        paidAmount = Number(reservation.depositAmount);
      } else if (priorPaymentStatus === 'PAID') {
        paidAmount = Number(reservation.totalAmount);
      } else {
        // PARTIALLY_PAID or other — cap at totalAmount (conservative upper bound)
        paidAmount = Number(reservation.totalAmount);
      }
      const requestedRefund = Number(refundAmount);
      if (requestedRefund > paidAmount) {
        res.status(422).json({
          error: 'INVALID_REFUND_AMOUNT',
          message: `refund_amount (${requestedRefund}) exceeds the amount paid (${paidAmount}) for payment_status ${priorPaymentStatus}`,
          refund_amount_received: requestedRefund,
          paid_amount: paidAmount,
          prior_payment_status: priorPaymentStatus,
        });
        return;
      }
    }

    const updated = await prisma.stayBooking.update({
      where: { id: reservation.id },
      data: {
        status: owambeStatus,
        ...(newPaymentStatus ? { paymentStatus: newPaymentStatus as any } : {}),
        cancellationReason: cancellationReason ?? null,
        cancelledBy: cancellationInitiatedBy ?? null,
        refundAmount: refundAmount ?? null,
        refundCurrency: refundCurrency ?? null,
        ...(owambeStatus === StayBookingStatus.CANCELLED ? { cancelledAt: new Date() } : {}),
        ...(owambeStatus === StayBookingStatus.CHECKED_IN ? { checkedInAt: new Date() } : {}),
        ...(owambeStatus === StayBookingStatus.CHECKED_OUT ? { checkedOutAt: new Date() } : {}),
      },
    });

    // OWB-C-04: Side effects per status transition.
    let hostNotified = false;
    const hostUser = reservation.room?.property?.host
      ? await prisma.user.findUnique({ where: { id: reservation.room.property.host.userId } }).catch(() => null)
      : null;

    // CHECKED_IN: mark calendar entries as BOOKED for the reservation's date range
    if (owambeStatus === StayBookingStatus.CHECKED_IN && reservation.roomId) {
      setImmediate(async () => {
        try {
          await prisma.calendarEntry.updateMany({
            where: {
              roomId: reservation.roomId!,
              date: { gte: reservation.checkInDate, lt: reservation.checkOutDate },
            },
            data: { status: 'BOOKED' },
          });
          logger.info('[Channel] Calendar entries marked BOOKED on CHECKED_IN', {
            reservationId: reservation.id,
            roomId: reservation.roomId,
          });
        } catch (calErr) {
          logger.error('[Channel] Failed to mark calendar entries BOOKED', {
            reservationId: reservation.id,
            error: calErr instanceof Error ? calErr.message : String(calErr),
          });
        }
      });
    }

    // CHECKED_OUT: release calendar entries back to AVAILABLE
    if (owambeStatus === StayBookingStatus.CHECKED_OUT && reservation.roomId) {
      setImmediate(async () => {
        try {
          await prisma.calendarEntry.updateMany({
            where: {
              roomId: reservation.roomId!,
              date: { gte: reservation.checkInDate, lt: reservation.checkOutDate },
              status: 'BOOKED',
            },
            data: { status: 'AVAILABLE' },
          });
          logger.info('[Channel] Calendar entries released to AVAILABLE on CHECKED_OUT', {
            reservationId: reservation.id,
            roomId: reservation.roomId,
          });
        } catch (calErr) {
          logger.error('[Channel] Failed to release calendar entries', {
            reservationId: reservation.id,
            error: calErr instanceof Error ? calErr.message : String(calErr),
          });
        }
      });
    }

    // NO_SHOW: mark calendar entries as BLOCKED for the reservation's date range
    // Amendment 003: pre-checkin NO_SHOW must block dates to prevent double-booking.
    // Without this block, dates remain in their prior state (typically AVAILABLE),
    // creating a double-booking window. OWB-FIX-CALENDAR.
    if (owambeStatus === StayBookingStatus.NO_SHOW && reservation.roomId) {
      setImmediate(async () => {
        try {
          await prisma.calendarEntry.updateMany({
            where: {
              roomId: reservation.roomId!,
              date: { gte: reservation.checkInDate, lt: reservation.checkOutDate },
            },
            data: { status: 'BLOCKED' },
          });
          logger.info('[Channel] Calendar entries marked BLOCKED on NO_SHOW', {
            reservationId: reservation.id,
            roomId: reservation.roomId,
          });
        } catch (calErr) {
          logger.error('[Channel] Failed to mark calendar entries BLOCKED on NO_SHOW', {
            reservationId: reservation.id,
            error: calErr instanceof Error ? calErr.message : String(calErr),
          });
        }
      });
    }

    // CANCELLED: notify host and release calendar entries
    if (owambeStatus === StayBookingStatus.CANCELLED) {
      // Release calendar entries
      if (reservation.roomId) {
        setImmediate(async () => {
          try {
            await prisma.calendarEntry.updateMany({
              where: {
                roomId: reservation.roomId!,
                date: { gte: reservation.checkInDate, lt: reservation.checkOutDate },
                status: { in: ['BOOKED', 'BLOCKED'] },
              },
              data: { status: 'AVAILABLE' },
            });
            logger.info('[Channel] Calendar entries released on CANCELLED', { reservationId: reservation.id });
          } catch (calErr) {
            logger.error('[Channel] Failed to release calendar entries on CANCELLED', {
              reservationId: reservation.id,
              error: calErr instanceof Error ? calErr.message : String(calErr),
            });
          }
        });
      }

      // Notify host
      if (hostUser?.email) {
        hostNotified = true;
        setImmediate(() =>
          notifyHostReservationCancelled(
            hostUser.email!,
            hostUser.firstName ?? 'Host',
            reservation.room?.property?.name ?? 'your property',
            reservation.guestName,
            reservation.reference,
            reservation.id,
            cancellationReason ?? null,
            cancellationInitiatedBy ?? null,
          )
        );
      }
    }

    logger.info('[Channel] Reservation status updated', {
      reservationId: updated.id,
      from: reservation.status,
      to: updated.status,
      coastalCorridorReservationId,
    });

    const responseBody = {
      owambe_reservation_id: updated.id,
      cc_reservation_id: coastalCorridorReservationId,
      status: updated.status,
      previous_status: reservation.status,
      created_at: updated.createdAt.toISOString(),
      host_notified: hostNotified,
      contract_generation_status: 'PENDING',
    };

    // Cache the response under the idempotency key (24h TTL)
    if (idempotencyKey) {
      await cacheSet(`idempotency:patch:${idempotencyKey}`, responseBody, 86400);
    }

    // OWB-WAVE-4-01: Dispatch outbound webhook event to CC for status transitions.
    // Fired asynchronously so the response is not delayed by delivery latency.
    setImmediate(async () => {
      try {
        // Map Owambe status to the appropriate CC event type
        const eventTypeMap: Partial<Record<string, string>> = {
          CHECKED_IN:  'reservation.checked_in',
          CHECKED_OUT: 'reservation.checked_out',
          CANCELLED:   'reservation.cancelled',
          NO_SHOW:     'reservation.no_show',
        };
        const webhookEventType = eventTypeMap[updated.status];
        if (webhookEventType) {
          await dispatchWebhookEvent({
            eventType: webhookEventType as any,
            data: {
              reservation_id: coastalCorridorReservationId,
              owambe_reservation_id: updated.id,
              previous_status: reservation.status,
              new_status: updated.status,
              payment_status: updated.paymentStatus,
              cancellation_reason: cancellationReason ?? null,
              cancelled_by: cancellationInitiatedBy ?? null,
              refund_amount: refundAmount ?? null,
              refund_currency: refundCurrency ?? null,
            },
          });
        } else {
          // CONFIRMED / other transitions: emit generic status_changed
          await dispatchWebhookEvent({
            eventType: 'reservation.status_changed',
            data: {
              reservation_id: coastalCorridorReservationId,
              owambe_reservation_id: updated.id,
              previous_status: reservation.status,
              new_status: updated.status,
              payment_status: updated.paymentStatus,
            },
          });
        }
      } catch (dispatchErr) {
        logger.error('[Channel] Webhook dispatch error (non-fatal)', {
          reservationId: updated.id,
          error: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
        });
      }
    });

    res.status(200).json(responseBody);
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
 * Idempotent on cc_booking_id.
 * Returns 409 if time slot is full or unavailable.
 *
 * CC sends snake_case fields:
 *   cc_booking_id, cc_experience_id, owambe_time_slot_id,
 *   lead_participant_first_name, lead_participant_last_name,
 *   lead_participant_email, lead_participant_phone,
 *   number_of_participants, participant_names,
 *   total_amount, currency, channel_commission_amount,
 *   channel_commission_percent, net_to_operator,
 *   special_requirements, pickup_requested, pickup_address,
 *   payment_status, paystack_reference
 */
router.post('/experiences/bookings', async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string ?? 'unknown';
  const {
    cc_booking_id: coastalCorridorBookingId,
    cc_experience_id: coastalCorridorExperienceId,
    owambe_time_slot_id: owambeTimeSlotId,
    // Lead participant — support both flat snake_case and nested lead_participant object
    lead_participant,
    lead_participant_first_name,
    lead_participant_last_name,
    lead_participant_email,
    lead_participant_phone,
    number_of_participants: numberOfParticipants,
    participant_names: participantNames,
    total_amount: totalAmount,
    currency,
    channel_commission_amount: channelCommissionAmount,
    channel_commission_percent: channelCommissionPercent,
    net_to_operator: netToOperator,
    special_requirements: specialRequirements,
    pickup_requested: pickupRequested,
    pickup_address: pickupAddress,
    payment_status: paymentStatus,
    paystack_reference: paystackReference,
  } = req.body;

   // Normalise lead participant fields — support both flat and nested forms
  const leadFirstName: string = lead_participant_first_name ?? lead_participant?.first_name ?? lead_participant?.firstName ?? '';
  const leadLastName: string = lead_participant_last_name ?? lead_participant?.last_name ?? lead_participant?.lastName ?? '';
  const leadEmail: string = lead_participant_email ?? lead_participant?.email ?? '';
  const leadPhone: string | null = lead_participant_phone ?? lead_participant?.phone ?? null;

  // Validate required fields — reject early to prevent CC-undefined references
  if (!coastalCorridorBookingId || !owambeTimeSlotId || !numberOfParticipants) {
    res.status(400).json({
      error: 'MISSING_REQUIRED_FIELDS',
      message: 'cc_booking_id, owambe_time_slot_id, and number_of_participants are required',
    });
    return;
  }

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
        owambe_booking_id: existing.id,
        cc_booking_id: coastalCorridorBookingId,
        status: existing.status,
        created_at: existing.createdAt.toISOString(),
        operator_notified: true,
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
        guestName: `${leadFirstName} ${leadLastName}`.trim(),
        guestEmail: leadEmail,
        guestPhone: leadPhone,
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
      owambe_booking_id: booking.id,
      cc_booking_id: coastalCorridorBookingId,
      status: booking.status,
      created_at: booking.createdAt.toISOString(),
      operator_notified: !!operatorUser?.email,
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
 *
 * CC sends snake_case fields:
 *   event_type, event_id, timestamp, data (event-specific snake_case object)
 */
router.post('/webhooks/inbound', async (req: Request, res: Response): Promise<void> => {
  const {
    event_type: eventType,
    event_id: eventId,
    timestamp,
    data,
  } = req.body;

  logger.info('[Channel] Inbound webhook', { eventType, eventId, timestamp });

  try {
    switch (eventType) {
      // ─── OWB-WAVE-4-02: Reservation lifecycle webhooks ─────────────────────

      case 'reservation.cancelled': {
        // CC-initiated cancellation: transition to CANCELLED, release calendar, notify host.
        const ccResIdCancel: string | undefined = data?.reservation_id ?? data?.cc_reservation_id;
        if (!ccResIdCancel) {
          logger.warn('[Channel] Webhook reservation.cancelled: missing reservation_id', { eventId });
          break;
        }
        const resCancel = await prisma.stayBooking.findFirst({
          where: { externalRef: ccResIdCancel },
          include: { room: { include: { property: { include: { host: true } } } } },
        });
        if (!resCancel) {
          logger.warn('[Channel] Webhook reservation.cancelled: not found', { ccResIdCancel, eventId });
          break;
        }
        if (resCancel.status === StayBookingStatus.CANCELLED) {
          logger.info('[Channel] Webhook reservation.cancelled: idempotent (already CANCELLED)', { ccResIdCancel });
          break;
        }
        await prisma.stayBooking.update({
          where: { id: resCancel.id },
          data: {
            status: StayBookingStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelledBy: 'COASTAL_CORRIDOR',
            cancellationReason: (data?.cancellation_reason as string | undefined) ?? 'Cancelled by Coastal Corridor',
          },
        });
        if (resCancel.roomId) {
          setImmediate(async () => {
            try {
              await prisma.calendarEntry.updateMany({
                where: {
                  roomId: resCancel.roomId!,
                  date: { gte: resCancel.checkInDate, lt: resCancel.checkOutDate },
                  status: { in: ['BOOKED', 'BLOCKED'] },
                },
                data: { status: 'AVAILABLE' },
              });
            } catch (calErr) {
              logger.error('[Channel] Webhook reservation.cancelled: calendar release failed', { reservationId: resCancel.id, error: calErr instanceof Error ? calErr.message : String(calErr) });
            }
          });
        }
        const hostCancelUser = resCancel.room?.property?.host
          ? await prisma.user.findUnique({ where: { id: resCancel.room.property.host.userId } }).catch(() => null)
          : null;
        if (hostCancelUser?.email) {
          setImmediate(() =>
            notifyHostReservationCancelled(
              hostCancelUser.email!,
              hostCancelUser.firstName ?? 'Host',
              resCancel.room?.property?.name ?? 'your property',
              resCancel.guestName,
              resCancel.reference,
              resCancel.id,
              (data?.cancellation_reason as string | undefined) ?? null,
              'COASTAL_CORRIDOR',
            )
          );
        }
        logger.info('[Channel] Webhook reservation.cancelled: processed', { reservationId: resCancel.id, ccResIdCancel });
        break;
      }

      case 'reservation.no_show': {
        // Guest did not check in: transition to NO_SHOW, mark calendar BLOCKED
        // (per OWB-FIX-CALENDAR commit 5bfb533 — NO_SHOW blocks dates to prevent double-booking).
        const ccResIdNoShow: string | undefined = data?.reservation_id ?? data?.cc_reservation_id;
        if (!ccResIdNoShow) {
          logger.warn('[Channel] Webhook reservation.no_show: missing reservation_id', { eventId });
          break;
        }
        const resNoShow = await prisma.stayBooking.findFirst({
          where: { externalRef: ccResIdNoShow },
        });
        if (!resNoShow) {
          logger.warn('[Channel] Webhook reservation.no_show: not found', { ccResIdNoShow, eventId });
          break;
        }
        if (resNoShow.status === StayBookingStatus.NO_SHOW) {
          logger.info('[Channel] Webhook reservation.no_show: idempotent', { ccResIdNoShow });
          break;
        }
        await prisma.stayBooking.update({
          where: { id: resNoShow.id },
          data: { status: StayBookingStatus.NO_SHOW },
        });
        if (resNoShow.roomId) {
          setImmediate(async () => {
            try {
              await prisma.calendarEntry.updateMany({
                where: {
                  roomId: resNoShow.roomId!,
                  date: { gte: resNoShow.checkInDate, lt: resNoShow.checkOutDate },
                },
                data: { status: 'BLOCKED' },
              });
            } catch (calErr) {
              logger.error('[Channel] Webhook reservation.no_show: calendar BLOCKED failed', { reservationId: resNoShow.id, error: calErr instanceof Error ? calErr.message : String(calErr) });
            }
          });
        }
        logger.info('[Channel] Webhook reservation.no_show: processed', { reservationId: resNoShow.id, ccResIdNoShow });
        break;
      }

      case 'reservation.guest_checked_in': {
        // CC confirms guest checked in: transition to CHECKED_IN, mark calendar BOOKED.
        const ccResIdCheckIn: string | undefined = data?.reservation_id ?? data?.cc_reservation_id;
        if (!ccResIdCheckIn) {
          logger.warn('[Channel] Webhook reservation.guest_checked_in: missing reservation_id', { eventId });
          break;
        }
        const resCheckIn = await prisma.stayBooking.findFirst({
          where: { externalRef: ccResIdCheckIn },
        });
        if (!resCheckIn) {
          logger.warn('[Channel] Webhook reservation.guest_checked_in: not found', { ccResIdCheckIn, eventId });
          break;
        }
        if (resCheckIn.status === StayBookingStatus.CHECKED_IN) {
          logger.info('[Channel] Webhook reservation.guest_checked_in: idempotent', { ccResIdCheckIn });
          break;
        }
        await prisma.stayBooking.update({
          where: { id: resCheckIn.id },
          data: { status: StayBookingStatus.CHECKED_IN, checkedInAt: new Date() },
        });
        if (resCheckIn.roomId) {
          setImmediate(async () => {
            try {
              await prisma.calendarEntry.updateMany({
                where: {
                  roomId: resCheckIn.roomId!,
                  date: { gte: resCheckIn.checkInDate, lt: resCheckIn.checkOutDate },
                },
                data: { status: 'BOOKED' },
              });
            } catch (calErr) {
              logger.error('[Channel] Webhook reservation.guest_checked_in: calendar BOOKED failed', { reservationId: resCheckIn.id, error: calErr instanceof Error ? calErr.message : String(calErr) });
            }
          });
        }
        logger.info('[Channel] Webhook reservation.guest_checked_in: processed', { reservationId: resCheckIn.id, ccResIdCheckIn });
        break;
      }

      case 'reservation.guest_checked_out': {
        // CC confirms guest checked out: transition to CHECKED_OUT, release calendar to AVAILABLE.
        const ccResIdCheckOut: string | undefined = data?.reservation_id ?? data?.cc_reservation_id;
        if (!ccResIdCheckOut) {
          logger.warn('[Channel] Webhook reservation.guest_checked_out: missing reservation_id', { eventId });
          break;
        }
        const resCheckOut = await prisma.stayBooking.findFirst({
          where: { externalRef: ccResIdCheckOut },
        });
        if (!resCheckOut) {
          logger.warn('[Channel] Webhook reservation.guest_checked_out: not found', { ccResIdCheckOut, eventId });
          break;
        }
        if (resCheckOut.status === StayBookingStatus.CHECKED_OUT) {
          logger.info('[Channel] Webhook reservation.guest_checked_out: idempotent', { ccResIdCheckOut });
          break;
        }
        await prisma.stayBooking.update({
          where: { id: resCheckOut.id },
          data: { status: StayBookingStatus.CHECKED_OUT, checkedOutAt: new Date() },
        });
        if (resCheckOut.roomId) {
          setImmediate(async () => {
            try {
              await prisma.calendarEntry.updateMany({
                where: {
                  roomId: resCheckOut.roomId!,
                  date: { gte: resCheckOut.checkInDate, lt: resCheckOut.checkOutDate },
                  status: { in: ['BOOKED', 'BLOCKED'] },
                },
                data: { status: 'AVAILABLE' },
              });
            } catch (calErr) {
              logger.error('[Channel] Webhook reservation.guest_checked_out: calendar release failed', { reservationId: resCheckOut.id, error: calErr instanceof Error ? calErr.message : String(calErr) });
            }
          });
        }
        logger.info('[Channel] Webhook reservation.guest_checked_out: processed', { reservationId: resCheckOut.id, ccResIdCheckOut });
        break;
      }

      case 'reservation.refunded': {
        // CC confirms refund issued: transition to REFUNDED, capture refund_amount,
        // update CommissionAuditLog with CC-provided refund details.
        const ccResIdRefund: string | undefined = data?.reservation_id ?? data?.cc_reservation_id;
        if (!ccResIdRefund) {
          logger.warn('[Channel] Webhook reservation.refunded: missing reservation_id', { eventId });
          break;
        }
        const resRefund = await prisma.stayBooking.findFirst({
          where: { externalRef: ccResIdRefund },
          include: { commissionAuditLogs: { orderBy: { createdAt: 'desc' }, take: 1 } },
        });
        if (!resRefund) {
          logger.warn('[Channel] Webhook reservation.refunded: not found', { ccResIdRefund, eventId });
          break;
        }
        if (resRefund.status === StayBookingStatus.REFUNDED) {
          logger.info('[Channel] Webhook reservation.refunded: idempotent', { ccResIdRefund });
          break;
        }
        const refundAmt: number | undefined = data?.refund_amount != null ? Number(data.refund_amount) : undefined;
        const refundCurr: string | undefined = data?.refund_currency ?? resRefund.currency;
        await prisma.stayBooking.update({
          where: { id: resRefund.id },
          data: {
            status: StayBookingStatus.REFUNDED,
            paymentStatus: 'REFUNDED' as any,
            refundAmount: refundAmt ?? null,
            refundCurrency: refundCurr ?? null,
          },
        });
        // Update the most recent CommissionAuditLog with CC-provided refund figures
        const latestAuditLog = resRefund.commissionAuditLogs[0];
        if (latestAuditLog && refundAmt != null) {
          const ccRefundCommission: number | undefined = data?.cc_commission_amount != null ? Number(data.cc_commission_amount) : undefined;
          const ccRefundNet: number | undefined = data?.cc_net_to_host != null ? Number(data.cc_net_to_host) : undefined;
          const hasDiscrepancy = ccRefundCommission != null &&
            Math.abs(ccRefundCommission - Number(latestAuditLog.channelCommissionAmount)) > 0.01;
          await prisma.commissionAuditLog.update({
            where: { id: latestAuditLog.id },
            data: {
              ccProvidedCommissionAmount: ccRefundCommission ?? null,
              ccProvidedNetToHost: ccRefundNet ?? null,
              hasDiscrepancy: hasDiscrepancy,
              discrepancyNote: hasDiscrepancy
                ? `Refund commission mismatch: Owambe=${latestAuditLog.channelCommissionAmount}, CC=${ccRefundCommission}`
                : null,
            },
          });
        }
        logger.info('[Channel] Webhook reservation.refunded: processed', { reservationId: resRefund.id, ccResIdRefund, refundAmt });
        break;
      }

      // ─── OWB-WAVE-4-02: Experience booking lifecycle webhooks ───────────────

      case 'booking.cancelled': {
        // CC-initiated experience booking cancellation: transition to CANCELLED,
        // decrement slot bookedCount to release capacity.
        const ccBookingIdCancel: string | undefined = data?.booking_id ?? data?.cc_booking_id;
        if (!ccBookingIdCancel) {
          logger.warn('[Channel] Webhook booking.cancelled: missing booking_id', { eventId });
          break;
        }
        const bookingCancel = await prisma.experienceBooking.findFirst({
          where: { externalRef: ccBookingIdCancel },
        });
        if (!bookingCancel) {
          logger.warn('[Channel] Webhook booking.cancelled: not found', { ccBookingIdCancel, eventId });
          break;
        }
        if (bookingCancel.status === ExperienceBookingStatus.CANCELLED) {
          logger.info('[Channel] Webhook booking.cancelled: idempotent', { ccBookingIdCancel });
          break;
        }
        await prisma.experienceBooking.update({
          where: { id: bookingCancel.id },
          data: {
            status: ExperienceBookingStatus.CANCELLED,
            cancelledAt: new Date(),
            cancellationReason: (data?.cancellation_reason as string | undefined) ?? 'Cancelled by Coastal Corridor',
          },
        });
        // Release slot capacity
        setImmediate(async () => {
          try {
            await prisma.experienceSlot.update({
              where: { id: bookingCancel.slotId },
              data: { bookedCount: { decrement: bookingCancel.numberOfParticipants ?? 1 } },
            });
          } catch (slotErr) {
            logger.error('[Channel] Webhook booking.cancelled: slot capacity release failed', { bookingId: bookingCancel.id, error: slotErr instanceof Error ? slotErr.message : String(slotErr) });
          }
        });
        logger.info('[Channel] Webhook booking.cancelled: processed', { bookingId: bookingCancel.id, ccBookingIdCancel });
        break;
      }

      case 'booking.completed': {
        // CC confirms experience booking completed: transition to COMPLETED.
        const ccBookingIdComplete: string | undefined = data?.booking_id ?? data?.cc_booking_id;
        if (!ccBookingIdComplete) {
          logger.warn('[Channel] Webhook booking.completed: missing booking_id', { eventId });
          break;
        }
        const bookingComplete = await prisma.experienceBooking.findFirst({
          where: { externalRef: ccBookingIdComplete },
        });
        if (!bookingComplete) {
          logger.warn('[Channel] Webhook booking.completed: not found', { ccBookingIdComplete, eventId });
          break;
        }
        if (bookingComplete.status === ExperienceBookingStatus.COMPLETED) {
          logger.info('[Channel] Webhook booking.completed: idempotent', { ccBookingIdComplete });
          break;
        }
        await prisma.experienceBooking.update({
          where: { id: bookingComplete.id },
          data: { status: ExperienceBookingStatus.COMPLETED, completedAt: new Date() },
        });
        logger.info('[Channel] Webhook booking.completed: processed', { bookingId: bookingComplete.id, ccBookingIdComplete });
        break;
      }

      case 'booking.refunded': {
        // CC confirms experience booking refund: transition to REFUNDED.
        const ccBookingIdRefund: string | undefined = data?.booking_id ?? data?.cc_booking_id;
        if (!ccBookingIdRefund) {
          logger.warn('[Channel] Webhook booking.refunded: missing booking_id', { eventId });
          break;
        }
        const bookingRefund = await prisma.experienceBooking.findFirst({
          where: { externalRef: ccBookingIdRefund },
        });
        if (!bookingRefund) {
          logger.warn('[Channel] Webhook booking.refunded: not found', { ccBookingIdRefund, eventId });
          break;
        }
        if (bookingRefund.status === ExperienceBookingStatus.REFUNDED) {
          logger.info('[Channel] Webhook booking.refunded: idempotent', { ccBookingIdRefund });
          break;
        }
        await prisma.experienceBooking.update({
          where: { id: bookingRefund.id },
          data: {
            status: ExperienceBookingStatus.REFUNDED,
            paymentStatus: 'REFUNDED' as any,
          },
        });
        logger.info('[Channel] Webhook booking.refunded: processed', { bookingId: bookingRefund.id, ccBookingIdRefund });
        break;
      }

      // ─── OWB-WAVE-4-02: Property / Experience deactivation webhooks ─────────

      case 'property.deactivated': {
        // CC notifies that a property has been deactivated on CC side.
        // Set isActive=false on Owambe. Existing reservations are preserved (do NOT cascade-cancel).
        const ccPropertyIdDeact: string | undefined = data?.owambe_property_id ?? data?.property_id;
        if (!ccPropertyIdDeact) {
          logger.warn('[Channel] Webhook property.deactivated: missing property_id', { eventId });
          break;
        }
        const propDeact = await prisma.property.findFirst({
          where: {
            OR: [
              { id: ccPropertyIdDeact },
              { coastalCorridorPropertyId: ccPropertyIdDeact },
            ],
          },
        });
        if (!propDeact) {
          logger.warn('[Channel] Webhook property.deactivated: property not found', { ccPropertyIdDeact, eventId });
          break;
        }
        if (!propDeact.isActive) {
          logger.info('[Channel] Webhook property.deactivated: idempotent (already inactive)', { ccPropertyIdDeact });
          break;
        }
        await prisma.property.update({
          where: { id: propDeact.id },
          data: { isActive: false },
        });
        logger.info('[Channel] Webhook property.deactivated: property hidden from search', {
          propertyId: propDeact.id,
          ccPropertyIdDeact,
          note: 'Existing reservations preserved — no cascade-cancel',
        });
        break;
      }

      case 'experience.deactivated': {
        // CC notifies that an experience has been deactivated on CC side.
        // Set isActive=false on Owambe. Existing bookings are preserved.
        const ccExperienceIdDeact: string | undefined = data?.owambe_experience_id ?? data?.experience_id;
        if (!ccExperienceIdDeact) {
          logger.warn('[Channel] Webhook experience.deactivated: missing experience_id', { eventId });
          break;
        }
        // Experience model has no CC-side ID field; CC must send the Owambe experience UUID.
        // ExperienceBooking.externalExperienceId stores the CC experience ID, but the
        // Experience table itself is looked up by Owambe UUID (owambe_experience_id from CC).
        const expDeact = await prisma.experience.findFirst({
          where: { id: ccExperienceIdDeact },
        });
        if (!expDeact) {
          logger.warn('[Channel] Webhook experience.deactivated: experience not found', { ccExperienceIdDeact, eventId });
          break;
        }
        if (!expDeact.isActive) {
          logger.info('[Channel] Webhook experience.deactivated: idempotent (already inactive)', { ccExperienceIdDeact });
          break;
        }
        await prisma.experience.update({
          where: { id: expDeact.id },
          data: { isActive: false },
        });
        logger.info('[Channel] Webhook experience.deactivated: experience hidden from search', {
          experienceId: expDeact.id,
          ccExperienceIdDeact,
          note: 'Existing bookings preserved — no cascade-cancel',
        });
        break;
      }

      case 'reconciliation.requested':
        logger.info('[Channel] Webhook: reconciliation.requested — triggering immediate run', { data });
        setImmediate(() => dispatchReconciliationNow().catch((e: Error) => logger.error('[Channel] reconciliation.requested dispatch failed', { error: e.message })));
        break;

      default:
        logger.warn('[Channel] Unrecognised webhook event type', { eventType, eventId });
        res.status(422).json({ error: 'UNRECOGNISED_EVENT', message: `Unknown event type: ${eventType}` });
        return;
    }

    res.status(200).json({ acknowledged: true, event_id: eventId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('[Channel] Error processing webhook', { error: msg, eventType, eventId });
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to process webhook' });
  }
});

export default router;
