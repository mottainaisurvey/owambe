# OWB-C3-EXPERIENCES-CUSTOMER-BOOKING-01
## Design Decisions Document
**Authored by:** Thread-2 / Owambe Developer
**Date:** 2026-07-11
**Cycle:** C3 — Experiences Customer-Facing Booking Flow
**Status:** Pre-implementation (AC-1)

---

## 1. Five-Element Mandate

The C3 design decisions document is required to address five explicit questions before any implementation begins. These questions govern the concurrency mechanism, seat-release semantics, and the inheritance contract that C3 establishes for Phase D.

---

## 2. Question 1 — Concurrency Mechanism

**Question:** What mechanism will be used to prevent double-booking when two consumers attempt to book the last available seat in the same slot simultaneously?

**Evidence gathered at AC-0:** The existing `POST /api/experience-bookings` handler uses `prisma.$transaction([create, update])` — a sequential two-statement transaction. This is NOT a conditional atomic update. It reads `slot.bookedCount` and `slot.capacity` in a separate query before the transaction, then increments `bookedCount` unconditionally inside the transaction. Under concurrent load, two requests can both read `availableSpots = 1`, both pass the guard, and both proceed to increment — resulting in `bookedCount` exceeding `capacity`.

**Options considered:**

| Option | Mechanism | Reliability | Complexity | C3 Fit |
|---|---|---|---|---|
| A | Sequential transaction (current) | Unsafe under concurrency | Low | No |
| B | Prisma `$executeRaw` with conditional UPDATE + row count check | Atomic at DB level | Medium | Yes |
| C | PostgreSQL advisory lock per slotId | Serialises requests per slot | High | Overkill for C3 volume |
| D | Optimistic concurrency via `version` field + retry | Requires schema addition | Medium-high | Viable but adds schema |

**Recommended approach: Option B — atomic conditional UPDATE with row count check.**

The implementation uses a single `$executeRaw` statement:

```sql
UPDATE experience_slots
SET "bookedCount" = "bookedCount" + $guestCount
WHERE id = $slotId
  AND ("capacity" - "bookedCount") >= $guestCount
  AND "isActive" = true
```

The affected row count is checked: if `rowsAffected === 0`, the slot is sold out or cancelled and a `409 SLOT_SOLD_OUT` error is returned. If `rowsAffected === 1`, the increment succeeded atomically. The `ExperienceBooking` record is then created in the same database transaction using `prisma.$transaction`.

**Reliability evidence:** PostgreSQL UPDATE statements are atomic at the row level. The WHERE clause acts as a compare-and-set guard. Two concurrent requests will serialise at the row lock — only one will succeed; the other will find `capacity - bookedCount < guestCount` and return 0 rows affected. This is the canonical PostgreSQL pattern for inventory decrement.

**Migration implications:** No schema change required. The `bookedCount` and `capacity` fields already exist on `ExperienceSlot`. No new fields are added.

---

## 3. Question 2 — Seat-Release Semantics

**Question:** When a booking is cancelled (by guest or operator), should the seat be released immediately (synchronous) or deferred (asynchronous/queue)?

**Evidence gathered at AC-0:** The Stays precedent does not release seats on Paystack failure — the booking row persists with `status: PENDING`. The C2 cancel-slot endpoint sets `isActive: false` on the slot instance (destructive cancellation per C2 invariant). The existing experience booking cancel endpoint exists but does not decrement `bookedCount`.

**Options considered:**

| Option | Mechanism | Consistency | Complexity |
|---|---|---|---|
| A | Synchronous decrement in cancel handler | Immediate, consistent | Low |
| B | Queue-based decrement (BullMQ) | Eventual, resilient to handler failure | High |
| C | No release — seats permanently consumed | Simple | Unacceptable for C3 |

**Recommended approach: Option A — synchronous decrement in the cancel handler.**

When a guest cancels a booking with `status: PENDING` or `status: CONFIRMED`, the cancel handler atomically decrements `bookedCount` by `booking.guestCount` using the same conditional UPDATE pattern. The decrement is bounded: `bookedCount` cannot go below 0 (enforced by `WHERE bookedCount >= guestCount`). The booking status is set to `CANCELLED` in the same transaction.

**Seat-release invariant (C3 → Phase D inheritance):** A cancelled booking MUST release its seats synchronously. Phase D must not assume seats are permanently consumed on cancellation. The `bookedCount` field reflects current live demand, not historical demand.

---

## 4. Question 3 — Publication Condition

**Question:** What is the exact publication condition that must be satisfied before a consumer can discover or book an experience?

**Evidence gathered at AC-0:** The C2 invariants document defines: `isApproved && isActive` is the customer-visible publication condition. The existing `GET /api/experiences` handler must enforce this. The booking creation handler must also enforce this (a consumer should not be able to book an experience that has been unpublished or had approval revoked after they loaded the page).

**Recommended approach:** Both the discovery endpoint (`GET /api/experiences`) and the booking creation handler (`POST /api/experience-bookings`) enforce `isApproved: true, isActive: true` on the Experience. The slot must additionally have `isActive: true` and `startTime > now`. This is a double-gate: the consumer cannot discover unpublished experiences, and cannot book them even if they have a direct link.

**Phase D inheritance:** The publication condition `isApproved && isActive` is a C2 invariant. Phase D must not relax this condition. Any CC-side consumer flow must pass through the same gate.

---

## 5. Question 4 — meetingDetails Disclosure

**Question:** When should `meetingDetails` be disclosed to the consumer, and what is the disclosure gate?

**Evidence gathered at AC-0:** `meetingDetails` is a nullable `String?` field on `Experience` (added in C1). The brief states: "meetingDetails disclosed only after payment confirmation."

**Recommended approach:** The `GET /api/experiences` (discovery) and `GET /api/experiences/:slug` (detail) endpoints do NOT include `meetingDetails` in their response. The `GET /api/experience-bookings/:id` (booking detail) endpoint includes `meetingDetails` ONLY when `booking.paymentStatus === 'PAID'` or `booking.status === 'CONFIRMED'`. This is enforced at the API response layer, not at the database query layer — the field is selected but conditionally omitted from the serialised response.

**Phase D inheritance:** Phase D must not expose `meetingDetails` before payment confirmation. The disclosure gate is `paymentStatus === 'PAID'`.

---

## 6. Question 5 — requireMode Correction

**Question:** The existing `POST /api/experience-bookings` handler has `requireMode('EXPERIENCES')`. This will block consumer users. What is the correct mode gate for the consumer booking endpoint?

**Evidence gathered at AC-0:** `requireMode('EXPERIENCES')` checks that the user's `activeMode` is `EXPERIENCES`. Consumer users (role: CONSUMER or PLANNER or any authenticated user) do not have `EXPERIENCES` mode — that mode belongs to OPERATOR users. This is a pre-existing scaffolding error in the C1 route stub.

**Recommended approach:** Remove `requireMode('EXPERIENCES')` from the `POST /api/experience-bookings` consumer endpoint. The endpoint requires `authenticate` (any authenticated user). The OPERATOR-facing endpoints (`GET /api/experience-bookings/operator`) retain `requireRole('OPERATOR') + requireMode('EXPERIENCES')`. This correction is not a new feature — it is a fix to a scaffolding error that would have blocked all consumer bookings.

---

## 7. Guest Confirmation Email — Escalation Resolution

**Escalation declared at AC-0:** No `guest-experience-booking-confirmed` template exists. The brief requires pattern-match to existing templates; if no pattern exists, escalate.

**Resolution:** The `guest-stay-reservation-pending` template exists and follows the exact structural pattern required (HTML shell, data shape, CTA button). A `guest-experience-booking-confirmed` template will be added to `email.service.ts` following this pattern exactly — same HTML structure, same data field naming convention (`firstName`, `experienceName`, `slotDate`, `slotTime`, `guestCount`, `totalAmount`, `reference`, `manageUrl`). This is a pattern-match extension, not an invention. The template is added inline in `email.service.ts` alongside the existing templates.

---

## 8. C3 Invariants (Inherited by Phase D)

The following invariants are established by C3 and must be inherited by Phase D without reinterpretation:

| Invariant | Definition |
|---|---|
| **Atomic seat decrement** | Seat reservation uses conditional UPDATE at DB level; `rowsAffected === 0` means sold out |
| **Synchronous seat release** | Cancellation decrements `bookedCount` in the same transaction as status update |
| **Double publication gate** | Discovery AND booking both enforce `isApproved && isActive` on Experience |
| **meetingDetails disclosure gate** | `meetingDetails` only disclosed when `paymentStatus === 'PAID'` |
| **Consumer mode-agnostic booking** | Consumer booking endpoint requires `authenticate` only, not `requireMode('EXPERIENCES')` |
| **Operator notification** | `operator-new-booking` email sent on every new booking via `setImmediate` (non-blocking) |
| **Guest confirmation** | `guest-experience-booking-confirmed` email sent on booking creation (post-Paystack init) |
| **Paystack-first response** | Response includes `payment.authorizationUrl` — consumer must be redirected to Paystack |
| **Booking persists on Paystack failure** | Booking row exists with `status: PENDING, paymentStatus: PENDING`; seat is held |

---

*Signed: Thread-2 / Owambe Developer — 2026-07-11*
