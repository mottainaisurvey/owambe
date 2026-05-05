/**
 * ─── notification.service.ts ─────────────────────────────────────────────────
 *
 * Phase B: Host and Operator notification service.
 * Sends email notifications when reservations and bookings arrive from
 * Coastal Corridor (or any channel) via the inbound channel router.
 *
 * All functions are fire-and-forget — they never throw to the caller.
 */

import { sendEmail } from './email.service';
import { logger } from '../utils/logger';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'https://owambe.com';

// ─── Stays: Host notification ─────────────────────────────────────────────────

export interface HostReservationNotificationPayload {
  hostEmail: string;
  hostFirstName: string;
  propertyName: string;
  guestName: string;
  guestEmail: string;
  checkInDate: Date;
  checkOutDate: Date;
  nights: number;
  roomName: string;
  totalAmount: number;
  currency: string;
  netToHost: number | null;
  channelCommissionPercent: number | null;
  channelOrigin: string;
  reservationReference: string;
  reservationId: string;
  specialRequests?: string | null;
}

/**
 * Notify the host when a new stay reservation arrives from a channel.
 */
export async function notifyHostNewReservation(payload: HostReservationNotificationPayload): Promise<void> {
  try {
    const dashboardUrl = `${APP_URL}/dashboard/stays/bookings/${payload.reservationId}`;
    const checkIn = payload.checkInDate.toLocaleDateString('en-NG', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const checkOut = payload.checkOutDate.toLocaleDateString('en-NG', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const channelLabel = payload.channelOrigin === 'COASTAL_CORRIDOR'
      ? 'Coastal Corridor'
      : payload.channelOrigin;

    const netDisplay = payload.netToHost != null
      ? `${payload.currency} ${payload.netToHost.toLocaleString('en-NG')}`
      : `${payload.currency} ${payload.totalAmount.toLocaleString('en-NG')} (net TBC)`;

    const commissionNote = payload.channelCommissionPercent != null
      ? `Channel commission: ${payload.channelCommissionPercent}%`
      : 'Channel commission: see booking details';

    await sendEmail({
      to: payload.hostEmail,
      subject: `New reservation at ${payload.propertyName} — ${checkIn}`,
      template: 'host-new-reservation',
      data: {
        firstName: payload.hostFirstName,
        propertyName: payload.propertyName,
        guestName: payload.guestName,
        guestEmail: payload.guestEmail,
        checkIn,
        checkOut,
        nights: payload.nights,
        roomName: payload.roomName,
        totalAmount: `${payload.currency} ${payload.totalAmount.toLocaleString('en-NG')}`,
        netToHost: netDisplay,
        commissionNote,
        channelLabel,
        reference: payload.reservationReference,
        specialRequests: payload.specialRequests ?? 'None',
        dashboardUrl,
      },
    });

    logger.info('[Notification] Host new reservation email sent', {
      hostEmail: payload.hostEmail,
      reservationId: payload.reservationId,
      channelOrigin: payload.channelOrigin,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[Notification] Failed to send host reservation email', {
      hostEmail: payload.hostEmail,
      reservationId: payload.reservationId,
      error: msg,
    });
  }
}

/**
 * Notify the host when a reservation is cancelled.
 */
export async function notifyHostReservationCancelled(
  hostEmail: string,
  hostFirstName: string,
  propertyName: string,
  guestName: string,
  reservationReference: string,
  reservationId: string,
  cancellationReason?: string | null,
  cancelledBy?: string | null,
): Promise<void> {
  try {
    const dashboardUrl = `${APP_URL}/dashboard/stays/bookings/${reservationId}`;
    await sendEmail({
      to: hostEmail,
      subject: `Reservation cancelled — ${propertyName} (Ref: ${reservationReference})`,
      template: 'host-reservation-cancelled',
      data: {
        firstName: hostFirstName,
        propertyName,
        guestName,
        reference: reservationReference,
        cancellationReason: cancellationReason ?? 'Not specified',
        cancelledBy: cancelledBy ?? 'Guest',
        dashboardUrl,
      },
    });

    logger.info('[Notification] Host reservation cancelled email sent', {
      hostEmail,
      reservationId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[Notification] Failed to send host cancellation email', {
      hostEmail,
      reservationId,
      error: msg,
    });
  }
}

// ─── Experiences: Operator notification ──────────────────────────────────────

export interface OperatorBookingNotificationPayload {
  operatorEmail: string;
  operatorFirstName: string;
  experienceName: string;
  leadParticipantName: string;
  leadParticipantEmail: string;
  slotDate: Date;
  slotTime: string;
  numberOfParticipants: number | null;
  totalAmount: number;
  currency: string;
  netToOperator: number | null;
  channelCommissionPercent: number | null;
  channelOrigin: string;
  bookingReference: string;
  bookingId: string;
  specialRequirements?: string | null;
  pickupRequested?: boolean;
  pickupAddress?: string | null;
}

/**
 * Notify the operator when a new experience booking arrives from a channel.
 */
export async function notifyOperatorNewBooking(payload: OperatorBookingNotificationPayload): Promise<void> {
  try {
    const dashboardUrl = `${APP_URL}/dashboard/experiences/bookings/${payload.bookingId}`;
    const slotDateStr = payload.slotDate.toLocaleDateString('en-NG', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const channelLabel = payload.channelOrigin === 'COASTAL_CORRIDOR'
      ? 'Coastal Corridor'
      : payload.channelOrigin;

    const netDisplay = payload.netToOperator != null
      ? `${payload.currency} ${payload.netToOperator.toLocaleString('en-NG')}`
      : `${payload.currency} ${payload.totalAmount.toLocaleString('en-NG')} (net TBC)`;

    await sendEmail({
      to: payload.operatorEmail,
      subject: `New booking for ${payload.experienceName} — ${slotDateStr}`,
      template: 'operator-new-booking',
      data: {
        firstName: payload.operatorFirstName,
        experienceName: payload.experienceName,
        leadParticipantName: payload.leadParticipantName,
        leadParticipantEmail: payload.leadParticipantEmail,
        slotDate: slotDateStr,
        slotTime: payload.slotTime,
        numberOfParticipants: payload.numberOfParticipants,
        totalAmount: `${payload.currency} ${payload.totalAmount.toLocaleString('en-NG')}`,
        netToOperator: netDisplay,
        channelLabel,
        reference: payload.bookingReference,
        specialRequirements: payload.specialRequirements ?? 'None',
        pickupRequested: payload.pickupRequested ? 'Yes' : 'No',
        pickupAddress: payload.pickupAddress ?? 'N/A',
        dashboardUrl,
      },
    });

    logger.info('[Notification] Operator new booking email sent', {
      operatorEmail: payload.operatorEmail,
      bookingId: payload.bookingId,
      channelOrigin: payload.channelOrigin,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[Notification] Failed to send operator booking email', {
      operatorEmail: payload.operatorEmail,
      bookingId: payload.bookingId,
      error: msg,
    });
  }
}
