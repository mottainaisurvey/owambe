-- Brief D Rev 2 — Operation 8: WebhookDeliveryLog channel discriminator field
-- D5 correction from [VERIFY:] flag checkpoint (PHASE-5-2-VERIFY-REPORT.md)
-- Adds channel_slug to webhook_delivery_logs for multi-channel delivery log discrimination.
-- Backfills existing rows to 'coastal-corridor' (the only channel in Phase 5.1).
--
-- Guard: create the table if it was not created by an earlier migration
-- (table was originally added directly to staging DB outside the migration system).
CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
  id               UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id         TEXT         NOT NULL,
  event_type       TEXT         NOT NULL,
  channel_slug     TEXT         NOT NULL DEFAULT 'coastal-corridor',
  target_url       TEXT         NOT NULL,
  request_body     TEXT         NOT NULL,
  http_status      INTEGER,
  response_body    TEXT,
  delivery_status  TEXT         NOT NULL DEFAULT 'PENDING',
  error_message    TEXT,
  attempt_count    INTEGER      NOT NULL DEFAULT 0,
  duration_ms      INTEGER,
  last_attempt_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT webhook_delivery_logs_event_id_key UNIQUE (event_id)
);

-- Add channel_slug column (no-op if table was just created above with the column already present)
ALTER TABLE webhook_delivery_logs
  ADD COLUMN IF NOT EXISTS channel_slug TEXT NOT NULL DEFAULT 'coastal-corridor';

CREATE INDEX IF NOT EXISTS webhook_delivery_logs_channel_slug_idx
  ON webhook_delivery_logs (channel_slug);

-- Ensure the other indexes required by the Prisma model also exist
CREATE INDEX IF NOT EXISTS webhook_delivery_logs_delivery_status_idx
  ON webhook_delivery_logs (delivery_status);
CREATE INDEX IF NOT EXISTS webhook_delivery_logs_event_type_idx
  ON webhook_delivery_logs (event_type);
CREATE INDEX IF NOT EXISTS webhook_delivery_logs_created_at_idx
  ON webhook_delivery_logs (created_at);
