-- PAY-CANONICAL-01-OWB Migration Step 3 of 3
-- Remove FULLY_PAID from PaymentStatus enum.
-- Postgres does not support ALTER TYPE ... DROP VALUE directly.
-- The standard approach is: create new enum, alter columns, drop old enum, rename.
-- This migration must run AFTER step 2 (data migration) has completed and
-- verified zero FULLY_PAID rows remain.

-- Step 3a: Create the canonical enum with the seven-state set (no FULLY_PAID)
CREATE TYPE "PaymentStatus_new" AS ENUM (
  'PENDING',
  'DEPOSIT_PAID',
  'PARTIALLY_PAID',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'FAILED'
);

-- Step 3b: Alter each column that uses PaymentStatus to use the new type
-- stay_bookings
ALTER TABLE "stay_bookings"
  ALTER COLUMN "paymentStatus" TYPE "PaymentStatus_new"
  USING "paymentStatus"::text::"PaymentStatus_new";

-- bookings
ALTER TABLE "bookings"
  ALTER COLUMN "paymentStatus" TYPE "PaymentStatus_new"
  USING "paymentStatus"::text::"PaymentStatus_new";

-- experience_bookings (if it uses PaymentStatus)
ALTER TABLE "experience_bookings"
  ALTER COLUMN "paymentStatus" TYPE "PaymentStatus_new"
  USING "paymentStatus"::text::"PaymentStatus_new";

-- Step 3c: Drop the old enum type
DROP TYPE "PaymentStatus";

-- Step 3d: Rename the new enum to the canonical name
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
