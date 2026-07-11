-- C1: Experience Operator Scaffold — Schema Additions
-- OWB-C1-EXPERIENCES-OPERATOR-SCAFFOLD-01

-- Add meetingDetails field to Experience model (C2-forward-compatible, nullable)
ALTER TABLE "experiences" ADD COLUMN IF NOT EXISTS "meetingDetails" TEXT;

-- Fix isActive default to false (DRAFT state per C1-b.0 lifecycle model)
-- Note: existing rows are not affected; new rows will default to false
ALTER TABLE "experiences" ALTER COLUMN "isActive" SET DEFAULT false;
