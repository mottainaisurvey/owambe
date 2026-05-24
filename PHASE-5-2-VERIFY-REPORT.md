# Phase 5.2 Brief Verification Report
**Owambe Codebase Cross-Reference — 19 [VERIFY:] Flags**
**Date:** 2026-05-24 | **Codebase state:** commit `ca1cd49` (master), `c4133d7` (staging)

---

## How to Read This Report

Each flag is resolved with one of three verdicts:

- **CONFIRMED** — the brief's claim matches the codebase exactly; no change needed.
- **CORRECTION REQUIRED** — the brief's claim does not match; Rev 1 must update the brief.
- **PARTIAL / CLARIFICATION** — the brief is directionally correct but needs a precision adjustment.

---

## Brief A — Destination URL Field (Amendment 01)

### [VERIFY:A1] — Existing env var name for CC webhook destination URL

**Brief claim:** "Verify the existing env var name — expected `CC_WEBHOOK_INBOUND_URL`."

**Finding:** **CONFIRMED.**

```
// webhookDispatcher.service.ts line 105–107
const DEFAULT_CC_WEBHOOK_URL =
  process.env.CC_WEBHOOK_INBOUND_URL ??
  'https://coastal-corridor-staging.vercel.app/api/v1/channel/webhooks/inbound';
```

The env var is `CC_WEBHOOK_INBOUND_URL`. The hardcoded fallback URL is `https://coastal-corridor-staging.vercel.app/api/v1/channel/webhooks/inbound`. No second env var exists for this purpose.

---

### [VERIFY:A2] — Whether a `ChannelPartner` model or equivalent already exists in the schema

**Brief claim:** "Verify whether a ChannelPartner or ChannelConfig model already exists."

**Finding:** **CONFIRMED — does not exist.**

`grep` for `ChannelPartner`, `channel_partner`, `ChannelConfig`, `channel_config` returns zero hits in `schema.prisma`. No such model exists. The Amendment 01 brief's proposed `ChannelPartner` model (or equivalent `channel_partners` table) would be a net-new addition.

**Additional context for Rev 1:** The `WebhookDeliveryLog` model (`webhook_delivery_logs`) does **not** have a `channelId` or `sourceChannel` field. The `targetUrl` field (`String`) is the only routing discriminator currently present. This is relevant to Brief D's generalisation scope.

---

## Brief B — Schema Field Generalisation

### [VERIFY:B1] — Full inventory of `cc_*` fields currently in the schema

**Brief claim:** "Verify the complete list of cc_* fields across all models."

**Finding:** **CONFIRMED with full inventory below.**

| Model | Field | Type | Notes |
|---|---|---|---|
| `StayBooking` | `externalRef` | `String?` | CC reservation ID; `@@index([externalRef])` |
| `StayBooking` | `externalPropertyId` | `String?` | Owambe property ID echoed back by CC |
| `StayBooking` | `ccPropertyId` | `String?` | CC's native property ID (OWB-PHASE-E-02 scaffold) |
| `ExperienceBooking` | `externalRef` | `String?` | CC booking ID; `@@index([externalRef])` |
| `ExperienceBooking` | `externalExperienceId` | `String?` | CC experience ID |

**Note:** The field name used in the codebase is `externalRef` (camelCase), mapped to `externalRef` in the DB column (no `@map` override). The brief should use `externalRef` not `external_ref` when referencing the Prisma field name.

**Note on `ccPropertyId`:** This field is scaffolded on `StayBooking` only. It has zero non-null rows in staging (`COUNT(ccPropertyId) = 0` confirmed via DB query). It is safe to rename or generalise in a migration.

---

### [VERIFY:B2] — Call sites for `cc_*` fields in reconciliation and adapters

**Brief claim:** "Verify all call sites that read/write cc_* fields."

**Finding:** **CONFIRMED with full call-site map.**

**`reconciliation.service.ts`** (primary consumer):
- Lines 39, 54: Interface definitions `cc_reservation_id: string` and `cc_booking_id: string`
- Lines 117, 124, 144, 158, 177, 195, 230, 264: `externalRef` read/write on `StayBooking`
- Lines 294, 301, 318, 322, 334, 352: `externalRef` read/write on `ExperienceBooking`

**`channel.ts`** (primary writer):
- Lines 143, 151, 207, 333, 401: `cc_reservation_id` / `ccPropertyId` on `StayBooking` create/update
- Lines 810, 881, 994: `cc_booking_id` on `ExperienceBooking` create

**No call sites in adapters** (`coastal-corridor.adapter.ts`) read `externalRef` directly — the adapter is a signing/HTTP utility only.

---

### [VERIFY:B3] — Whether `externalRef` is `@unique` or only `@@index`

**Brief claim:** "Verify uniqueness constraint on externalRef — expected non-unique index only."

**Finding:** **CONFIRMED — `@@index` only, not `@unique`.**

Both `StayBooking` and `ExperienceBooking` use `@@index([externalRef])`. There is no `@unique` constraint. This means:
- Duplicate `externalRef` values are permitted at the DB level (idempotency is enforced in application code via `findFirst` + upsert logic).
- A generalisation migration that renames `externalRef` to `channelBookingRef` (or similar) does **not** need to change the uniqueness constraint — only the column name and index name.

---

### [VERIFY:B4] — Migration history for analogous rename precedents

**Brief claim:** "Verify whether prior migrations establish a rename pattern to follow."

**Finding:** **CONFIRMED — no direct rename precedent; additive pattern only.**

Migration history (chronological):
```
20260505000000_baseline_phase_a5
20260509000000_owb_unblock_01_booking_status_refunded
20260509000001_owb_unblock_01_payment_status_paid
20260510000000_phase_c_commission_audit_log
20260511000000_pay_canonical_01_step1
20260511000001_pay_canonical_01_step2  ← this was the failed migration (now fixed)
20260511000002_pay_canonical_01_step3
20260515000000_vendor_marketplace_expansion_01
```

All prior migrations are additive (add column, add enum value, add table) or data-migration (UPDATE rows). No prior column rename exists. The `pay_canonical_01` three-step pattern (add → migrate data → remove old) is the established precedent for non-trivial schema changes and should be followed for any `externalRef` rename.

---

### [VERIFY:B5] — Production data state for `cc_*` fields (migration safety)

**Brief claim:** "Verify row counts to assess migration safety."

**Finding:** **CONFIRMED — minimal data, migration is safe.**

| Table | Total rows | `externalRef` non-null | `externalPropertyId` non-null | `ccPropertyId` non-null |
|---|---|---|---|---|
| `stay_bookings` | 1 | 1 | 1 | 0 |
| `experience_bookings` | 3 | 3 | n/a | n/a |

Staging has 4 total rows across both tables with `externalRef` populated. All are test/integration data. A rename migration carries zero data-loss risk.

---

## Brief C — Auth Middleware Generalisation

### [VERIFY:C1] — Current auth middleware architecture: named function vs inline

**Brief claim:** "Verify whether HMAC verification is a named function or inline middleware."

**Finding:** **CONFIRMED — named function, applied via `router.use()`.**

```typescript
// channel.ts line 54
function verifyCoastalCorridorSignature(req, res, next): void { ... }
// channel.ts line 91
router.use(verifyCoastalCorridorSignature);
```

The function is a **module-level named function** (not an arrow function, not inline). It is applied as a single `router.use()` call covering all channel routes. This is the correct extraction point for generalisation — the function body becomes the `verifyChannelSignature(secret, headerPrefix)` factory.

**Important:** The raw body capture (`express.raw()` with `verify` callback) at lines 47–52 is a **prerequisite** for the HMAC middleware and must remain the first middleware on the router regardless of generalisation shape.

---

### [VERIFY:C2] — HMAC implementation details: algorithm, format, replay window

**Brief claim:** "Verify HMAC-SHA256, `timestamp.body` format, 5-minute replay window, hex encoding."

**Finding:** **CONFIRMED — all four properties match.**

- Algorithm: `crypto.createHmac('sha256', secret)` ✓
- Message format: `` `${timestamp}.${body}` `` (UTF-8) ✓
- Encoding: `.digest('hex')` — raw hex, no prefix ✓
- Replay window: `Math.abs(now - ts) > 300` (300 seconds = 5 minutes) ✓
- Timing-safe comparison: `crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))` ✓

**Header naming convention (important for generalisation):**
- CC → Owambe (inbound): `x-cc-signature`, `x-cc-timestamp`
- Owambe → CC (outbound): `x-owambe-signature`, `x-owambe-timestamp`

The pattern is `x-{signer-name}-signature` / `x-{signer-name}-timestamp`. A generalised middleware factory should accept `headerPrefix` (e.g. `'cc'` or `'owambe'`) to derive the header names dynamically.

---

### [VERIFY:C3] — Header name: `x-cc-signature` vs `x-signature`

**Brief claim:** "Verify the exact inbound header name used by CC."

**Finding:** **CONFIRMED — `x-cc-signature` and `x-cc-timestamp`.**

```typescript
// channel.ts line 56–57
const signature = req.headers['x-cc-signature'] as string | undefined;
const timestamp = req.headers['x-cc-timestamp'] as string | undefined;
```

Also confirmed in `channelRateLimiter.ts` line 79:
```typescript
const sig = req.headers['x-cc-signature'] as string | undefined;
```

**No `x-signature` header exists anywhere in the codebase.** Brief C should not reference `x-signature` as an alternative.

---

### [VERIFY:C4] — Existing middleware directory and cross-cutting patterns

**Brief claim:** "Verify whether a `middleware/` directory exists and what patterns it establishes."

**Finding:** **CONFIRMED — middleware directory exists with 8 files.**

```
apps/api/src/middleware/
  authenticate.ts        — JWT auth (Bearer token)
  channelRateLimiter.ts  — Redis-backed per-channel rate limiting
  errorHandler.ts        — Global Express error handler
  rateLimiter.ts         — General API rate limiter
  requestLogger.ts       — HTTP request logging
  requireMode.ts         — Owambe mode guard (STAY/EXPERIENCE)
  requireRole.ts         — RBAC role guard
  security.ts            — Helmet + CORS
  validate.ts            — Zod schema validation middleware
```

The `channelRateLimiter.ts` is the most relevant pattern for Brief C. It uses a factory function (`channelRateLimiter()`) that returns an Express middleware. The generalised auth middleware should follow the same factory pattern: `verifyChannelSignature(options)` returning `(req, res, next) => void`.

**Partner identity derivation** (from `channelRateLimiter.ts` lines 62–79): Currently hardcoded to `'cc:coastal-corridor'` for all requests carrying `x-cc-signature`. The comment explicitly notes: "A future multi-partner architecture would introduce a stable `x-channel-partner-id` header or a secret-hash lookup table." Brief C's generalisation work should address this.

---

### [VERIFY:C5] — Feature flag infrastructure

**Brief claim:** "Verify whether a feature flag system exists for gating generalisation rollout."

**Finding:** **CONFIRMED — no feature flag infrastructure exists.**

No LaunchDarkly, Unleash, or custom feature flag system is present. The only env-based conditional logic is `process.env.NODE_ENV` checks for dev/test/production gating. Brief C's generalisation can be gated by a simple `CHANNEL_AUTH_V2_ENABLED=true` env var if a rollout gate is desired, but no existing flag infrastructure needs to be integrated.

---

### [VERIFY:C6] — Logger structure for signature verification events

**Brief claim:** "Verify the logger call pattern used for auth failures."

**Finding:** **CONFIRMED.**

```typescript
// channel.ts line 79–83
logger.warn('[Channel] Invalid HMAC signature on inbound request', {
  path: req.path,
  requestId: req.headers['x-request-id'],
});
res.status(401).json({ error: 'INVALID_SIGNATURE', message: 'Request signature verification failed' });
```

The logger uses `logger.warn()` with a `[Channel]` prefix and a structured metadata object. The generalised middleware should use `logger.warn('[ChannelAuth] ...')` with `{ channelId, path, requestId }` to maintain the structured-log convention.

---

## Brief D — Webhook Dispatcher Generalisation

### [VERIFY:D1] — Current dispatcher architecture

**Brief claim:** "Verify the dispatcher is BullMQ-backed with synchronous fallback."

**Finding:** **CONFIRMED — exact architecture match.**

- Queue name: `owambe:webhook-dispatch` (Redis-backed BullMQ)
- Retry: 5 attempts, exponential backoff starting at 2s (`backoff: { type: 'exponential', delay: 2000 }`)
- Fallback: synchronous HTTP if `REDIS_URL` not set or Redis unreachable
- Signing: fresh timestamp + HMAC generated at `executeDelivery()` time (not enqueue time) — OWB-WAVE-4-01-FIX
- Delivery log: `WebhookDeliveryLog` model, upserted on `eventId` (unique)

---

### [VERIFY:D2] — Current `WebhookEventType` union

**Brief claim:** "Verify the complete list of event types currently in the union."

**Finding:** **CONFIRMED — 5 event types, all `reservation.*` namespace.**

```typescript
export type WebhookEventType =
  | 'reservation.status_changed'
  | 'reservation.cancelled'
  | 'reservation.checked_in'
  | 'reservation.checked_out'
  | 'reservation.no_show';
```

**No `booking.*` event types exist yet.** The experience booking flow (Phase 5.1) does not currently dispatch outbound webhooks. Brief D's generalisation work will need to add `booking.created`, `booking.cancelled` etc. to the union as part of Phase 5.2 scope.

---

### [VERIFY:D3] — All call sites for `dispatchWebhookEvent`

**Brief claim:** "Verify all call sites to understand the impact surface of generalisation."

**Finding:** **CONFIRMED — exactly 2 call sites, both in `channel.ts`.**

```
channel.ts:742  — dispatchWebhookEvent({ eventType: 'reservation.status_changed', ... })
channel.ts:758  — dispatchWebhookEvent({ eventType: 'reservation.status_changed', ... })
```

Both are in the `PATCH /api/v1/channel/stays/reservations/:cc_reservation_id` handler (reservation status update flow). No call sites exist in services, adapters, or other routes. The generalisation impact surface is currently minimal.

---

### [VERIFY:D4] — BullMQ worker retry configuration

**Brief claim:** "Verify retry count and backoff strategy."

**Finding:** **CONFIRMED.**

```typescript
defaultJobOptions: {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 1000 },
},
```

5 attempts, exponential backoff, 2s initial delay. `removeOnComplete: { count: 200 }` keeps the last 200 completed jobs for observability. `removeOnFail: { count: 1000 }` retains failed jobs for debugging.

---

### [VERIFY:D5] — `WebhookDeliveryLog` schema: channel discriminator field

**Brief claim:** "Verify whether WebhookDeliveryLog has a channel/source discriminator field."

**Finding:** **CORRECTION REQUIRED.**

The current `WebhookDeliveryLog` model does **not** have a `channelId`, `sourceChannel`, or `partnerSlug` field. The only routing discriminator is `targetUrl` (`String`, non-nullable). For multi-channel generalisation, a `channelSlug` or `channelId` field will need to be added via migration.

**Current model fields:**
```
id, eventId (unique), eventType, targetUrl, requestBody,
httpStatus, responseBody, deliveryStatus, errorMessage,
attemptCount, durationMs, lastAttemptAt, createdAt, updatedAt
```

Brief D should include a migration step to add `channelSlug String? @default("coastal-corridor")` to `WebhookDeliveryLog` as part of the generalisation work.

---

### [VERIFY:D6] — `targetUrl` override mechanism in `dispatchWebhookEvent`

**Brief claim:** "Verify whether per-call URL override is already supported."

**Finding:** **CONFIRMED — `targetUrl` override already exists.**

```typescript
export interface WebhookDispatchPayload {
  eventType: WebhookEventType;
  data: Record<string, unknown>;
  targetUrl?: string;          // ← optional override
  idempotencyKey?: string;
}
// ...
const targetUrl = payload.targetUrl ?? DEFAULT_CC_WEBHOOK_URL;
```

The `targetUrl` optional field is already in `WebhookDispatchPayload`. Callers can override the destination URL per-dispatch. This is the correct hook for multi-channel routing — Brief D's generalisation can extend this by adding a `channelSlug` field that resolves to a URL via a lookup (from a `ChannelPartner` table or env var map).

---

## Summary Table

| Flag | Brief | Verdict | Action Required in Rev 1 |
|---|---|---|---|
| A1 | A-Amendment-01 | CONFIRMED | None — env var is `CC_WEBHOOK_INBOUND_URL` |
| A2 | A-Amendment-01 | CONFIRMED | None — no ChannelPartner model exists; Amendment 01 is a net-new addition |
| B1 | B | CONFIRMED | Precision: use `externalRef` (camelCase), not `external_ref` |
| B2 | B | CONFIRMED | None — call-site map matches brief's scope |
| B3 | B | CONFIRMED | `externalRef` is `@@index` only, not `@unique` — no uniqueness change needed in rename migration |
| B4 | B | CONFIRMED | Follow `pay_canonical_01` three-step pattern for rename migration |
| B5 | B | CONFIRMED | 4 rows total across both tables; migration is safe |
| C1 | C | CONFIRMED | Named function `verifyCoastalCorridorSignature` applied via `router.use()` |
| C2 | C | CONFIRMED | HMAC-SHA256, `timestamp.body`, hex, 5-min window, timing-safe — all correct |
| C3 | C | CONFIRMED | Headers are `x-cc-signature` / `x-cc-timestamp`; no `x-signature` variant |
| C4 | C | CONFIRMED | `middleware/` dir exists; factory pattern (`channelRateLimiter()`) is the model to follow |
| C5 | C | CONFIRMED | No feature flag infrastructure; env var gate is sufficient |
| C6 | C | CONFIRMED | `logger.warn('[Channel] ...')` with structured metadata — generalised version should use `[ChannelAuth]` prefix |
| D1 | D | CONFIRMED | BullMQ + sync fallback, 5 retries, exponential backoff — all correct |
| D2 | D | CONFIRMED | 5 event types, all `reservation.*`; no `booking.*` types yet — Phase 5.2 adds them |
| D3 | D | CONFIRMED | Exactly 2 call sites in `channel.ts` (both in PATCH reservation handler) |
| D4 | D | CONFIRMED | 5 attempts, exponential 2s backoff, removeOnComplete 200, removeOnFail 1000 |
| D5 | D | **CORRECTION REQUIRED** | `WebhookDeliveryLog` has no channel discriminator field; migration needed to add `channelSlug` |
| D6 | D | CONFIRMED | `targetUrl` override already in `WebhookDispatchPayload`; correct hook for multi-channel routing |

**Verdict summary:** 18 CONFIRMED, 1 CORRECTION REQUIRED (D5).

---

## Recommended Rev 1 Edits

### Brief D — Single correction

**Section:** WebhookDeliveryLog schema description
**Current text (inferred):** "The delivery log model tracks per-event delivery state."
**Required addition:** "The current `WebhookDeliveryLog` model does not include a channel discriminator field. Phase 5.2 generalisation must add `channelSlug String? @default("coastal-corridor")` via a new migration before multi-channel delivery logging is meaningful."

### Brief B — Precision adjustment (not a correction)

**Section:** Field naming
**Adjustment:** All references to `external_ref` should use `externalRef` (Prisma camelCase field name). The DB column name is also `externalRef` (no `@map` override).

### Brief C — Precision adjustment (not a correction)

**Section:** Generalised middleware naming
**Adjustment:** The generalised middleware log prefix should be `[ChannelAuth]` not `[Channel]` to distinguish auth events from handler events in Railway log filtering.

---

*Report generated from codebase state at commit `ca1cd49` (master) / `c4133d7` (staging). All line numbers reference the current `master` branch.*
