-- ─────────────────────────────────────────────────────────────────────────────
-- Phase A.5 Migration: Enums and User Cohort Fields
-- Owambe.com — Run via: psql $DATABASE_URL -f this_file.sql
-- Safe to re-run (idempotent via IF NOT EXISTS / DO $$ guards)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. CREATE NEW ENUM TYPES ─────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "Currency" AS ENUM ('NGN', 'USD', 'GBP', 'EUR', 'KES', 'GHS', 'ZAR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ChannelOrigin" AS ENUM (
    'DIRECT', 'COASTAL_CORRIDOR', 'BOOKING_COM', 'AIRBNB',
    'HOTELS_NG', 'GETYOURGUIDE', 'VIATOR'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CohortType" AS ENUM ('COASTAL_CORRIDOR', 'GENERAL', 'BETA', 'PARTNER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CohortCodeStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'EXHAUSTED', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. ADD NEW COLUMNS TO users TABLE ───────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "cohortMember"      BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cohortType"        "CohortType",
  ADD COLUMN IF NOT EXISTS "cohortStartDate"   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "cohortEndDate"     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "preferredCurrency" "Currency"    NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS "onboardedAt"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "channelOrigin"     "ChannelOrigin" NOT NULL DEFAULT 'DIRECT';

-- ─── 3. ADD INDEXES FOR NEW COLUMNS ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "users_cohortMember_idx"      ON users ("cohortMember");
CREATE INDEX IF NOT EXISTS "users_channelOrigin_idx"     ON users ("channelOrigin");
CREATE INDEX IF NOT EXISTS "users_preferredCurrency_idx" ON users ("preferredCurrency");

-- ─────────────────────────────────────────────────────────────────────────────
-- Done. Run the data migration script next:
--   node scripts/migrate-existing-users.js
-- ─────────────────────────────────────────────────────────────────────────────
