-- C1 Experience Operator Scaffold Migration
-- OWB-C1-EXPERIENCES-OPERATOR-SCAFFOLD-01
-- Additive only. No existing columns modified. No data migration required.

-- Add meetingDetails to Experience model (C1-b.1 requirement)
-- Stores meeting point / instructions for confirmed bookings
ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS meeting_details TEXT;

-- C2 forward-compatibility note:
-- ExperienceSlot table already exists (from Phase A scaffolding).
-- No additional columns needed for C1 — C2 will add RRULE/recurrence fields.
-- Operator and Experience models already have isActive + isApproved (lifecycle model).
-- No new enums required — UserRole.OPERATOR and PlatformMode.EXPERIENCES already exist.
