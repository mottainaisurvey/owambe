-- OWB-C-GUEST-CHECKOUT-01 (G-5): GuestClaimToken table
-- Magic-link claim tokens for post-purchase account creation by guest bookers.
-- Additive — no existing rows affected.

CREATE TABLE IF NOT EXISTS "guest_claim_tokens" (
  "id"         UUID      NOT NULL DEFAULT gen_random_uuid(),
  "token"      TEXT      NOT NULL,
  "bookingId"  UUID      NOT NULL,
  "guestEmail" TEXT      NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "usedAt"     TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guest_claim_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "guest_claim_tokens_token_key"
  ON "guest_claim_tokens"("token");

CREATE INDEX IF NOT EXISTS "guest_claim_tokens_token_idx"
  ON "guest_claim_tokens"("token");

CREATE INDEX IF NOT EXISTS "guest_claim_tokens_bookingId_idx"
  ON "guest_claim_tokens"("bookingId");
