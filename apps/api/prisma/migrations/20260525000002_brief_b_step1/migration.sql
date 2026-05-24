-- Phase 5.2 Brief B Rev 2 — Schema Field Generalisation — Step 1 (Additive)
-- pay_canonical_01 three-step pattern: Step 1 = add new columns
-- Pattern A (FK + generic external identifier) per B-P2/B-P3/B-P4 bilateral concurrence
--
-- Operation 1: channelId FK introduction on StayBooking + ExperienceBooking
--   - channel_id TEXT nullable (nullable for migration safety; backfilled in Step 2)
--   - FK constraint to channels.id
--   - Index on channel_id for lookup performance
--
-- Operation 2: ccPropertyId rename on StayBooking (Step 1 of 3)
--   - Add external_partner_property_id column (new canonical name per B-P2 disambiguation)
--   - Semantics: channel partner's native property ID (renamed from ccPropertyId)
--   - Distinct from external_property_id (Owambe's own property ID echoed in bilateral contract payload)
--
-- Column naming: snake_case per @map directive convention.

-- Operation 1: channelId FK on stay_bookings
ALTER TABLE "stay_bookings" ADD COLUMN "channel_id" TEXT;
ALTER TABLE "stay_bookings" ADD CONSTRAINT "stay_bookings_channel_id_fkey"
  FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "stay_bookings_channel_id_idx" ON "stay_bookings"("channel_id");

-- Operation 1: channelId FK on experience_bookings
ALTER TABLE "experience_bookings" ADD COLUMN "channel_id" TEXT;
ALTER TABLE "experience_bookings" ADD CONSTRAINT "experience_bookings_channel_id_fkey"
  FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "experience_bookings_channel_id_idx" ON "experience_bookings"("channel_id");

-- Operation 2: add externalPartnerPropertyId column (Step 1 of rename)
ALTER TABLE "stay_bookings" ADD COLUMN "external_partner_property_id" TEXT;
