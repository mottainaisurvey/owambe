-- Phase B: Coastal Corridor channel sync fields
-- OWB-F1-NEW-IMPLEMENTATION-01: Add CC sync tracking columns to properties and rooms
-- These columns are defined in the Prisma schema but were missing from the migration history.
-- All columns are nullable (optional) — existing rows are unaffected.

-- Add Coastal Corridor sync fields to properties table
ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "coastalCorridorPropertyId" TEXT,
  ADD COLUMN IF NOT EXISTS "coastalCorridorSyncedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "coastalCorridorListingUrl"  TEXT;

-- Add Coastal Corridor sync field to rooms table
ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "coastalCorridorRoomId" TEXT;
