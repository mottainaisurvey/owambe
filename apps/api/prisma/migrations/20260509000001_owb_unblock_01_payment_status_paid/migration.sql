-- OWB-UNBLOCK-01 AC-5: Add PAID to PaymentStatus enum
-- CC canonical PaymentStatus uses PAID; Owambe used FULLY_PAID for the same semantic.
-- Adding PAID as a first-class enum value so inbound CC reservations can be stored
-- without a boundary mapping shim. FULLY_PAID is retained for internal Paystack flows.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PAID';
