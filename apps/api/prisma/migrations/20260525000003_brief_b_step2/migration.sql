-- Phase 5.2 Brief B Rev 2 — Schema Field Generalisation — Step 2 (Data Migration)
-- pay_canonical_01 three-step pattern: Step 2 = backfill data
--
-- Backfill channelId for all existing rows to Coastal Corridor channel.id
--   - All existing rows are Coastal Corridor origin (channelOrigin = COASTAL_CORRIDOR or DIRECT)
--   - Coastal Corridor channel.id resolved via slug lookup
--   - Pre-backfill count: stay_bookings=1, experience_bookings=3 (verified 2026-05-25)
--
-- Backfill externalPartnerPropertyId from ccPropertyId
--   - ccPropertyId non-null count = 0 in staging (verified 2026-05-25 via [VERIFY:V5])
--   - This UPDATE is a zero-row no-op; included for completeness + production safety

-- Backfill channel_id: stay_bookings → Coastal Corridor
UPDATE "stay_bookings"
SET "channel_id" = (SELECT "id" FROM "channels" WHERE "slug" = 'coastal-corridor')
WHERE "channel_id" IS NULL;

-- Backfill channel_id: experience_bookings → Coastal Corridor
UPDATE "experience_bookings"
SET "channel_id" = (SELECT "id" FROM "channels" WHERE "slug" = 'coastal-corridor')
WHERE "channel_id" IS NULL;

-- Backfill externalPartnerPropertyId from ccPropertyId (zero-row no-op per [VERIFY:V5])
UPDATE "stay_bookings"
SET "external_partner_property_id" = "ccPropertyId"
WHERE "ccPropertyId" IS NOT NULL;
