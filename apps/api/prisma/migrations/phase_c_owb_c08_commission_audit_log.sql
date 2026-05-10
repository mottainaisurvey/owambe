-- ─── Phase C: OWB-C-08 — Channel Commission Reconciliation ─────────────────
-- Migration: commission_audit_logs table + backfill of existing stay_bookings
-- Applied: 2026-05-10
-- Safe to re-run: all statements use IF NOT EXISTS / DO NOTHING guards.

-- ─── 1. Create commission_audit_logs table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "commission_audit_logs" (
    "id"                          UUID        NOT NULL DEFAULT gen_random_uuid(),
    "stayBookingId"               UUID        NOT NULL,
    "reservationReference"        TEXT        NOT NULL,
    "channelOrigin"               TEXT        NOT NULL,
    "totalAmount"                 DECIMAL(12,2) NOT NULL,
    "currency"                    TEXT        NOT NULL DEFAULT 'NGN',
    -- Commission inputs
    "cohortMember"                BOOLEAN     NOT NULL DEFAULT false,
    "cohortType"                  TEXT,
    "appliedCommissionRate"       DECIMAL(5,2) NOT NULL,
    "rateSource"                  TEXT        NOT NULL,
    -- Commission outputs
    "channelCommissionAmount"     DECIMAL(12,2) NOT NULL,
    "channelCommissionPercent"    DECIMAL(5,2) NOT NULL,
    "netToHost"                   DECIMAL(12,2) NOT NULL,
    -- CC-provided values (for discrepancy detection)
    "ccProvidedCommissionAmount"  DECIMAL(12,2),
    "ccProvidedCommissionPercent" DECIMAL(5,2),
    "ccProvidedNetToHost"         DECIMAL(12,2),
    -- Discrepancy flag
    "hasDiscrepancy"              BOOLEAN     NOT NULL DEFAULT false,
    "discrepancyNote"             TEXT,
    "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "commission_audit_logs_pkey" PRIMARY KEY ("id")
);

-- FK to stay_bookings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commission_audit_logs_stayBookingId_fkey'
  ) THEN
    ALTER TABLE "commission_audit_logs"
      ADD CONSTRAINT "commission_audit_logs_stayBookingId_fkey"
      FOREIGN KEY ("stayBookingId")
      REFERENCES "stay_bookings"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "commission_audit_logs_stayBookingId_idx"
  ON "commission_audit_logs"("stayBookingId");
CREATE INDEX IF NOT EXISTS "commission_audit_logs_reservationReference_idx"
  ON "commission_audit_logs"("reservationReference");
CREATE INDEX IF NOT EXISTS "commission_audit_logs_channelOrigin_idx"
  ON "commission_audit_logs"("channelOrigin");
CREATE INDEX IF NOT EXISTS "commission_audit_logs_createdAt_idx"
  ON "commission_audit_logs"("createdAt");

-- ─── 2. Backfill existing channel reservations ───────────────────────────────
-- For existing COASTAL_CORRIDOR stay_bookings that have null commission fields,
-- compute values using the standard rate (15%) and insert audit log entries.
-- Cohort detection is not possible retroactively without the host user record,
-- so all backfilled rows use the standard 15% rate with rateSource = 'BACKFILL_STANDARD'.
-- Rows that already have channelCommissionAmount populated are left unchanged.

-- Step 2a: Update stay_bookings rows with null commission fields
UPDATE "stay_bookings"
SET
  "channelCommissionPercent" = 15.00,
  "channelCommissionAmount"  = ROUND("totalAmount" * 0.15, 2),
  "netToHost"                = ROUND("totalAmount" * 0.85, 2)
WHERE
  "channelOrigin" = 'COASTAL_CORRIDOR'
  AND "channelCommissionAmount" IS NULL
  AND "totalAmount" IS NOT NULL;

-- Step 2b: Insert audit log entries for backfilled rows
INSERT INTO "commission_audit_logs" (
  "stayBookingId",
  "reservationReference",
  "channelOrigin",
  "totalAmount",
  "currency",
  "cohortMember",
  "cohortType",
  "appliedCommissionRate",
  "rateSource",
  "channelCommissionAmount",
  "channelCommissionPercent",
  "netToHost",
  "ccProvidedCommissionAmount",
  "ccProvidedCommissionPercent",
  "ccProvidedNetToHost",
  "hasDiscrepancy",
  "discrepancyNote"
)
SELECT
  sb."id",
  sb."reference",
  sb."channelOrigin",
  sb."totalAmount",
  sb."currency",
  false,                           -- cohortMember unknown at backfill time
  NULL,                            -- cohortType unknown at backfill time
  15.00,                           -- appliedCommissionRate: standard rate
  'BACKFILL_STANDARD',             -- rateSource
  ROUND(sb."totalAmount" * 0.15, 2),
  15.00,
  ROUND(sb."totalAmount" * 0.85, 2),
  NULL,                            -- ccProvidedCommissionAmount unknown
  NULL,
  NULL,
  false,
  'Backfilled by OWB-C-08 migration; cohort status not available retroactively'
FROM "stay_bookings" sb
WHERE
  sb."channelOrigin" = 'COASTAL_CORRIDOR'
  AND sb."totalAmount" IS NOT NULL
  -- Only insert if no audit log already exists for this booking
  AND NOT EXISTS (
    SELECT 1 FROM "commission_audit_logs" cal
    WHERE cal."stayBookingId" = sb."id"
  );
