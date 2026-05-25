-- Brief D Rev 2 — Operation 8: WebhookDeliveryLog channel discriminator field
-- D5 correction from [VERIFY:] flag checkpoint (PHASE-5-2-VERIFY-REPORT.md)
-- Adds channel_slug to webhook_delivery_logs for multi-channel delivery log discrimination.
-- Backfills existing rows to 'coastal-corridor' (the only channel in Phase 5.1).

ALTER TABLE webhook_delivery_logs
  ADD COLUMN IF NOT EXISTS channel_slug TEXT NOT NULL DEFAULT 'coastal-corridor';

CREATE INDEX IF NOT EXISTS webhook_delivery_logs_channel_slug_idx
  ON webhook_delivery_logs (channel_slug);
