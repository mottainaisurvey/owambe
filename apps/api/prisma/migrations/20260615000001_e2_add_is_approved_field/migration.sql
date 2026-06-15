-- OWB-E2-IMPLEMENTATION-01 Rev 1: Add explicit isApproved field to applicable entities
-- Founder direction (2026-06-12, reconfirmed 2026-06-15):
--   "Use an explicit isApproved field rather than relying on isActive as a proxy.
--    Approval status and activation status should remain independently represented."
--
-- Applicable entities: hosts, properties, operators, experiences
-- Default: false (conservative default — existing records require explicit admin approval)
-- isApproved is independent of isVerified (hosts/operators) and isActive (properties/experiences)

-- Add isApproved + approvedAt to hosts table
ALTER TABLE "hosts"
  ADD COLUMN IF NOT EXISTS "isApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "approvedAt"  TIMESTAMP(3);

-- Add isApproved + approvedAt to properties table
ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "isApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "approvedAt"  TIMESTAMP(3);

-- Add isApproved + approvedAt to operators table
ALTER TABLE "operators"
  ADD COLUMN IF NOT EXISTS "isApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "approvedAt"  TIMESTAMP(3);

-- Add isApproved + approvedAt to experiences table
ALTER TABLE "experiences"
  ADD COLUMN IF NOT EXISTS "isApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "approvedAt"  TIMESTAMP(3);
