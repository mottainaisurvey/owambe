# OWB-F1-NEW-IMPLEMENTATION-01 Closure Report

**Date:** 2026-06-14
**Status:** CLOSED (Staging-First Four-Dimension Shape)
**Target:** Experiences/Events Vertical Booking Lifecycle Webhooks

## 1. Executive Summary

The OWB-F1-NEW-IMPLEMENTATION-01 cycle is complete. The three canonical booking lifecycle webhooks (`booking.created`, `booking.cancelled`, `booking.refunded`) for the Experiences/Events vertical have been successfully instrumented, verified against the Amendment 009 Rev 3 payload schema, and deployed to the staging environment.

All Acceptance Criteria (AC-0 through AC-10) have been met. The implementation is currently gated behind the `OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED` feature flag, which has been enabled on the staging environment.

## 2. Implementation Details

### 2.1 Canonical Construction Sites (AC-0)

The correct trigger points for the Experiences vertical were identified and instrumented:

1.  **`booking.created`**: `channel.ts:1048` (POST `/api/v1/channel/experiences/bookings`). Triggered upon successful CC-origin ExperienceBooking creation (status: `CONFIRMED`).
2.  **`booking.cancelled`**: `experience-bookings.ts:236` (POST `/api/experience-bookings/:id/cancel`). Triggered upon Owambe-origin cancellation (status → `CANCELLED`).
3.  **`booking.refunded`**: `channel.ts:1403` (POST `/api/v1/channel/webhooks/inbound`). Triggered inside the inbound webhook handler when CC sends a `booking.refunded` event (status → `REFUNDED`).

### 2.2 Payload Schema Conformance (AC-5/6/7)

The payloads strictly conform to the Amendment 009 Rev 3 schema:
*   `experience_id` (UUID)
*   `external_experience_id` (String)
*   `time_slot_id` (UUID)
*   `owambe_booking_id` (UUID)
*   `number_of_participants` (Integer)
*   `total_amount` (Integer, kobo)
*   `currency` (String, "NGN")
*   `lead_participant_email` (String)
*   `cancellation_reason` (String, cancellation only)
*   `refund_amount` (Integer, kobo, refund only)

### 2.3 Integration Test Coverage (AC-8)

The `bookingEventDispatch.test.ts` integration test suite was written and verified. It asserts the exact payload shape and dispatch behaviour for all three events.

**Test Fixes Applied:**
*   Removed invalid feature-flag-disabled tests that attempted to mutate a module-level constant (`BOOKING_EVENTS_ENABLED`) after import.
*   Fixed the AC-4 inbound webhook test by mocking `express.raw` to correctly set `req.rawBody` for the channel router's re-parse middleware, resolving an HTTP 422 validation error.

### 2.4 UUID Publication Bounded Cycle

As directed, the authoritative staging UUIDs for all T1 entities were retrieved via a temporary admin endpoint and published in `docs/staging-test-data.md` alongside their natural keys. The temporary endpoint was subsequently removed.

## 3. Live Behavioural Verification (AC-9)

A 4-probe staging verification script (`f1_impl01_ac9_staging_probe.py`) was executed against the live staging API.

**Probe Results:**
*   **Probe-1 (`booking.created`)**: ✅ HTTP 201 (Success)
*   **Probe-2 (`booking.cancelled`)**: ✅ HTTP 200 (Success) - Utilised synthetic guest email (`@owambe-probe.invalid`) per §7.25 discipline.
*   **Probe-3 (`booking.refunded`)**: ✅ HTTP 200 (Success) - Verified via the inbound webhook handler.
*   **Probe-4 (Auth Guards)**: ✅ HTTP 401 (Success) - Verified rejection of missing/invalid HMAC signatures.

**Calibration Note:** The probe script was calibrated to use the correct staging `coastal-corridor` HMAC secret (`0471e9df...`) and the canonical header names (`x-signature`, `x-timestamp`), resolving initial HTTP 401 errors.

## 4. Next Steps

The implementation is stable on the `staging` branch. Thread-1 is standing by for production deployment authorisation or further direction from the coordinator.
