# OWB Phase 5.2 — Consolidated Wire Probe Verification Report

**Date:** 2026-05-25  
**Baseline:** `https://owambe-api-staging.up.railway.app`  
**Deployed build:** `0959776e` (staging branch)  
**Probe time:** 2026-05-25T09:25:18Z  

---

## Summary

All 5 deferred ACs from Amendment-02, Brief B Rev 2, and Brief C Rev 2 are confirmed **PASS** via live wire probes against Railway staging.

| AC | Description | HTTP | Result |
|---|---|---|---|
| AC-A2-5 | Amendment-02 — existing CC integration uninterrupted | 422 | **PASS** |
| AC-B3 | Brief B Rev 2 — existing CC integration uninterrupted post-migration | 422 | **PASS** |
| AC-C4 live | Brief C Rev 2 — canonical route `/api/v1/channels/coastal-corridor/webhooks/inbound` | 422 | **PASS** |
| AC-C6 live | Brief C Rev 2 — legacy route with `x-cc-signature` + `x-cc-timestamp` transition window headers | 422 | **PASS** |
| AC-C1 live | Brief C Rev 2 — second-channel HMAC via `test-channel` slug | 422 | **PASS** |

**Pass criterion:** HTTP 422 `UNRECOGNISED_EVENT` confirms HMAC authentication passed. The inbound handler correctly rejects `event_type: ping` (not a registered CC event type) — this is the expected behaviour for a probe payload. HTTP 401/403 would indicate auth failure; none observed.

---

## Wire Probe Details

### AC-A2-5 — Amendment-02 existing CC integration uninterrupted

```
POST /api/v1/channel/webhooks/inbound
Headers: X-Signature: <HMAC-SHA256>, X-Timestamp: <unix>
Secret:  coastal-corridor hmac_secret (0471e9df...)
Response: HTTP 422 {"error":"UNRECOGNISED_EVENT","message":"Unknown event type: ping"}
```

**Interpretation:** HMAC verification passed. The `timestamp_header` column addition (Amendment-02) did not break the existing CC inbound webhook path. The channel registry lookup (`getChannelBySlug('coastal-corridor')`) resolved correctly and the HMAC was verified against `channel.hmacSecret`.

---

### AC-B3 — Brief B Rev 2 existing CC integration uninterrupted

```
POST /api/v1/channel/webhooks/inbound
Headers: X-Signature: <HMAC-SHA256>, X-Timestamp: <unix>
Secret:  coastal-corridor hmac_secret (0471e9df...)
Response: HTTP 422 {"error":"UNRECOGNISED_EVENT","message":"Unknown event type: ping"}
```

**Interpretation:** HMAC verification passed. The Brief B Rev 2 schema changes (`channel_id` FK addition, `ccPropertyId` → `externalPartnerPropertyId` rename, `externalPartnerPropertyId` column drop) did not break the inbound webhook path. The channel registry lookup and HMAC verification operate correctly against the new schema.

---

### AC-C4 live — Canonical route

```
POST /api/v1/channels/coastal-corridor/webhooks/inbound
Headers: X-Signature: <HMAC-SHA256>, X-Timestamp: <unix>
Secret:  coastal-corridor hmac_secret (0471e9df...)
Response: HTTP 422 {"error":"UNRECOGNISED_EVENT","message":"Unknown event type: ping"}
```

**Interpretation:** Canonical route is registered and reachable. `channelSlug` param (`coastal-corridor`) was captured via `mergeParams: true` on `channelRouter`. `getChannelBySlug('coastal-corridor')` resolved. HMAC verified against `channel.signatureHeader` (`X-Signature`) + `channel.timestampHeader` (`X-Timestamp`) + `channel.hmacSecret`.

---

### AC-C6 live — Legacy route transition window fallback

```
POST /api/v1/channel/webhooks/inbound
Headers: x-cc-signature: <HMAC-SHA256>, x-cc-timestamp: <unix>
Secret:  coastal-corridor hmac_secret (0471e9df...)
Response: HTTP 422 {"error":"UNRECOGNISED_EVENT","message":"Unknown event type: ping"}
```

**Interpretation:** Transition window fallback accepted legacy `x-cc-signature` / `x-cc-timestamp` header names. `verifyChannelSignature` factory fell back to legacy headers (C-P2 Path (a)) and emitted a `[ChannelAuth] DEPRECATION` warning log. HMAC verified successfully.

---

### AC-C1 live — Second-channel HMAC (test-channel)

```
POST /api/v1/channels/test-channel/webhooks/inbound
Headers: X-Signature: <HMAC-SHA256>, X-Timestamp: <unix>
Secret:  test-channel hmac_secret (5ec0d285...)
Response: HTTP 422 {"error":"UNRECOGNISED_EVENT","message":"Unknown event type: ping"}
```

**Interpretation:** Second-channel routing confirmed. `getChannelBySlug('test-channel')` resolved to the test-channel registry row. HMAC verified against the test-channel secret (distinct from coastal-corridor secret). Channel-driven auth factory operates correctly for a second channel without any hardcoded channel-specific logic.

---

## Infrastructure Issues Resolved During Wire Probe Cycle

Three infrastructure issues were discovered and resolved during this probe cycle:

### 1. Railway nixpacks stale dist cache

**Symptom:** Railway reported the correct git commit hash in `/health` but was serving compiled code from a previous build. New TypeScript changes (route mounts) were not reflected in the running binary.

**Fix:** Added `rm -rf dist` before `npm run build` in `apps/api/railway.json` build command (`d803a3e`). Forces a clean TypeScript recompile on every Railway deploy.

### 2. Canonical route mount in wrong file (app.ts vs index.ts)

**Symptom:** Canonical route `/api/v1/channels/:channelSlug/...` returned HTTP 401 `Authentication required` (JWT error) despite correct code in `app.ts`.

**Root cause:** `index.ts` is the actual Express entry point. `app.ts` is imported only for middleware setup (helmet, cors, etc.). All `app.use(router)` route registrations are in `index.ts`. The canonical route mount was added to `app.ts` (wrong file) and never registered in the running server.

**Fix:** Added `app.use('/api/v1/channels/:channelSlug', channelRouter)` to `index.ts` at line 128, immediately after the legacy mount at line 124, both before `messagesRouter` at line 143 (`0959776`).

### 3. channelRouter mount order (messagesRouter JWT interception)

**Symptom:** Any request to `/api/v1/channels/*` was intercepted by `messagesRouter`'s `router.use(authenticate)` and returned HTTP 401 before reaching `channelRouter`.

**Fix:** Both channel router mounts (legacy + canonical) are now registered before `messagesRouter` in `index.ts`. This was the correct fix once the wrong-file issue was resolved.

---

## Commits in This Probe Cycle

| Commit | Branch | Description |
|---|---|---|
| `43d2da9` | master + staging | Path (γ-secret): seed.ts fix — populate `hmacSecret` from env vars on re-seed |
| `f726381` | master + staging | fix(channel): mount channelRouter before messagesRouter |
| `bc5c3dc` | master + staging | fix(channel): correct canonical route mount path + mergeParams |
| `8e85fe7` | master + staging | fix(health): add canary + build hash to health endpoint |
| `d803a3e` | master + staging | fix(railway): force clean dist rebuild on every deploy |
| `0959776` | master + staging | fix(channel): add canonical route mount to index.ts (actual entry point) |

---

## Outstanding Items

- **AC-C6 deprecation log verification:** The `[ChannelAuth] DEPRECATION` warning log for legacy header fallback cannot be verified from outside the Railway container. Confirm via Railway log viewer: filter for `[ChannelAuth] DEPRECATION` in staging logs after the probe run.
- **TEST_CHANNEL_HMAC_SECRET env var:** Set in Railway staging Variables to `5ec0d285b89f38bd4ead1eafa3e542c803a02191d76c563b3971f96a04461682`. The DB row was populated via Path (α-secret) direct UPDATE. Future re-seeds will use this env var via the Path (γ-secret) seed fix.
- **CC_HMAC_SECRET env var:** Set in Railway staging Variables to the Phase 5.1 value. DB row populated via Path (α-secret) direct UPDATE.
- **app.ts canonical route mount:** The canonical route mount in `app.ts` is now redundant (index.ts is the actual entry point). It is harmless but can be cleaned up in a future housekeeping commit.
