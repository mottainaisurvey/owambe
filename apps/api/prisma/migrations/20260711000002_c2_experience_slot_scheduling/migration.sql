-- C2: Experience Slot Scheduling — Schema Additions
-- OWB-C2-EXPERIENCES-SLOT-SCHEDULING-01
-- Design decision: stored-rule-with-materialised-instances (Option B)
-- All columns are nullable and additive — no existing rows affected.

-- rruleString: RFC 5545 RRULE string for the parent row of a recurring series.
-- Null for one-off slots and child instance rows.
ALTER TABLE "experience_slots" ADD COLUMN IF NOT EXISTS "rruleString" TEXT;

-- timezone: IANA timezone identifier at which the recurrence rule was authored.
-- e.g. 'Africa/Lagos'. Required for correct timezone-anchored expansion.
-- Null for one-off slots (UTC is implied by the stored startTime/endTime).
ALTER TABLE "experience_slots" ADD COLUMN IF NOT EXISTS "timezone" TEXT;

-- parentSlotId: FK to the parent ExperienceSlot row for child instance rows.
-- Null for one-off slots and parent rows; set for child instance rows.
ALTER TABLE "experience_slots" ADD COLUMN IF NOT EXISTS "parentSlotId" UUID REFERENCES "experience_slots"("id") ON DELETE SET NULL;

-- Index on parentSlotId for efficient series queries (cancel series, rule mutation).
CREATE INDEX IF NOT EXISTS "experience_slots_parentSlotId_idx" ON "experience_slots"("parentSlotId");
