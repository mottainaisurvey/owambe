# Workstream F1-new Investigation Report: Outbound Booking-Event Dispatcher

**Date:** 2026-06-11
**Author:** Manus AI
**Status:** Investigation Complete

## 1. Executive Summary

This report details the findings of the F1-new investigation cycle, focusing on the existing outbound dispatch infrastructure within the Owambe codebase. The objective is to map the current state and identify the implementation path for the Amendment 009 (Owambe → Coastal Corridor) booking-event outbound dispatcher. The investigation confirms that a robust, queue-backed webhook dispatcher already exists for reservation events, and the foundation for booking events is partially laid but requires activation and integration.

## 2. Investigation Areas

### 2.1 Existing Outbound Dispatch Infrastructure
The core dispatch logic resides in `apps/api/src/services/webhookDispatcher.service.ts` [1].
- **Mechanism:** It uses BullMQ (`OWAMBE_WEBHOOK_DISPATCH_QUEUE`) backed by Redis for asynchronous, retriable delivery, with a synchronous fallback if Redis is unavailable.
- **Circuit Breaker:** A per-channel circuit breaker is implemented to halt dispatch after 20 consecutive failures.
- **Security:** Payloads are signed using HMAC-SHA256. The signature and timestamp headers are generated dynamically at dispatch time (`executeDelivery`) to prevent staleness during queue delays.
- **Idempotency:** The dispatcher supports an `idempotencyKey` to aid receiver-side deduplication.

### 2.2 Booking Entity Lifecycle & Event Triggers
Currently, the system dispatches events from the `reservation` family (e.g., `reservation.guest_checked_in`, `reservation.status_changed`) [2]. These are triggered in `apps/api/src/routes/channel.ts` when a reservation's status is updated via the `PATCH /stays/reservations/:cc_reservation_id` endpoint.

The `booking` event family (`booking.created`, `booking.cancelled`, `booking.refunded`) is defined in the types but is **gated by an environment variable** (`OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED`) [1].

**Gap Analysis:**
- `booking.created` is currently *not* dispatched when a new stay reservation is created via `POST /stays/reservations`.
- `booking.cancelled` and `booking.refunded` are referenced in the inbound webhook handler (`POST /webhooks/inbound`) [2], meaning Owambe can *receive* these events, but it does not currently *emit* them for its own native bookings.

### 2.3 Amendment 009 Rev 3 Wire Shape
*Note: The Amendment 009 contract artefact (`/mnt/user-data/outputs/OWB-F1-NEW-INVESTIGATION-01.md`) was not accessible in the current environment. This analysis is based on the codebase implementation.*

The expected payload shape for booking events must align with the existing `WebhookDispatchPayload` interface:
```typescript
export interface WebhookDispatchPayload {
  eventType: WebhookEventType;
  data: Record<string, unknown>;
  targetUrl?: string;
  idempotencyKey?: string;
  channelSlug?: string;
}
```
For `booking.created`, the `data` object must contain the canonical fields agreed upon in Amendment 009 (e.g., `booking_id`, `property_id`, `guest_details`, `total_amount`, `currency`).

### 2.4 Channel Registry & Capabilities
The `Channel` schema model [3] dictates routing.
- **Routing Logic:** The `channelSupportsEvent` function [1] routes `booking` family events to any channel where `supportsStays === true` OR `supportsExperiences === true`.
- **Destination:** The payload is sent to the channel's `destinationUrl`. If null, it falls back to a legacy CC webhook URL (for the `coastal-corridor` channel only).

### 2.5 Configuration & Secret Management
- **HMAC Secret:** Resolved per-channel from `Channel.hmacSecret`. Falls back to `process.env.OWAMBE_WEBHOOK_OUTBOUND_SECRET`.
- **Headers:** Configurable per-channel via `Channel.signatureHeader` (default: `X-Signature`) and `Channel.timestampHeader` (default: `X-Timestamp`).
- **Feature Flag:** `process.env.OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED` must be set to `'true'` to allow booking events to pass the dispatcher gate.

## 3. Implementation Specification (F1-new)

To implement the Amendment 009 outbound dispatcher, the following steps are required:

1.  **Enable Feature Flag:** Ensure `OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED=true` is set in the environment.
2.  **Instrument `POST /stays/reservations`:**
    - In `apps/api/src/routes/channel.ts`, locate the successful creation of a `StayBooking`.
    - Inject a call to `dispatchWebhookEvent` with `eventType: 'booking.created'`.
    - Construct the `data` payload to strictly match the Amendment 009 Rev 3 wire shape.
3.  **Instrument Cancellations/Refunds (If applicable):**
    - Identify the Owambe-native endpoints where bookings are cancelled or refunded.
    - Inject `dispatchWebhookEvent` calls for `booking.cancelled` and `booking.refunded` with the appropriate payloads.
4.  **Test Infrastructure:**
    - Utilize the existing `getCircuitBreakerState` and `getWebhookDispatcherHealth` functions to verify dispatcher health during testing.
    - Ensure the local/CI environment has Redis available to test the BullMQ asynchronous path, or rely on the synchronous fallback for simpler unit tests.

## 4. Conclusion

The F1-new implementation does not require building a new dispatcher from scratch. The existing `webhookDispatcher.service.ts` is highly capable and already supports the `booking` event family at the type level. The primary work involves instrumenting the correct API endpoints (specifically `POST /stays/reservations`) to emit the `booking.created` event with the precise Amendment 009 payload shape.

---
### References
[1] `apps/api/src/services/webhookDispatcher.service.ts`
[2] `apps/api/src/routes/channel.ts`
[3] `apps/api/prisma/schema.prisma` (Lines 1741-1790)
