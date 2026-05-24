-- Phase 5.2 Amendment-02: Channel Registry — timestampHeader field addition
-- Brief A Rev 2 + Amendment-01 + Amendment-02 BILATERAL CONCURRENCE
-- Adds timestamp_header field to channels table for per-channel HMAC pair construction
-- declarative pattern (channel.signatureHeader + channel.timestampHeader).
--
-- Non-nullable with DEFAULT 'X-Timestamp' per spec-canonical direction:
--   - Symmetric architectural treatment with signature_header (both HMAC pair artefacts)
--   - DEFAULT ensures existing Coastal Corridor row populated automatically
--   - Per-channel override accommodated via non-default value
--   - NULL state would create undefined HMAC pair construction; non-nullable enforces well-defined state
--
-- Column naming: snake_case per @map directive convention (timestamp_header at DB layer;
-- timestampHeader at TypeScript layer). Consistent with Path (α) execution layer finding.

ALTER TABLE "channels" ADD COLUMN "timestamp_header" TEXT NOT NULL DEFAULT 'X-Timestamp';
