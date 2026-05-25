# Phase 5.2 Engagement Record

**Date:** 2026-05-25
**Context:** Phase 5.2 Sub-Shape Banking & Forward Engineering Items
**Status:** Substantively closed Owambe-side under decoupled disposition

This document serves as the durable engagement record for Phase 5.2, banking the sub-shapes achieved and articulating the forward engineering items required for the cutover cycle and subsequent phases.

---

## Section A: Sub-Shape Banking

Phase 5.2 successfully banked the following architectural sub-shapes, transforming the integration from a hardcoded single-partner implementation to a generalised multi-channel architecture:

1. **Channel Registry Foundation (Brief A Rev 2 + Amendments 01/02):**
   - `Channel` model established as the canonical state source.
   - `destinationUrl` and `timestampHeader` fields added.
   - Seed script updated to populate `coastal-corridor` and `test-channel`.

2. **Schema Field Generalisation (Brief B Rev 2):**
   - `channelId` foreign key implemented on `StayBooking` and `ExperienceBooking`.
   - `ccPropertyId` renamed to `externalPartnerPropertyId`.
   - Legacy rows backfilled to the `coastal-corridor` channel record.

3. **Auth Middleware Generalisation (Brief C Rev 2):**
   - `verifyChannelSignature` factory implemented (inbound declarative read pattern).
   - `channelRateLimiter` generalised to use `channelSlug` identity.
   - Canonical route (`/api/v1/channels/:channelSlug/webhooks/inbound`) established alongside legacy route fallback.

4. **Webhook Dispatcher Generalisation (Brief D Rev 2):**
   - Channel-driven dispatch loop implemented (outbound declarative read pattern).
   - Pattern α capability dispatch (`supportsStays`, `supportsExperiences`) implemented.
   - Per-channel circuit breaker (20 failures / 120s timeout) implemented.
   - Booking event family (`booking.created`, `booking.cancelled`, `booking.refunded`) defined and gated by `OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED`.
   - Spec-canonical event naming (`reservation.guest_checked_in`, `reservation.guest_checked_out`) enforced.
   - `WebhookDeliveryLog.channelSlug` migration (D5 correction) applied.

5. **Vocabulary Canonicalisation (Brief EF Rev 2):**
   - "Partner" terminology systematically replaced with "Channel" terminology in `channel.ts` and `channelRateLimiter.ts`.

---

## Section B: Forward Engineering Items (Cutover Cycle)

Per the decoupled disposition, the following items are explicitly deferred to a dedicated cutover cycle when CC-side capacity is engaged:

1. **Bilateral Wire Probes:**
   - Execute AC-D10 wire probe (outbound canonical headers).
   - Execute AC-C4/AC-C6 wire probes (inbound canonical/legacy routes).

2. **Transition Window Closure:**
   - Monitor legacy route traffic for 7 days post-cutover.
   - Remove legacy route fallback from `verifyChannelSignature`.
   - Remove legacy route mount from `index.ts`.

3. **Booking Event Family Enablement:**
   - Set `OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED=true` in production environment variables.
   - Verify CC-side ingestion of `booking.*` events.

4. **Insert Helper Implementation (AC-B5 Scope Surface):**
   - Implement `createStayBookingWithChannel` and `createExperienceBookingWithChannel` helpers in consumer-facing booking routes to enforce `channelId` invariants.

---

## Section C: Strategic Evolution (Briefs E + F)

Following the successful cutover cycle, the engagement will proceed to Briefs E and F:

- **Brief E:** Vendor Marketplace Expansion (EXPANSION-01 / EXPANSION-02).
- **Brief F:** Multi-Tenant Architecture / White-Labeling.

This engagement record serves as the foundational context for these subsequent phases, ensuring architectural continuity and strategic alignment.
