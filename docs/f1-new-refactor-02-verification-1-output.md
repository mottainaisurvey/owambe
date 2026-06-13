# OWB-F1-NEW-REFACTOR-02 (verification-1) Output

**Cycle ID:** OWB-F1-NEW-REFACTOR-02 (verification-1)
**Status:** COMPLETE
**Executed:** 2026-06-13
**Executed by:** Thread-1 (Owambe Manus developer)

## 1. Verification Scope

Per coordinator direction, Thread-1 executed an empirical determination at the Owambe-side scope to resolve the substantive operational tension between the Owambe-side dispatch `guest_owambe_user_id: null` pattern and the CC-side handler AC-CC-RC-3 validation (UUID v4 presence + RFC 4122 regex) reject scope.

The verification focused on:
1. Owambe-side `StayBooking` flow analysis at `guestUserId` population paths.
2. Owambe-side dispatch trigger analysis at `reservation.created` firing paths.
3. Determining whether real production Owambe → CC `reservation.created` events will substantively surface with `guest_owambe_user_id: null`.

## 2. Empirical Findings

### 2.1. `StayBooking` Creation Paths and `guestUserId` Population

There are two primary paths for creating a `StayBooking` in the Owambe API:

**Path A: Consumer App Booking (Owambe-origin)**
- **Endpoint:** `POST /api/stay-bookings` (`apps/api/src/routes/stay-bookings.ts`)
- **Authentication:** Required (`router.use(authenticate)`)
- **`guestUserId` Population:** The `userId` is extracted from the authenticated request (`const userId = (req as any).userId;`) and is **always populated** when creating the `StayBooking` record (`guestUserId: userId`).
- **Conclusion:** Bookings originating from the Owambe consumer app will always have a valid UUID in `guestUserId`.

**Path B: Channel Integration Booking (CC-origin)**
- **Endpoint:** `POST /api/v1/channels/:channel_slug/stays/reservations` (`apps/api/src/routes/channel.ts`)
- **Authentication:** HMAC Signature (Channel-to-Channel)
- **`guestUserId` Population:** The `guestUserId` is **explicitly hardcoded to `null`** when creating the `StayBooking` record (`guestUserId: null, // Guest may not have an Owambe account`).
- **Conclusion:** Bookings originating from Coastal Corridor (or any other channel) will always have `null` in `guestUserId`.

### 2.2. `reservation.created` Dispatch Trigger Paths

The `reservation.created` webhook event is dispatched via `dispatchWebhookEvent` in `apps/api/src/services/webhookDispatcher.service.ts`.

**Trigger Location:**
The **only** place in the codebase where `eventType: 'reservation.created'` is dispatched is within **Path B** (`POST /api/v1/channels/:channel_slug/stays/reservations` in `channel.ts`, line 383).

**Crucial Finding:**
The `reservation.created` event is **not** dispatched when a booking is created via the Owambe consumer app (Path A). It is **only** dispatched when a booking is created via the channel integration endpoint (Path B).

## 3. Substantive Determination

Based on the empirical findings:

1. The `reservation.created` event is **only** fired for CC-origin bookings (Path B).
2. CC-origin bookings **always** have `guestUserId: null` hardcoded at creation.
3. Therefore, **100% of real production `reservation.created` events dispatched from Owambe to CC will surface with `guest_owambe_user_id: null`.**

## 4. Operational Tension Resolution

The tension identified by the coordinator is confirmed as a **critical blocking issue** for the bilateral integration:

- **Owambe-side reality:** Every `reservation.created` event sent to CC will have `guest_owambe_user_id: null`.
- **CC-side reality:** The CC handler (per AC-CC-RC-3) strictly validates `guest_owambe_user_id` as a required UUID v4 and will reject every single `reservation.created` event with an HTTP 400/422 error.

If the Refactor-02 payload expansion is deployed to production in its current state, the bilateral integration will fail completely at the `reservation.created` step.

## 5. Forwarding to Coordinator

This verification output is forwarded to the coordinator-territory and CC strategic anchor scope for (beat-2) path determination.

Thread-1 remains standing by for (beat-3) direction (e.g., Brief Amendment / Rev 3 / null-handling refinement) before proceeding with any production deployment.
