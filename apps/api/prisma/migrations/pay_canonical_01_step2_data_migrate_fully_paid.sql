-- PAY-CANONICAL-01-OWB Migration Step 2 of 3
-- Data migration: FULLY_PAID → PAID across all tables that use PaymentStatus
-- FULLY_PAID is the Owambe-internal alias for PAID introduced by OWB-UNBLOCK-01.
-- With XCT-03 Amendment 002 committed, FULLY_PAID is folded into PAID.

-- Capture pre-migration counts for evidence
-- (run SELECT COUNT(*) FROM "stay_bookings" WHERE "paymentStatus" = 'FULLY_PAID' before this)

UPDATE "stay_bookings"
SET "paymentStatus" = 'PAID'
WHERE "paymentStatus" = 'FULLY_PAID';

UPDATE "bookings"
SET "paymentStatus" = 'PAID'
WHERE "paymentStatus" = 'FULLY_PAID';

-- Verify: no rows should remain with FULLY_PAID after this migration
-- (run SELECT COUNT(*) FROM "stay_bookings" WHERE "paymentStatus" = 'FULLY_PAID' after this)
