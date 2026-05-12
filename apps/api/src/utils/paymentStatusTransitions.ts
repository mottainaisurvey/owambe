/**
 * PAY-CANONICAL-01-OWB: Payment Status Transition Graph
 * Single source of truth for the fourteen legal PaymentStatus transitions
 * defined in XCT-03 Amendment 002 / Contract v1.1 §07.
 *
 * Import this map into any PATCH handler that modifies paymentStatus.
 */

export type CanonicalPaymentStatus =
  | 'PENDING'
  | 'DEPOSIT_PAID'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'FAILED';

/**
 * Legal payment status transitions (fourteen total).
 * Key = fromStatus; Value = array of allowed toStatus values.
 */
export const PAYMENT_STATUS_TRANSITIONS: Record<CanonicalPaymentStatus, CanonicalPaymentStatus[]> = {
  PENDING:            ['DEPOSIT_PAID', 'PARTIALLY_PAID', 'PAID', 'FAILED'],
  DEPOSIT_PAID:       ['PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  PARTIALLY_PAID:     ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  PAID:               ['PARTIALLY_REFUNDED', 'REFUNDED'],
  PARTIALLY_REFUNDED: ['REFUNDED'],
  REFUNDED:           [],  // terminal
  FAILED:             ['PENDING'],  // retry: FAILED → PENDING
};

export interface PaymentStatusTransitionError {
  error: 'invalid_payment_status_transition';
  fromStatus: CanonicalPaymentStatus;
  attemptedStatus: string;
  message: string;
  allowedTransitions: CanonicalPaymentStatus[];
}

/**
 * Validate a payment status transition.
 * Returns null if valid; returns a PaymentStatusTransitionError if invalid.
 */
export function validatePaymentStatusTransition(
  fromStatus: string,
  attemptedStatus: string,
): PaymentStatusTransitionError | null {
  const from = fromStatus as CanonicalPaymentStatus;
  const allowed = PAYMENT_STATUS_TRANSITIONS[from];

  if (allowed === undefined) {
    // fromStatus is not a canonical state — treat as invalid
    return {
      error: 'invalid_payment_status_transition',
      fromStatus: from,
      attemptedStatus,
      message: `Unknown fromStatus: ${fromStatus}`,
      allowedTransitions: [],
    };
  }

  if (!allowed.includes(attemptedStatus as CanonicalPaymentStatus)) {
    return {
      error: 'invalid_payment_status_transition',
      fromStatus: from,
      attemptedStatus,
      message: `Cannot transition payment status from ${fromStatus} to ${attemptedStatus}`,
      allowedTransitions: allowed,
    };
  }

  return null; // valid transition
}
