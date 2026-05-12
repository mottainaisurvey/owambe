-- PAY-CANONICAL-01-OWB Migration Step 1 of 3
-- Add PARTIALLY_PAID to PaymentStatus enum (additive — FULLY_PAID still present at this point)
-- This is a safe additive migration; no data changes.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID';
