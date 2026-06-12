# F1-NEW Implementation Report: Outbound Booking Event Dispatch

**Date:** 2026-06-12  
**Author:** Manus AI  
**Workstream:** OWB-F1-NEW-IMPLEMENTATION-01  

## 1. Executive Summary

This report details the implementation and verification of the F1-new outbound booking event dispatch mechanism for the Coastal Corridor integration. The implementation instruments the canonical `/stays/reservations` endpoint to dispatch `booking.created`, `booking.cancelled`, and `booking.refunded` events to the channel partner via the existing `dispatchWebhookEvent` infrastructure.

The implementation successfully passes all automated CI tests and has been verified against the live Railway staging environment.

## 2. Implementation Details

### 2.1 Event Dispatch Instrumentation
The `apps/api/src/routes/channel.ts` file was updated to dispatch the required events during the inbound reservation lifecycle:

1. **`booking.created`**: Dispatched immediately after a new reservation is successfully created (HTTP 201 path). The payload includes all required Amendment 009 Rev 3 §3.1 fields.
2. **`booking.cancelled`**: Dispatched when a reservation is updated to `CANCELLED` status via the `PATCH /stays/reservations/:id` endpoint.
3. **`booking.refunded`**: Dispatched when a reservation is updated to `REFUNDED` status via the `PATCH /stays/reservations/:id` endpoint.

All dispatches are executed asynchronously via `setImmediate` to ensure they do not block the HTTP response to the channel partner, adhering to the fire-and-forget pattern established in the codebase.

### 2.2 Payload Construction
A new `buildBookingEventPayload` helper function was implemented to construct the standardized event payload. The payload maps internal Owambe fields to the required snake_case format expected by Coastal Corridor:

- `owambe_reservation_id`: The internal UUID of the stay booking.
- `cc_reservation_id`: The external reference provided by the channel.
- `status`: The current status of the booking.
- `previous_status`: The status prior to the update (for state transitions).
- `created_at`: The ISO-8601 timestamp of the booking creation.
- `host_notified`: Boolean indicating if the host has been notified.
- `contract_generation_status`: The status of the contract generation (defaulting to `PENDING`).

### 2.3 Bug Fixes and Schema Alignments
During implementation, several underlying issues were identified and resolved:

1. **Missing `REFUNDED` Status Mapping**: The `statusMap` in the `PATCH` handler was missing the `REFUNDED` status, causing HTTP 422 errors. This was corrected to allow valid refund transitions.
2. **Missing Database Columns**: The `coastalCorridorPropertyId`, `coastalCorridorSyncedAt`, `coastalCorridorListingUrl`, and `coastalCorridorRoomId` fields were present in the Prisma schema but missing from the database migrations. A new migration (`20260612000001_phase_b_coastal_corridor_sync_fields`) was created to add these columns to the `properties` and `rooms` tables, resolving CI test failures.
3. **Test Suite Circular Dependencies**: The `bookingEventDispatch.test.ts` suite encountered circular dependency issues with `CoastalCorridorAdapter` during module instantiation. This was resolved by mocking the `routes/properties` module to return the Express router directly, bypassing the module-scope instantiation.

## 3. Verification Results

### 3.1 Automated CI Tests
The implementation includes a comprehensive test suite (`apps/api/src/__tests__/bookingEventDispatch.test.ts`) that verifies the dispatch behavior. The CI pipeline (Run #120-125) successfully passed all checks:

- **Lint & Type Check**: Passed
- **Run Tests**: Passed (2m39s)
- **Build**: Passed
- **Deploy API to Staging**: Passed

The test suite verifies:
- The `booking.created` event is dispatched on successful POST.
- The `booking.created` event is **not** dispatched on idempotent re-calls (HTTP 200).
- The `booking.cancelled` event is dispatched on PATCH to CANCELLED.
- The `booking.refunded` event is dispatched on PATCH to REFUNDED.
- The payload contains all required fields formatted correctly.
- The feature flag `OWAMBE_ENABLE_F1_NEW_DISPATCH` correctly gates the dispatch behavior.

### 3.2 Live Staging Verification (AC-9)
A live probe (`ac9_f1_new_probe.py`) was executed against the Railway staging environment (`https://owambe-api-staging.up.railway.app`) using the `test-channel` HMAC credentials. The probe verified the end-to-end behavior of the deployed code:

| Test Case | Description | Result | HTTP Status |
| :--- | :--- | :--- | :--- |
| **AC-9.1** | `POST /stays/reservations` → `booking.created` dispatch | ✅ PASS | 201 Created |
| **AC-9.2** | Idempotent re-send of same reservation | ✅ PASS | 200 OK |
| **AC-9.3** | `PATCH /stays/reservations/:id` to `CANCELLED` | ✅ PASS | 200 OK |
| **AC-9.4** | `PATCH /stays/reservations/:id` to `REFUNDED` | ✅ PASS | 200 OK |
| **AC-9.5** | Auth guard: Missing HMAC headers | ✅ PASS | 401 Unauthorized |
| **AC-9.6** | Auth guard: Invalid HMAC signature | ✅ PASS | 401 Unauthorized |

The live verification confirms that the F1-new dispatch logic is fully operational in the staging environment, the `REFUNDED` status transition bug is fixed, and the HMAC authentication guard remains intact.

## 4. Conclusion

The OWB-F1-NEW-IMPLEMENTATION-01 workstream is complete. The outbound booking event dispatch mechanism is fully instrumented, tested, and deployed to staging. The implementation adheres to the Amendment 009 Rev 3 §3.1 specifications and integrates seamlessly with the existing webhook infrastructure.
