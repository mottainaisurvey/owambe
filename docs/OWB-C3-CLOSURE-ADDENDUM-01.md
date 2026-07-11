# OWB-C3-EXPERIENCES-CUSTOMER-BOOKING-01 — Closure Record Addendum 01

**Issued by:** Thread-2 / Owambe Developer
**Date:** 2026-07-11
**Supersedes:** No prior content — addendum to `OWB-C3-EXPERIENCES-CUSTOMER-BOOKING-01-closure-report.md`

---

## Item 1 — Concurrency Mechanism Precision

The design-decisions document (`OWB-C3-DESIGN-DECISIONS.md`) correctly specifies `$executeRaw` as the mechanism. The closure report and invariants document incorrectly described the mechanism as `updateMany` with an arithmetic predicate. The invariants document is hereby corrected: the in-code mechanism is `$executeRaw`.

The actual code in `apps/api/src/routes/experience-bookings.ts` (lines 88–94) is:

```sql
UPDATE experience_slots
SET "bookedCount" = "bookedCount" + ${guestCount}
WHERE id = ${slotId}::uuid
  AND ("capacity" - "bookedCount") >= ${guestCount}
  AND "isActive" = true
```

This is a single conditional `UPDATE` statement executed at the database level via `prisma.$executeRaw`. The capacity predicate (`("capacity" - "bookedCount") >= ${guestCount}`) is evaluated atomically within the same row lock that applies the increment. Two concurrent requests will serialise at the PostgreSQL row lock; only one will satisfy the `WHERE` clause, and the other will receive `rowsAffected === 0`, which the handler converts to a `409 Conflict`. This mechanism is race-safe and correctly enforces the capacity predicate atomically. No defect is present.

The `updateMany` description in the closure report and invariants document was a documentation error. The invariant table entry for **Atomic Allocation** is corrected to read: "Capacity reservation is executed via `$executeRaw` conditional `UPDATE` at the database row level."

---

## Item 2 — Cancellation Scope Clarification

The cancel handler (`POST /api/experience-bookings/:id/cancel`) was **modified in C3**. The pre-C3 handler (commit `602d70e`) implemented a simple `prisma.$transaction` with `experienceBooking.update` (status → CANCELLED) and `experienceSlot.updateMany` (decrement `bookedCount`). The C3 implementation rewrote the handler to add: the `cancellationReason` field on the booking update, a `GREATEST(0, ...)` guard on the seat release via `$executeRaw`, an explicit `cancelledBy` discriminator (`GUEST` / `OPERATOR` / `SYSTEM`), and the `capacity_restoration_required: true` flag in the outbound `booking.cancelled` event payload.

The scope assessment is as follows: the cancel handler existed before C3 and was not introduced by C3. The C3 modifications are defensive improvements to an existing handler — the seat-release logic was already present, and the C3 changes added a safety guard and richer event payload. The design-decisions document Q2 described the seat-release as design intent; the implementation confirms it was already present and was hardened in C3. Q2 is re-marked accordingly: the seat-release mechanism is **implemented and in scope**, not deferred. The customer-initiated cancellation journey (UI flow, refund policy, operator notification) remains out of C3 scope and is a future authorised cycle item.

---

## Item 3 — Background-Sweep Re-Record (Known Operational Gap)

The "Payment Timeout" entry in `OWB-C3-INVARIANTS-AND-ENABLEMENT.md` is hereby re-recorded as a **KNOWN OPERATIONAL GAP**:

> **KNOWN OPERATIONAL GAP — Unpaid PENDING Seat Hold:** A booking created but not paid (Paystack session abandoned or expired) will hold its allocated seats indefinitely. No background sweep, TTL mechanism, or scheduled release exists within C3 scope. Unpaid `PENDING` bookings must be released manually by an operator or admin via the cancel endpoint. A background sweep (e.g., a scheduled job that cancels `PENDING` bookings older than a configurable TTL and releases their seats) is a deferred item for a future authorised cycle.

This replaces the prior invariant wording which implied the payment timeout was a defined operational behaviour. It is not — it is an absence of a release mechanism.

---

## Item 4 — Enabler vs. Capability Distinction

This section distinguishes the verification enabler used during C3 staging verification from the production platform capability actually delivered.

**Production Platform Capability (E2-delivered):** The admin experience approval endpoint (`POST /api/admin/experiences/:id/approve`) is a production platform capability delivered in the E2 cycle. It is gated by `authenticate + requireRole('ADMIN')` and is present in the production API. It is the mechanism by which the platform grants `isApproved = true` to an experience, satisfying the publication condition (`isApproved && isActive`). This capability was not introduced or modified in C3.

**C3 Verification Enabler (used during staging smoke):** During the C3 staging behavioural smoke, the admin approval endpoint could not be exercised because no staging admin credentials were available. The §8 enabler was therefore a **bounded-evidence-closure item** for the smoke. The auth boundary of the endpoint was confirmed (401 without token, 401 with incorrect credentials). The full happy-path booking flow — which requires an approved and published experience — was verified via the CI test suite using a mocked Paystack integration, not via a live staging end-to-end run. The live smoke confirmed all guards (DRAFT experience → 400, unauthenticated → 401, slot creation → 201) but did not exercise the Paystack redirect path.

**What was not used:** No staging admin account was created, no SQL data manipulation was performed, and no bypass of the `isApproved` gate was introduced. The production platform capability is intact and unmodified.

---

Signed: **Thread-2 / Owambe Developer**
