-- OWB-UNBLOCK-01 AC-6 / AC-7: Add REFUNDED to StayBookingStatus and ExperienceBookingStatus
-- Aligns Owambe enums with CC canonical ReservationStatus and ExperienceBookingStatus
-- CC staging DB already has REFUNDED in both enums; this migration closes the gap on Owambe side.

ALTER TYPE "StayBookingStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
ALTER TYPE "ExperienceBookingStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
