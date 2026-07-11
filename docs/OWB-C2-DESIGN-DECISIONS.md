# OWB-C2-EXPERIENCES-SLOT-SCHEDULING-01: Design Decisions

**Author:** Thread-2 / Owambe Developer  
**Date:** July 11, 2026  
**Status:** AC-1 — Documented BEFORE implementation. This document is an architectural artefact. C3 and Phase D may rely on the invariants recorded here without rediscovery.

---

## C2-a: Recurrence and Slot-Instance Model

### Element 1 — Existing Model Found (Direct Inspection)

The `ExperienceSlot` model at baseline `138cd95` contains the following fields: `id` (UUID, PK), `experienceId` (UUID FK), `startTime` (DateTime), `endTime` (DateTime), `capacity` (Int), `bookedCount` (Int, default 0), `isActive` (Boolean, default true), `createdAt` (DateTime). The `ExperienceBooking` model references `slotId` as a non-nullable UUID FK.

**What is absent:** no `rruleString`, no `timezone`, no `parentSlotId`, no `seriesId`, no `recurrenceId`, no `instanceIndex` field. The recurrence integration pattern is entirely new — no pre-existing platform convention exists to inherit.

**What is present and constraining:** `ExperienceBooking.slotId` is a non-nullable FK. This is the most important structural constraint: every booking must reference a stable, persistent slot-instance row. Any model that does not materialise slot instances as persistent rows is structurally incompatible with the existing schema.

### Element 2 — Options Considered

Three options were evaluated against the decision criteria.

**Option A — On-the-fly expansion (rule stored, no instances materialised).** The `ExperienceSlot` table stores a recurrence rule string. At query time, the rule is expanded into virtual instances. No persistent instance rows exist; bookings would reference a virtual instance identifier (e.g., a composite of slotId + occurrence index).

This option is **structurally incompatible** with the existing schema. `ExperienceBooking.slotId` is a non-nullable FK to `experience_slots`. A virtual instance has no row to reference. Adopting this option would require a non-additive schema change (making `slotId` nullable or replacing it with a composite key), which is a trigger-3 non-additive schema change. **Option A is eliminated.**

**Option B — Stored rule with fully materialised instances.** A parent `ExperienceSlot` row stores the recurrence rule. Each occurrence is materialised as a child `ExperienceSlot` row at creation time, linked to the parent via a `parentSlotId` FK. Bookings reference child instance rows. The full series is materialised eagerly at rule-creation time up to the COUNT or UNTIL bound.

This option is fully compatible with the existing FK constraint. It provides stable instance identity, per-instance capacity tracking, and straightforward single-instance vs series cancel semantics. The trade-off is that large COUNT values (e.g., COUNT=52 for a weekly series over a year) materialise 52 rows at creation time — acceptable at operator-configuration scale.

**Option C — Rolling-horizon hybrid.** A parent rule row exists. Instances are materialised over a rolling time horizon (e.g., 90 days ahead) by a background job that runs periodically. Instances beyond the horizon do not yet exist as rows.

This option introduces background-job/cron machinery (trigger-5). The `bullmq` + `ioredis` infrastructure exists in the repo, so the machinery is available, but introducing a background materialisation job adds operational complexity (job failure modes, horizon gaps, instance identity gaps for bookings that arrive before materialisation). It also creates a bounded-evidence gap: instances beyond the horizon are not verifiable at C2 scope. **Option C is deferred as an out-of-scope optimisation** — it becomes relevant only if series length at operator scale proves problematic, which is not evidenced at C2.

### Element 3 — Recommendation and Rationale

**Recommendation: Option B — Stored rule with fully materialised instances.**

The rationale is as follows. The `ExperienceBooking.slotId` non-nullable FK structurally eliminates Option A. Between Option B and Option C, Option B is preferred because: (i) it requires no background job machinery (trigger-5 not fired); (ii) it provides immediate, complete instance identity for all occurrences at creation time; (iii) it is simpler to reason about at C3 booking time — a booking selects from a list of persistent rows with known capacity; (iv) the scale concern that motivates Option C (large series producing many rows) is not evidenced at operator-configuration scale for the supported RRULE subset (daily/weekly with COUNT or UNTIL bounds). The supported subset is explicitly bounded: daily and weekly patterns with BYDAY, COUNT or UNTIL — not unbounded open-ended series.

**RRULE library decision (trigger-4 flagged):** The `rrule` npm package (`rrule@^2.8.1`) is introduced as a new dependency. Rationale: `date-fns` does not provide RRULE parsing or expansion. Implementing a bounded in-house RRULE expander for the supported subset (FREQ=DAILY/WEEKLY, BYDAY, COUNT, UNTIL) is feasible but introduces a maintenance surface for a well-specified standard. The `rrule` package is the canonical JavaScript implementation of RFC 5545 recurrence rules, is actively maintained, has no sub-dependencies, and is the industry standard for this purpose. The supported subset (FREQ=DAILY/WEEKLY + BYDAY + COUNT/UNTIL) is a strict subset of what `rrule` handles — the library is not over-engineered for this use case. **This is a flagged dependency introduction per trigger-4, not silent.**

### Element 4 — Migration Implications

The selected model requires two additive schema changes to `ExperienceSlot`:

1. `rruleString String?` — stores the RFC 5545 RRULE string for the parent row of a recurring series (null for one-off slots and child instance rows).
2. `timezone String?` — stores the IANA timezone identifier (e.g., `Africa/Lagos`) at which the recurrence rule was authored. Required for correct timezone-anchored expansion (see Question 2 below).
3. `parentSlotId String? @db.Uuid` — FK to the parent `ExperienceSlot` row. Null for one-off slots and parent rows; set for child instance rows.

All three fields are nullable and additive. No existing rows are affected. No existing queries are broken. The migration is a single `ALTER TABLE experience_slots ADD COLUMN` for each field. No non-additive change is required.

### Element 5 — C3 and Phase D Compatibility Implications

**C3 compatibility.** C3 will implement the customer-facing booking flow: browse experiences → select slot → book. The slot-selection step requires C3 to query available (non-cancelled, non-sold-out) slot instances for a given experience. Under Option B, this is a straightforward `prisma.experienceSlot.findMany` filtered by `experienceId`, `isActive: true`, `startTime >= now`, and `bookedCount < capacity`. The `bookedCount` field is already present. C3 must increment `bookedCount` at booking creation (within a transaction with the booking row creation). C3 must respect cancel semantics: a cancelled single instance has `isActive: false`; a cancelled series sets `isActive: false` on all future instances with `parentSlotId = cancelledParentId AND startTime > now`. C3 does not need to interpret `rruleString` — it consumes materialised instances only.

**Phase D compatibility.** Phase D (Coastal Corridor consumer workstream) will consume the slot availability wire shape. Under Option B, the wire shape is a list of materialised instance objects: `{ id, experienceId, startTime, endTime, capacity, bookedCount, availableSpots, isSoldOut, timezone, parentSlotId }`. The `timezone` field enables Phase D to display times in the correct local timezone. The `parentSlotId` field enables Phase D to group instances by series if needed. The publication condition (`isActive && isApproved` on the parent `Experience`) governs which experiences' slots are surfaced — this is unchanged from C1.

---

## Five Explicit Questions (Gate-1 Guidance)

### Question 1 — Rule-Level vs Instance-Level Mutation Semantics

Under Option B, both rule-level and instance-level mutations are possible and have distinct semantics.

**Instance-level mutation** (edit a single occurrence): the child `ExperienceSlot` row is updated directly (`startTime`, `endTime`, `capacity`). The parent `rruleString` is not changed. Future instances generated from the rule are unaffected. This is the correct semantic for "this week's session starts an hour later."

**Rule-level mutation** (edit the series going forward): the parent row's `rruleString` is updated. All future child instance rows (those with `parentSlotId = parentId AND startTime > now AND isActive = true AND bookedCount = 0`) are deleted and re-materialised from the new rule. Instances with existing bookings (`bookedCount > 0`) are **preserved** — they are not deleted or reassigned. This is the booking-identity preservation guarantee: a rule edit never orphans an existing booking. The operator is shown a warning that instances with bookings will not be affected by the rule change.

**Operator's default mental model:** the operator's default "edit the schedule" action is instance-level (edit one occurrence). Rule-level mutation ("change the series going forward") is an explicit, distinct action surface. This distinction is surfaced in the UI.

### Question 2 — Timezone-Anchored Recurrence Representation

The representation is: **RRULE string authored at a specific IANA timezone, stored alongside the timezone identifier, expanded to UTC for storage.**

Concretely: when an operator creates a recurring slot "every Monday 9:00 AM – 11:00 AM", the system receives `startTime: "09:00"`, `endTime: "11:00"`, `timezone: "Africa/Lagos"`, `rruleString: "FREQ=WEEKLY;BYDAY=MO;COUNT=10"`. The expansion step uses `rrule` with the `dtstart` anchored to the first Monday at 09:00 Africa/Lagos, converted to UTC. Each materialised instance row stores `startTime` and `endTime` as UTC `DateTime` values (Prisma/PostgreSQL `timestamp without time zone` interpreted as UTC). The `timezone` field on the parent slot row records the authoring timezone.

**Interaction with UTC storage:** all `startTime`/`endTime` values in the database are UTC. Display-layer conversion (operator portal, Phase D wire shape) uses the `timezone` field to render local times. This is the correct pattern for a platform that may eventually serve multiple timezones.

**Africa/Lagos has no DST.** UTC+1 year-round. This means UTC offset is constant and timezone-anchored expansion produces no DST edge cases for the primary operational timezone. DST edge-case testing is explicitly deferred as a bounded-evidence-closure (recorded at AC-5): it becomes live if scope ever spans DST-observing zones.

**Phase D wire shape interaction:** the `timezone` field is included in the slot instance wire shape. Phase D displays times using the slot's `timezone` field. This is an invariant (see C2 Invariants section below).

### Question 3 — Backfill/History Behaviour on Rule Edits

**Past instances are immutable.** A rule edit never modifies instances whose `startTime < now`. This is enforced at the API level: the rule-mutation endpoint only deletes and re-materialises future instances (`startTime > now`) with zero bookings. Past instances remain as a permanent record of what was scheduled and when. This prevents audit loss and is consistent with the principle that a booking confirmation references a specific, immutable slot occurrence.

**Rule-vs-instance divergence for past instances:** after a rule edit, past instances may no longer match the current rule. This is intentional and correct — the rule describes the future schedule, not a retroactive restatement of history.

**Retroactive edits:** not permitted via the rule-mutation endpoint. An operator who needs to correct a past instance's record must use the single-instance edit endpoint (which is unrestricted by time direction at the API level, but the UI surfaces it as a forward-looking action).

### Question 4 — Materialisation Horizon (Hybrid Model)

Option C (rolling-horizon hybrid) was not selected. This question is answered as a design boundary: **no materialisation horizon parameter and no background job are introduced in C2.** Full eager materialisation at rule-creation time is used for the supported RRULE subset (FREQ=DAILY/WEEKLY + BYDAY + COUNT/UNTIL). The COUNT and UNTIL bounds are mandatory for recurring series — open-ended series (no COUNT, no UNTIL) are not supported in C2. This constraint prevents unbounded materialisation and is enforced at the API validation layer.

If future operational evidence shows that series length at operator scale is problematic, a rolling-horizon materialisation job can be introduced in a later authorised cycle. The schema is forward-compatible with that change (the `parentSlotId` FK and `rruleString` field support it). **Trigger-5 is not fired in C2.**

### Question 5 — Implied Phase D Consumption Pattern (Invariant)

**Phase D consumes materialised instance rows directly.** The consumption pattern is: query `GET /api/experiences/:id/slots?from=<date>&to=<date>` (or equivalent consumer-facing endpoint at C3) which returns a list of materialised `ExperienceSlot` instance objects filtered by `isActive: true`, `startTime >= from`, `startTime <= to`, and the parent experience's `isActive && isApproved` publication condition. Phase D does not expand rules client-side. Phase D does not call a server-side expansion endpoint. Phase D reads pre-materialised rows.

**This is recorded as a C2 invariant** (see below). If Phase D ever needs to change this consumption pattern, it requires an explicit authorised amendment cycle — it cannot be changed unilaterally.

---

## C2 Invariants

The following assumptions may be relied upon by C3 and Phase D without rediscovery. They are inherited programme assumptions unless explicitly superseded by a later authorised cycle.

| Invariant | Statement |
| :--- | :--- |
| **Slot-instance identity immutability** | A materialised `ExperienceSlot` row's `id` is immutable once created. A booking's `slotId` FK references a specific, persistent row. Rule edits never change the `id` of an existing instance row — they delete and re-create future zero-booking instances. |
| **Capacity tracked per instance** | `bookedCount` is tracked on the individual `ExperienceSlot` instance row, not on the parent rule row. C3 increments `bookedCount` on the specific instance being booked, within a transaction. |
| **Publication condition unchanged** | Slot visibility to consumers is governed by the parent `Experience`'s `isActive && isApproved` condition, inherited from C1. C2 does not modify this condition. |
| **Scheduling authored on reachable lifecycle states only** | Slots are creatable and editable on DRAFT experiences (`isActive: false, isApproved: false`). APPROVED and PUBLISHED states are currently unreachable (no platform-approval surface). Published-state slot behaviour is design intent, verified at the future platform-approval-surface cycle. |
| **Phase D consumption pattern** | Phase D consumes materialised instance rows via a list endpoint. Phase D does not expand rules client-side. This pattern is fixed unless explicitly superseded. |
| **Timezone representation** | `startTime` and `endTime` are stored as UTC. The `timezone` field on the parent slot row records the IANA authoring timezone. Display layers use `timezone` for local rendering. |
| **Open-ended series not supported** | Recurring series require a COUNT or UNTIL bound. Open-ended series are not supported in C2. This constraint is enforced at the API validation layer. |
| **RRULE subset** | Supported: `FREQ=DAILY`, `FREQ=WEEKLY` with `BYDAY`, `COUNT`, `UNTIL`. Unsupported: MONTHLY, YEARLY, BYMONTHDAY, BYSETPOS, complex EXDATE patterns. The supported subset is sufficient for the operator scheduling use case at C2 scope. |
| **Booking-identity preservation** | Rule edits preserve existing bookings. Future instances with `bookedCount > 0` are never deleted by a rule edit. This is enforced at the API level. |

---

## Escalation Boundary Assessment

All five decision criteria are met with clear evidence within the criteria. The model is not materially ambiguous. The C3/Phase D implications are explicitly documented. No trigger-1 halt condition is present. **Implementation may proceed.**

Trigger-4 (RRULE library) is fired and documented above. No trigger-5 (background job) is fired. No trigger-7 (archived-vs-unpublished distinction) is required — the publication condition is inherited unchanged.
