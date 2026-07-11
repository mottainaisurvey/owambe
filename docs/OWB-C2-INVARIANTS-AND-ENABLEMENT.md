# OWB-C2-EXPERIENCES-SLOT-SCHEDULING-01 — Invariants & Enablement Notes

**Date:** July 11, 2026
**Author:** Manus AI (Thread-2 / Owambe Developer)

## Part 1: C2 Architectural Invariants

The following invariants are established by the C2 scheduling engine implementation. These are architectural constants that downstream cycles (C3, Phase D) must inherit without reinterpretation.

### 1. Eager Materialisation is Absolute
All slot instances are eagerly materialised at the time of creation. There is no lazy evaluation, no background cron job generating future slots, and no "virtual" slots. If a slot exists in the database, it is available for booking (subject to capacity). If it does not exist in the database, it cannot be booked.

### 2. Slot Identity is Immutable
Every bookable occurrence has a unique, stable UUID (`id` in `ExperienceSlot`). The `ExperienceBooking.slotId` foreign key must point to this specific materialised instance. Series IDs (`parentSlotId`) are for operator management grouping only and must never be used as booking targets.

### 3. Capacity is Instance-Local
Capacity (`capacity`) and booking counts (`bookedCount`) are strictly local to the individual materialised instance. There is no shared capacity pool across a series. C3 must evaluate availability (`capacity - bookedCount > 0`) exclusively at the instance level.

### 4. Cancellation is Destructive (Except When Booked)
When an operator cancels an unbooked slot instance, the row is hard-deleted from the database. When an operator cancels a series, all future unbooked child instances are hard-deleted. However, if an instance has `bookedCount > 0`, it is structurally protected from cancellation.

### 5. Timezones are Operator-Authoritative
The `timezone` field on the series parent dictates the wall-clock time for the operator. However, all `startTime` and `endTime` fields on materialised instances are stored in absolute UTC. C3 must query and display availability using these UTC timestamps, converting to the consumer's local timezone on the client side.

## Part 2: Dual Enablement Notes (C3 & Phase D)

The C2 scheduling engine provides the foundational data structures required by both the internal Owambe consumer booking flow (C3) and the external Coastal Corridor consumer workstream (Phase D).

### C3 (Owambe Consumer Booking Flow) Enablement

- **Availability Queries:** C3 should query availability by filtering `ExperienceSlot` where `experienceId` matches, `startTime` is in the future, and `bookedCount < capacity`.
- **Booking Mutation:** When C3 creates a booking, it must increment the `bookedCount` on the specific `ExperienceSlot` instance within a Prisma transaction to prevent overselling.
- **Series Ignorance:** C3 does not need to understand RRULEs, `parentSlotId`, or recurrence patterns. It interacts exclusively with the flat list of eagerly materialised instances.

### Phase D (Coastal Corridor Consumer Workstream) Enablement

- **API Contract:** The `GET /api/experiences/:id/slots` endpoint returns a flat array of available slot instances. This is the exact shape expected by the Phase D consumer client.
- **Payload Shape:** The returned instances include `id`, `startTime` (UTC ISO string), `endTime` (UTC ISO string), `availableSpots` (computed as `capacity - bookedCount`), and `isSoldOut` (boolean).
- **Timezone Handling:** Phase D clients should rely on the UTC `startTime` and `endTime` for all rendering and calendar integrations. The `timezone` field is exposed but is primarily for operator context.
