# Phase 5.2 Multi-Channel Architecture

**Date:** 2026-05-25
**Context:** Phase 5.2 Engineering Scope Overview
**Status:** Substantively closed Owambe-side under decoupled disposition

This document captures the Phase 5.2 architectural achievement as a durable engagement-record artefact. It articulates the multi-channel architectural commitment achieved under Phase 5.2 and serves as future-onboarding-context for when CC-side capacity engages, when a future second channel integration target onboards, or for future strategic evolution.

---

## Section A: Phase 5.2 Engineering Scope Overview

Phase 5.2 transformed the Owambe integration architecture from a single-channel-target hardcoded implementation (the historical OWB-WAVE-4-04 Coastal Corridor integration) into a generalised, multi-channel architectural commitment.

The engineering scope was executed across four Briefs and two Amendments:

- **Brief A Rev 2 + Amendments 01/02:** Established the channel registry foundation. Introduced the `Channel` model as the canonical state source, adding `destinationUrl` and `timestampHeader` fields to support channel-specific routing and declarative header emission.
- **Brief B Rev 2 (Schema Field Generalisation):** Migrated the Prisma and DB layers to use a generalised `channelId` foreign key, replacing the hardcoded `ccPropertyId` with `externalPartnerPropertyId` and establishing reverse relations for `StayBooking` and `ExperienceBooking`.
- **Brief C Rev 2 (Auth Middleware Generalisation):** Implemented the inbound declarative read pattern. The `verifyChannelSignature` factory now reads `channel.signatureHeader`, `channel.timestampHeader`, and `channel.hmacSecret` dynamically from the channel registry, replacing hardcoded `x-cc-signature` logic.
- **Brief D Rev 2 (Webhook Dispatcher Generalisation):** Implemented the outbound declarative read pattern, Pattern α capability dispatch, a per-channel circuit breaker, and booking-family infrastructure.

---

## Section B: Channel Registry as Canonical State Source

The `Channel` model in the Prisma schema serves as the canonical state source for channel identity, auth, capabilities, destination, and state.

### Channel Record Schema
- **Identity:** `id`, `slug`, `name`
- **State:** `state` (Enum: `ACTIVE`, `PAUSED`, `DEPRECATED`, `DECOMMISSIONED`)
- **Capabilities:** `supportsStays`, `supportsExperiences`, `supportsEvents`, `supportsVendors`
- **Auth & Routing:** `authScheme`, `signatureHeader`, `timestampHeader`, `hmacSecret`, `destinationUrl`

### Channel State Enum Semantics
- **ACTIVE:** Fully operational; receives outbound dispatches and accepts inbound webhooks.
- **PAUSED:** Temporarily suspended; inbound returns 503, outbound dispatch skipped.
- **DEPRECATED:** Operational but marked for phase-out.
- **DECOMMISSIONED:** Permanently disabled; inbound returns 410, outbound dispatch skipped.

### Capability Flag Pattern
Channels declare their supported event families via boolean flags (`supportsStays`, `supportsExperiences`). The dispatcher uses these flags to filter which channels receive specific events.

### Seed Pattern
The database is seeded with two channels:
1. `coastal-corridor`: The primary integration target.
2. `test-channel`: A secondary channel used to verify multi-channel routing and auth isolation.

### Path α-Secret Credentials-in-DB Resolution
Per the founder reconciliation architectural decision (2026-05-25), HMAC secrets are stored directly in the database (`hmacSecret` TEXT column) rather than by reference.

---

## Section C: Declarative Read Pattern Symmetry (Inbound + Outbound)

Phase 5.2 achieved architectural symmetry by implementing a declarative read pattern for both inbound and outbound webhook traffic.

- **Inbound (Brief C):** The `verifyChannelSignature` factory dynamically reads `channel.signatureHeader`, `channel.timestampHeader`, and `channel.hmacSecret` from the database to authenticate incoming requests.
- **Outbound (Brief D):** The dispatcher reads `channel.signatureHeader` and `channel.timestampHeader` from the channel record (resolved at enqueue time into `WebhookJobData`) to construct outbound HTTP headers.

This symmetry ensures that no hardcoded header strings exist in the dispatch or auth paths, fulfilling the architectural commitment of the multi-channel generalisation.

---

## Section D: Pattern α Greenfield Implementation

The outbound webhook dispatcher was rewritten to support multi-channel fan-out using Pattern α capability dispatch.

### Mode-Based Capability Dispatch
The dispatcher queries `prisma.channel.findMany({ where: { state: 'ACTIVE' } })` and filters the results based on the event family:
- **Reservation events:** Require `channel.supportsStays`
- **Booking events:** Require `channel.supportsStays || channel.supportsExperiences`

### Per-Channel Circuit Breaker
To prevent cascading failures, the dispatcher implements an in-memory circuit breaker per channel:
- **Threshold:** 20 consecutive failures triggers the `OPEN` state.
- **Timeout:** After 120 seconds, the state transitions to `HALF_OPEN` to probe for recovery.

---

## Section E: Transition Window Pattern (Path (ii) Receiving-Side-Ready-First)

To ensure zero downtime during the migration from legacy to canonical headers and routes, Phase 5.2 employs the Path (ii) receiving-side-ready-first transition window pattern.

1. **Dual Acceptance:** The receiving side (Owambe inbound) accepts both legacy (`x-cc-signature`) and canonical (`X-Signature`) headers transiently.
2. **Sender Cutover:** The sending side switches to canonical headers only after receiving-side readiness is confirmed.
3. **Closure Confirmation:** The transition window closes after a 7-day zero-legacy-traffic period, bilateral wire probes, and a 7-day soak period.

This pattern serves as the forward operational model for the cutover cycle when CC-side capacity engages.

---

## Section F: Decoupled Disposition per Founder Reconciliation 2026-05-25

Per the founder reconciliation on 2026-05-25, Phase 5.2 code execution was decoupled from the production cutover.

- **Execution Closed:** Brief D code execution was completed and merged without firing the canonical cutover.
- **Wire-Flowing Preserved:** Infrastructure deployment proceeded without breaking the existing Phase 5.1 wire-flowing integration.
- **Cutover Deferred:** The canonical cutover (production flip from legacy headers/routes to canonical) is explicitly deferred to a dedicated cycle when CC-side capacity is engaged.

This decoupled disposition ensures that code execution is substantively separable from production cutover risks.
