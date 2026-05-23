# Owambe–Coastal Corridor Integration Status

**Last Updated:** 2026-05-23 (Post-Phase 5.1 Closure)
**Environment:** Staging (`owambe-api-staging.up.railway.app`)
**Current Build:** `d0a8116` (master) / `c4133d7` (staging)

This document serves as the comprehensive source of truth for the Owambe–Coastal Corridor (CC) integration engagement, tracking progress from inception through the current operational state.

---

## 1. Executive Summary

The Owambe–Coastal Corridor integration is a bidirectional channel partnership enabling Coastal Corridor to distribute Owambe's Stays and Experiences inventory, and Owambe to sync reservations and bookings back to hosts and operators.

The engagement is currently in **Wave 5**. The most recent milestone achieved is the **bilateral closure of Phase 5.1 (Experience Booking Sync)**, which verified the operational integrity of the inbound experience booking webhook handler, including HMAC authentication, field validation, UUID parsing, and database execution.

The staging environment is fully operational, with all critical infrastructure (Postgres, Redis, Railway deployments) restored and stable.

---

## 2. Engagement Phasing & History

The integration has been delivered through a structured, multi-wave engagement model.

### Wave 1–3: Foundation (Completed)
* **Phase A (Platform Core):** Delivery of the core Owambe platform (Events, Stays, Experiences modes), Prisma schema, and initial API scaffolding.
* **Phase A.5 (Integration Prep):** Addition of CC-specific enums (`ChannelOrigin`, `CohortType`), currency support (NGN/USD/GBP), and the initial `CoastalCorridorAdapter` scaffold.
* **Phase B (Stays Mode):** Implementation of the Stays mode schema, outbound CC adapter for property sync, inbound notifications, and host UI surfaces.
* **Phase C (Commission & Finance):** Implementation of the commission audit log, payment status canonicalization (`PAID`, `REFUNDED`), and Redis-backed idempotency for reservation updates.

### Wave 4: Stays Sync & Reconciliation (Completed)
* **OWB-WAVE-4-01:** Joint window verification of the inbound Stays reservation sync (`POST /stays/reservations`) and status transition (`PATCH /stays/reservations/:id`).
* **OWB-WAVE-4-03:** Implementation of the nightly reconciliation cron (BullMQ) for auto-correcting calendar/commission drift and flagging manual review items.
* **OWB-WAVE-4-04:** Implementation of per-channel-partner rate limiting (120/min webhooks, 10/hr reconciliation).

### Wave 5: Experiences Sync & Generalization (In Progress)
* **Phase 5.1 (Experience Booking Sync):** **CLOSED.** Verified the inbound `POST /api/v1/channel/experiences/bookings` endpoint. Addressed CC-side field naming alignment and Owambe-side defensive UUID validation.
* **Phase 5.2 (Multi-Channel Generalization):** *Pending.* Refactoring the CC-specific integration into a generalized channel registry and adapter pattern.
* **Phase 5.3 (Operational Hardening):** *Pending.* Coordinated test data alignment and diagnostic tooling drift validation.
* **Phase 5.4 (Owambe Feature Expansion):** *Pending.*
* **Phase 5.5 (CC Platform Features):** *Pending.*

---

## 3. Current Operational State (Post-Phase 5.1)

### 3.1. Infrastructure & Environment
* **API Hosting:** Railway (`owambe-api-staging.up.railway.app`)
* **Database:** PostgreSQL on Railway (`tramway.proxy.rlwy.net`)
* **Cache/Queue:** Redis on Railway (BullMQ)
* **CI/CD:** GitHub Actions (`ci-cd.yml`) with automated Railway deployments on push to `staging` and `master`.

### 3.2. Integration Endpoints (Inbound from CC)

All inbound endpoints are protected by HMAC-SHA256 signature verification (`x-cc-signature`, `x-cc-timestamp`).

| Endpoint | Method | Status | Notes |
| :--- | :--- | :--- | :--- |
| `/api/v1/channel/stays/reservations` | `POST` | ✅ Operational | Verified in Wave 4. Scaffolds `ccPropertyId`. |
| `/api/v1/channel/stays/reservations/:id` | `PATCH` | ✅ Operational | Verified in Wave 4. Includes Redis idempotency. |
| `/api/v1/channel/experiences/bookings` | `POST` | ✅ Operational | Closed in Phase 5.1. Includes defensive UUID validation (HTTP 422). |

### 3.3. Integration Endpoints (Outbound to CC)

Outbound calls are handled by the `CoastalCorridorAdapter` and signed with `x-owambe-signature`.

| Action | Status | Notes |
| :--- | :--- | :--- |
| **Property Sync** | ✅ Operational | Pushes room availability and rates to CC. |
| **Webhook Dispatch** | ✅ Operational | Dispatches status updates to CC via `webhookDispatcher.service.ts`. |

---

## 4. Recent Resolutions & Fixes

During the Phase 5.1 closure cycle, several critical issues were identified and resolved:

1. **Postgres Crash-Loop:** Resolved a Railway infrastructure issue where the Postgres container failed to start (`catatonit` pid1 error) by forcing a fresh image redeploy.
2. **Prisma Migration Blocker:** Fixed a failed migration record (`20260511000001_pay_canonical_01_step2`) directly in the `_prisma_migrations` table via `psycopg2`, unblocking Railway deployments.
3. **Logger Masking:** Updated the logger utility to include metadata in the `printf` format, ensuring Prisma error objects are visible in Railway logs instead of `[object Object]`.
4. **UUID Validation (Defensive Fix):** Added regex validation for `owambe_time_slot_id` in the experiences booking handler. It now returns a structured `HTTP 422 INVALID_SLOT_ID` instead of throwing a Prisma `P2023` error (HTTP 500) when CC sends non-UUID test strings (e.g., `probe-slot-*`).

---

## 5. Known Deviations & Technical Debt

* **CalendarEntry Status:** The `CalendarEntry` model uses a four-state enum (`AVAILABLE`, `BLOCKED`, `BOOKED`, `MAINTENANCE`) rather than a simple boolean. The CC adapter maps this back to a boolean for outbound sync.
* **Pricing Model:** Uses `Room.pricePerNight` as the base rate and `CalendarEntry.rateOverride` for specific dates, rather than a single rate field.
* **Test Data Scaffolding:** The staging database currently contains limited, uncoordinated test data. CC's recent test bookings referenced non-existent Experience IDs and invalid Slot UUIDs. A coordinated test data alignment exercise is slated for Phase 5.3.
* **`ccPropertyId` Scaffold:** The `ccPropertyId` field on `StayBooking` is currently scaffolded (nullable) because the CC outbound stays-reservation sender is not yet fully built.

---

## 6. Next Steps & Sequencing

1. **CC-Side Sub-items (Phase 5.1):**
   * CC developer to provide AC-0 findings on `CC-WEBHOOK-HANDLERS-01`.
   * CC to author the outbound stays-reservation sender brief.
2. **Phase 5.1 Final Consolidation:** Await completion of the above CC-side items.
3. **Phase 5.2 Trigger:** Initiate brief authoring for the multi-channel generalization refactor (six tentative briefs A-F).
4. **Track 2 Cleanup:** Draft the cosmetic cleanup brief (deferred from prior cycles).
