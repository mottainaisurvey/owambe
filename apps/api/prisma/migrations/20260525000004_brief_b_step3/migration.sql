-- Phase 5.2 Brief B Rev 2 — Schema Field Generalisation — Step 3 (Removal)
-- pay_canonical_01 three-step pattern: Step 3 = drop old column
--
-- Drop ccPropertyId column from stay_bookings
--   - Data preserved in external_partner_property_id (backfilled in Step 2)
--   - ccPropertyId non-null count was 0 in staging; no data loss
--   - AC-B4 verification: grep -r "ccPropertyId" apps/api/src/ must return zero hits post-Step-3

-- IF EXISTS: ccPropertyId was added directly to staging DB outside the migration system.
-- On a fresh CI DB the column does not exist; IF EXISTS makes this a safe no-op.
ALTER TABLE "stay_bookings" DROP COLUMN IF EXISTS "ccPropertyId";
