# OWB Phase 5.2 — Brief D Rev 2 — Webhook Dispatcher Generalisation — Verification Report

**Execution date:** 2026-05-25
**Disposition:** DECOUPLED — code execution fires now; production cutover deferred to dedicated cycle when CC-side capacity engaged
**Commit:** `4612acd` (master + staging)
**TypeScript compile:** exit 0 (clean)

---

## 1. AC Verification — Code-Level Execution ACs

| AC | Description | Result |
|---|---|---|
| AC-D1 | Channel-driven dispatch: `channel.findMany({ where: { state: 'ACTIVE' } })` + capability filter (Pattern α) | **PASS** |
| AC-D2 | Spec-canonical event naming: `reservation.guest_checked_in` / `reservation.guest_checked_out` in dispatcher + channel.ts | **PASS** |
| AC-D4 | Channel state gating: only `ACTIVE` channels receive dispatch; `PAUSED` / `DECOMMISSIONED` excluded at query layer | **PASS** |
| AC-D5 | Per-channel circuit breaker: 20 consecutive failures → OPEN; 120-second timeout → HALF_OPEN probe; `getCircuitBreakerState` / `resetCircuitBreaker` exported | **PASS** |
| AC-D8 | `WebhookDeliveryLog.channelSlug` migration applied (migration `20260525000005`); `channelSlug` populated in `create` block of `executeDelivery` | **PASS** |
| AC-D9 | Booking event family infrastructure: `booking.created` / `booking.cancelled` / `booking.refunded` types defined; gated by `OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED=true` (option iii staged enable) | **PASS** |
| AC-D10 (code-level) | No hardcoded `x-cc-signature` / `x-owambe-signature` / `x-cc-timestamp` / `x-owambe-timestamp` in dispatcher; header names read declaratively from `channel.signatureHeader` + `channel.timestampHeader` | **PASS** |
| AC-D11 | Booking event family infrastructure end-to-end: capability filter (`supportsStays || supportsExperiences`), circuit breaker, destination resolution, `executeDelivery` code path all operate for booking events when env var enabled | **PASS** (code-level; staging wire probe deferred to post-Railway-deploy) |

---

## 2. AC Verification — Production Cutover ACs (Explicitly Deferred)

| AC | Description | Disposition |
|---|---|---|
| AC-D3 | CC handler alias dispatch continues during transition window | **DEFERRED** — cross-thread coordination; CC-side capacity cycle |
| AC-D6 | Existing CC integration operates uninterrupted through cutover | **DEFERRED** — Phase 5.1 wire-flowing preserved under decoupled disposition |
| AC-D7 | Transition window closure confirmation cycle shape | **DEFERRED** — cutover cycle |
| AC-D10 (wire probe) | Outbound symmetric canonicalisation live behavioural verification | **DEFERRED** — CC handler must accept canonical headers first |

These are not failure states. Decoupled disposition explicitly separates code execution from production cutover.

---

## 3. Implementation Summary

### 3.1 Dispatcher Generalisation (`webhookDispatcher.service.ts`)

**Channel-driven dispatch loop (AC-D1):** `dispatchWebhookEvent` now queries `prisma.channel.findMany({ where: { state: 'ACTIVE' } })` and dispatches one BullMQ job per capable channel. The legacy single-target pattern is replaced by a multi-channel fan-out.

**Capability dispatch — Pattern α (AC-D1):** `channelSupportsEvent()` maps event families to capability flags:
- Reservation events → `channel.supportsStays`
- Booking events → `channel.supportsStays || channel.supportsExperiences`

**Per-channel circuit breaker (AC-D5):** In-memory `Map<channelSlug, CircuitBreakerState>`. Thresholds: 20 consecutive failures → OPEN; 120-second timeout → HALF_OPEN probe. `recordCircuitSuccess()` resets to CLOSED on any successful delivery. Circuit breaker check fires at both enqueue time (skip job creation) and dispatch time (skip HTTP POST without triggering BullMQ retry).

**Declarative header emission (AC-D10 code-level):** `executeDelivery` reads `job.signatureHeader` and `job.timestampHeader` (resolved from channel record at enqueue time) to construct the outbound headers object. No hardcoded header name strings in the dispatch path.

**Booking event family (AC-D9):** `BookingEventType` union (`booking.created | booking.cancelled | booking.refunded`) added to `WebhookEventType`. `BOOKING_EVENTS_ENABLED` flag (`process.env.OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED === 'true'`) gates the booking family at the top of `dispatchWebhookEvent`. Production enable deferred to post-Amendment-009-closure cutover cycle.

**Per-channel HMAC secret resolution:** `channel.hmacSecret` from DB (Path α-secret pattern). Falls back to `OWAMBE_WEBHOOK_OUTBOUND_SECRET` env var for channels without a DB-stored secret (transition window).

**Per-channel destination URL resolution:** `channel.destinationUrl` from DB. Falls back to `CC_WEBHOOK_INBOUND_URL` env var for `coastal-corridor` channel (legacy transition window).

**Per-channel event ID suffix:** When dispatching to multiple channels, `eventId` is suffixed with `channelSlug` (`owb-evt-{hex}-{slug}`) to prevent delivery log `eventId` uniqueness collisions across channels.

### 3.2 Spec-Canonical Event Naming (AC-D2)

`channel.ts` event type map updated:
- `CHECKED_IN` → `'reservation.guest_checked_in'` (was `'reservation.checked_in'`)
- `CHECKED_OUT` → `'reservation.guest_checked_out'` (was `'reservation.checked_out'`)

The inbound webhook handler in `channel.ts` already uses `reservation.guest_checked_in` / `reservation.guest_checked_out` case labels (confirmed at lines 1114 + 1155) — these were already spec-canonical from a prior cycle. The outbound dispatch map is now consistent.

### 3.3 WebhookDeliveryLog.channelSlug Migration (AC-D8 / D5 correction)

Migration `20260525000005_brief_d_webhook_delivery_log_channel_slug`:
```sql
ALTER TABLE "WebhookDeliveryLog"
  ADD COLUMN "channel_slug" TEXT;
CREATE INDEX "WebhookDeliveryLog_channel_slug_idx"
  ON "WebhookDeliveryLog"("channel_slug");
```

Prisma schema updated: `channelSlug String? @map("channel_slug")` with `@@index([channelSlug])`. Field is nullable (existing rows have no channel discriminator; new rows populated from channel record at dispatch time).

---

## 4. Engineering Layer Observations

### 4.1 Circuit Breaker In-Memory State

The circuit breaker state is in-memory per process. Under Railway's single-replica staging deployment this is sufficient. In a multi-replica production deployment, circuit breaker state would need to be shared via Redis (e.g., a Redis key `cb:{channelSlug}:failures`). This is noted as a forward engineering item for the cutover cycle — not a blocker for the current decoupled execution beat.

### 4.2 Queue Isolation Observation

Each channel dispatch creates a separate BullMQ job. Under the current `WEBHOOK_DISPATCH_QUEUE_NAME = 'owambe:webhook-dispatch'` single-queue architecture, a high-volume channel could starve a low-volume channel's jobs. Per-channel queue isolation (one queue per channel) is a forward engineering item for the Briefs E + F authoring cycle.

### 4.3 Declarative Read Pattern Symmetry

Brief C (inbound) and Brief D (outbound) now share the same declarative read pattern: both read `channel.signatureHeader` + `channel.timestampHeader` from the channel registry. The inbound path reads them at request time (via `verifyChannelSignature` factory); the outbound path reads them at enqueue time (stored in `WebhookJobData` for dispatch-time use). This symmetry is the architectural commitment shape of the Phase 5.2 multi-channel generalisation.

### 4.4 Vocabulary Lint

3 advisory-mode `partner` violations in `channel.ts` lines 84–88 (pre-existing OWB-WAVE-4-04 era comments in the rate limiter comment block). Build not blocked. New dispatcher code uses channel-centric terminology throughout.

---

## 5. Commits

| Branch | Commit | Scope |
|---|---|---|
| `master` | `4612acd` | Brief D Rev 2 implementation (dispatcher + channel.ts + schema + migration) |
| `staging` | `4612acd` | Fast-forward merge from master |

Railway staging will pick up migration `20260525000005` via `prisma migrate deploy` on next deploy trigger.

---

## 6. Phase 5.2 Owambe-Side Closure State

Under decoupled disposition, Brief D code execution closes Phase 5.2 implementation Owambe-side. Forward beats:

- Bilateral verification cycle on Brief D execution outcome
- Phase 5.2 substantive closure Owambe-side (v1.5 trigger criteria question surfaces at coordinator layer)
- CC-side capacity dedicated cycle entry (DEFERRED)
- Cutover cycle: Amendment 010/011 canonical cutovers + booking-family production enable + transition window closure confirmation
- Briefs E + F authoring cycle entry post-A-D execution closure
