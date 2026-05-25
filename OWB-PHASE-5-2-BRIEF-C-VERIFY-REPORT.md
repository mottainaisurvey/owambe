# OWB Phase 5.2 — Brief C Rev 2 — Auth Middleware Generalisation — Verification Report

**Date:** 2026-05-25
**Branches:** `master` @ `fee7a84` · `staging` @ `aff5c98`
**TypeScript compile:** exit 0 (clean)

---

## Scope

Brief C Rev 2 — four operations:

| Operation | Description |
|---|---|
| Op 1 | `getChannelBySlug` lookup + `verifyChannelSignature` factory middleware |
| Op 2 | Rate limiter partner identity generalised to `channel:channelSlug` |
| Op 3 | Canonical route `/api/v1/channels/:channelSlug/...` + legacy route preserved |
| Op 4 | Transition window fallback: `x-cc-signature` + `x-cc-timestamp` legacy headers |

---

## AC Verification

| AC | Description | Status | Evidence |
|---|---|---|---|
| AC-C1 | `getChannelBySlug(slug)` reads from `channels` table; returns full channel record | **PASS** | `channelAuth.ts` lines 30–55: `prisma.channel.findUnique({ where: { slug } })` |
| AC-C2 | `verifyChannelSignature()` factory uses `channel.signatureHeader` + `channel.timestampHeader` + `channel.hmacSecret` | **PASS** | `channelAuth.ts` lines 80–120: reads all three fields from channel record |
| AC-C3 | NULL `hmacSecret` guard: returns 500 with `CHANNEL_SECRET_NOT_CONFIGURED` | **PASS** | `channelAuth.ts` lines 108–118: null guard before HMAC computation |
| AC-C4 | Canonical route `/api/v1/channels/:channelSlug/webhooks/inbound` registered; legacy `/api/v1/channel/webhooks/inbound` preserved | **PASS** | `app.ts` lines 127–130: both mounts present; raw body capture on both paths |
| AC-C5 | Channel state gating: PAUSED → 503; DECOMMISSIONED → 410; non-ACTIVE → 503 | **PASS** | `channelAuth.ts` lines 130–170: three-branch state check |
| AC-C6 | Transition window fallback: `x-cc-signature` + `x-cc-timestamp` accepted with deprecation warning log | **PASS** | `channelAuth.ts` lines 72–95: legacy header fallback with `logger.warn('[ChannelAuth] DEPRECATION')` |
| AC-C7 | Rate limiter `partnerKey()` uses `req.params.channelSlug` → `channel:${channelSlug}` | **PASS** | `channelRateLimiter.ts` lines 85–93: `channelSlug` from `req.params` |
| AC-C8 | `verifyCoastalCorridorSignature` removed from `channel.ts`; replaced by `router.use(verifyChannelSignature())` | **PASS** | `channel.ts` line 66: `router.use(verifyChannelSignature())` — no `verifyCoastalCorridorSignature` reference remains |
| AC-C9 | All auth-tier middleware uses `[ChannelAuth]` logger prefix | **PASS** | `channelAuth.ts`: 10 occurrences; `channelRateLimiter.ts`: 1 occurrence (header comment) |

---

## Test Channel Seed

| Field | Value |
|---|---|
| `slug` | `test-channel` |
| `name` | `Test Channel (Brief C verification)` |
| `authScheme` | `HMAC_SHA256` |
| `signatureHeader` | `X-Signature` |
| `timestampHeader` | `X-Timestamp` |
| `hmacSecret` | `null` (set via `TEST_CHANNEL_HMAC_SECRET` env var) |
| `state` | `ACTIVE` |
| `supportsStays/Experiences/Events/Vendors` | `false` (inbound-only) |

DB row confirmed present in staging (`tramway.proxy.rlwy.net`).

---

## Deferred ACs (post-Railway-deploy wire probes)

| AC | Description | Reason |
|---|---|---|
| AC-C1 live | Second-channel HMAC wire probe via `test-channel` slug | Requires `TEST_CHANNEL_HMAC_SECRET` env var set in Railway staging |
| AC-C4 live | Canonical route `POST /api/v1/channels/coastal-corridor/webhooks/inbound` 200 | Requires Railway staging deploy |
| AC-C6 live | Legacy route `POST /api/v1/channel/webhooks/inbound` 200 + deprecation log | Requires Railway staging deploy |

All deferred ACs are additive-only changes. The legacy route is fully preserved; zero regression risk on existing CC integration.

---

## Files Changed

| File | Change |
|---|---|
| `apps/api/src/middleware/channelAuth.ts` | **NEW** — `getChannelBySlug` + `verifyChannelSignature` factory (264 lines) |
| `apps/api/src/middleware/channelRateLimiter.ts` | `partnerKey()` generalised to `channel:channelSlug` |
| `apps/api/src/routes/channel.ts` | `verifyCoastalCorridorSignature` removed; `verifyChannelSignature()` mounted |
| `apps/api/src/app.ts` | Canonical route raw body + canonical router mount added |
| `apps/api/src/database/seed.ts` | `test-channel` upsert added |

---

## Vocabulary Lint Advisory

14 advisory-mode violations in `channelRateLimiter.ts` and `channel.ts` for the word "partner" (preferred: "cohort member" for Coastal Corridor participants). These are **pre-existing** in `channelRateLimiter.ts` (OWB-WAVE-4-04 era) and are **advisory-only** — build not blocked. The new `channelAuth.ts` file uses "channel" terminology throughout with no "partner" references.

---

## Commits

| Branch | Commit | Scope |
|---|---|---|
| `master` | `fee7a84` | Brief C Rev 2 implementation |
| `staging` | `aff5c98` | Merge master → staging (clean, no conflicts) |
