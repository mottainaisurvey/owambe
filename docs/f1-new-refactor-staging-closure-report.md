# OWB-F1-NEW-REFACTOR-01 Staging Closure Report

**Date:** 2026-06-13
**Author:** Manus AI
**Target Environment:** Staging (`https://owambe-api-staging.up.railway.app`)
**CI Run ID:** 27465069075
**Merge Commit:** `1b463d7`

## 1. Executive Summary

The OWB-F1-NEW-REFACTOR-01 workstream has been successfully executed, tested, and deployed to the staging environment. The Owambe stays reservation event dispatch has been fully aligned with the Amendment 012 canonical `reservation.*` wire shape.

All integration tests and live staging probes passed, confirming that the event types, envelope fields, and minimum-scope payloads conform strictly to the Amendment 012 specification.

## 2. Refactor Scope Execution

The following refactoring actions were completed in the `channel.ts` and `webhookDispatcher.service.ts` modules:

1. **Event Type Swaps:**
   - `booking.created` → `reservation.created`
   - `booking.cancelled` → `reservation.cancelled`
   - `booking.refunded` → `reservation.refunded`
2. **Envelope Alignment:**
   - The outbound envelope construction (`event_type`, `event_id`, `timestamp`, `data`) was verified to already conform to Amendment 012 §3.
   - The internal `idempotencyKey` prefix was updated to match the new event types.
3. **Payload Refactor (Amendment 012 Minimum-Scope):**
   - **`reservation.created`**: Payload reduced to `{ reservation_id }` only. Legacy fields (`booking_type`, `cc_reservation_id`, `owambe_reservation_id`, etc.) were removed.
   - **`reservation.cancelled`**: Payload reduced to `{ reservation_id, reason, paystack_reference }`.
   - **`reservation.refunded`**: Payload reduced to `{ reservation_id, refund_amount }`.
4. **Feature Flag Gate Update:**
   - The `reservation.*` events are correctly classified under the `reservation` event family, bypassing the deprecated `OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED` feature flag, ensuring they always dispatch.

## 3. Staging Verification Results (AC-5 / AC-6)

A live staging probe was executed against the Railway staging environment using the `test-channel` canonical path.

| Probe | Description | Result | HTTP Status |
|---|---|---|---|
| **AC-5.1** | `POST /stays/reservations` | ✅ PASS | 201 |
| **AC-5.2** | Idempotent re-send | ✅ PASS | 200 |
| **AC-5.3** | `PATCH CANCELLED` | ✅ PASS | 200 |
| **AC-5.4** | `PATCH REFUNDED` | ✅ PASS | 200 |
| **AC-6.1** | `reservation.created` payload conformance | ✅ PASS | N/A (Verified via CI) |
| **AC-6.2** | `reservation.cancelled` payload conformance | ✅ PASS | N/A (Verified via CI) |
| **AC-6.3** | `reservation.refunded` payload conformance | ✅ PASS | N/A (Verified via CI) |
| **AC-6.4** | Auth guard: no HMAC headers | ✅ PASS | 401 |
| **AC-6.5** | Auth guard: bad HMAC signature | ✅ PASS | 401 |

*Note: Wire shape conformance (AC-6.1–6.3) was definitively verified by the CI integration tests (`reservationEventDispatch.test.ts`), which assert the exact payload shape passed to the dispatcher. The staging probe confirmed the HTTP contract and auth guard.*

## 4. Conclusion

The F1-new refactor is complete and live on staging. The system is now fully compliant with the Amendment 012 canonical wire shape for stays reservation events. The staging branch is green and ready for production deployment at the coordinator's discretion.
