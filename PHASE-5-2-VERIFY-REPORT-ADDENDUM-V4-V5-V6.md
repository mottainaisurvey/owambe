# Phase 5.2 Brief D Verification Addendum — V4 + V5 + V6
**Re-verification cycle per brief-canonical flag numbering**
**Date:** 2026-05-24 | **Codebase state:** commit `8eb9562` (master), `f59ea31` (staging)

---

## [VERIFY:V4] — Scoped Briefs Inventory Referencing `checked_in` Naming

### Scope of search

All Markdown artefacts in the Owambe repository, all four Phase 5.2 briefs supplied for verification, and all TypeScript source files. Search terms: `checked_in`, `checked_out`, `reservation.checked`, `guest_checked_in`, `guest_checked_out`.

---

### Findings

**Substantive references** (brief defines AC against the event name, or documents expected wire payload using the name):

| Artefact | Location | Reference type | Old naming | New naming |
|---|---|---|---|---|
| `webhookDispatcher.service.ts` | Lines 41–42 (comment block) | Canonical event type documentation | `reservation.checked_in` / `reservation.checked_out` | — |
| `webhookDispatcher.service.ts` | Lines 67–68 (`WebhookEventType` union) | Type definition — live code | `'reservation.checked_in'` / `'reservation.checked_out'` | — |
| `channel.ts` | Lines 735–736 (outbound dispatch map) | Live dispatch routing | `'reservation.checked_in'` / `'reservation.checked_out'` | — |
| `OWB-PHASE-5-2-BRIEF-D-webhook-dispatcher-generalisation.md` | Lines 15, 17, 21, 23, 42, 48, 54, 72, 107 | Brief D itself — multiple substantive references | `reservation.checked_in` / `reservation.checked_out` | `reservation.guest_checked_in` / `reservation.guest_checked_out` |

**Incidental references** (transcript / comment context, not defining ACs or wire payloads):

| Artefact | Location | Reference type |
|---|---|---|
| `PHASE-5-2-VERIFY-REPORT.md` | Lines 280–281 | Prior verification report quoting the type union — incidental |

**Inbound handler** (CC → Owambe direction, already on new naming):

| Artefact | Location | Note |
|---|---|---|
| `channel.ts` | Lines 1138, 1179 (`case` statements) | Inbound webhook handler already uses `reservation.guest_checked_in` / `reservation.guest_checked_out` — **new naming already live on inbound side** |

---

### Verdict

**CONFIRMED with substantive inventory complete.**

The scoped brief artefacts holding `checked_in` naming canonically are:

1. **`webhookDispatcher.service.ts`** — two locations: the file-header comment block (lines 41–42) and the `WebhookEventType` union (lines 67–68). These are the live code artefacts that Brief D AC-D2 targets.

2. **`channel.ts`** — the outbound dispatch event type map (lines 735–736). This is the live dispatch routing that Brief D AC-D2 targets.

3. **`OWB-PHASE-5-2-BRIEF-D-webhook-dispatcher-generalisation.md`** — Brief D itself contains the most substantive references (9 lines), including the AC definition (AC-D2), the bilateral discussion territory, and the transition window open questions. Brief D is self-referentially the primary scoped brief that canonically references both the old naming and the spec-canonical direction.

**No other scoped brief artefacts** (Brief A Amendment 01, Brief B, Brief C) reference `checked_in` or `checked_out` naming in any form — confirmed by exhaustive grep.

**Key asymmetry to surface for Rev 1:** The inbound handler in `channel.ts` (CC → Owambe) already uses `reservation.guest_checked_in` / `reservation.guest_checked_out` (new naming). The outbound dispatcher (Owambe → CC) still uses `reservation.checked_in` / `reservation.checked_out` (old naming). The two sides of the same codebase are currently on different naming conventions. Brief D AC-D2 resolves this by updating the outbound side to match the inbound side.

**Amendment sequencing implication:** Only one Amendment-style artefact is needed on the Owambe side — an amendment to Brief D itself (or a standalone amendment artefact) covering the `WebhookEventType` union rename and the outbound dispatch map update. No other scoped briefs require amendment.

---

## [VERIFY:V5] — Channel Capability Mapping Pattern

### Scope of search

All TypeScript source files under `apps/api/src/`. Search terms: `capability`, `supportsStays`, `supportsExperiences`, `channelMode`, `CHANNEL_MODE`, `eventFilter`, `allowedEvent`, `channelCapabilit`. Also examined `requireMode.ts` middleware and `channelRateLimiter.ts` for any mode-to-event-type mapping logic.

---

### Findings

**No channel capability mapping pattern exists in the current codebase.** All three search vectors returned zero hits:

- `channelRateLimiter.ts` — no capability, mode, event type filter, or channel-to-mode mapping logic. The middleware performs Redis-backed rate limiting only, keyed on `'cc:coastal-corridor'` (hardcoded string). No event type awareness.

- `channel.ts` — no `supportsStays`, `supportsExperiences`, `channelMode`, or `eventFilter` logic. The route file handles both stays and experiences endpoints without any capability gate.

- `webhookDispatcher.service.ts` — no channel-specific routing, no mode filter, no event type filter. The dispatcher accepts any `WebhookEventType` value and routes all events to the single `DEFAULT_CC_WEBHOOK_URL`.

- `requireMode.ts` — this middleware gates **user-facing API routes** by the authenticated user's `availableModes` (EVENTS / STAYS / EXPERIENCES). It is not a channel capability pattern — it is a user entitlement pattern. It has no interaction with channel dispatch logic.

---

### Verdict

**CONFIRMED — no channel capability mapping pattern exists. Pattern α is fully greenfield.**

The current architecture has no code that maps channel identity to event types, modes, or capabilities. The `requireMode` middleware is the closest structural analogue but operates on user entitlements, not channel capabilities — it is not a constraint on Pattern α implementation.

**Implication for Brief D Rev 1:** Pattern α (mode-based capability dispatch using `channel.supportsStays` / `supportsExperiences` flags from Brief A Rev 2) is greenfield implementation. There is no existing pattern that constrains the choice or provides a partial implementation to extend. Brief D should note that AC-D4 (capability-aware dispatch) is a net-new implementation surface with no existing code to refactor.

**No substantive precedent for Pattern β** (event-type-specific capability flags) exists either. The `eventTypeMap` in `channel.ts` (lines 734–739) maps Owambe booking statuses to event type strings but contains no capability check — it is a pure translation table, not a capability gate.

---

## [VERIFY:V6] — Per-Channel Retry / DLQ Infrastructure

### Scope of search

`webhookDispatcher.service.ts` in full. BullMQ queue and worker configuration, failure handling, queue name constants, and any per-channel isolation logic.

---

### Findings

**Current queue architecture: single global queue, no per-channel isolation.**

```
Queue name:    owambe:webhook-dispatch          (single queue, all channels)
Worker:        one Worker instance, concurrency: 10
Retry:         attempts: 5, exponential backoff, delay: 2000ms
removeOnFail:  { count: 1000 }                  (BullMQ's implicit DLQ — failed jobs retained)
removeOnComplete: { count: 200 }
```

**Failure handling chain:**

1. `executeDelivery()` throws on non-2xx HTTP response → BullMQ retries up to 5 attempts
2. After 5 failed attempts, BullMQ marks job as `failed` and retains it in the `failed` set (`removeOnFail: { count: 1000 }`)
3. `_dispatchWorker.on('failed', ...)` fires: `logger.error('[WebhookDispatcher] Job ${job.id} permanently failed: ...')`
4. `WebhookDeliveryLog` is upserted with `deliveryStatus: 'FAILED'` on each attempt

**No explicit DLQ.** BullMQ's `removeOnFail: { count: 1000 }` retains failed jobs in Redis under the `failed` key prefix — this is BullMQ's implicit failed-job store, not a separate DLQ queue. There is no separate queue for failed jobs, no dead-letter routing, and no replay mechanism.

**Per-channel isolation: does not exist.** All channels share the single `owambe:webhook-dispatch` queue. Failure modes:

- **Stuck jobs:** A job that exhausts all 5 retries is marked `failed` and removed from the active queue. It does not block subsequent jobs. BullMQ processes jobs independently — a permanently failed job for Channel A does not block dispatch to Channel B.

- **Slow/hanging jobs:** The worker has `concurrency: 10`. A slow HTTP call to Channel A occupies one of the 10 worker slots. With only one channel currently (CC), this is not a practical concern. With multiple channels, a channel whose endpoint is slow (but not failing) could occupy multiple slots and reduce throughput for other channels — but would not fully block them unless all 10 slots are occupied by the same channel's jobs.

- **No per-channel queue isolation:** There is no mechanism to pause, drain, or inspect jobs for a specific channel independently. All queue operations (pause, drain, getJobCounts) operate on the global queue.

---

### Verdict

**CONFIRMED — single global queue, no per-channel isolation. AC-D5 is new implementation surface.**

Brief D AC-D5 ("Failure isolation per channel — failure dispatching to one channel doesn't block dispatch to other channels") is **not already satisfied** by the current infrastructure. The current architecture provides partial natural isolation (permanently failed jobs don't block the queue) but does not provide:

- Per-channel queue pause/drain capability
- Per-channel job count visibility
- Per-channel DLQ
- Backpressure isolation (slow channel cannot monopolise worker slots)

**Implementation options for AC-D5 (for Brief D Rev 1 consideration):**

| Option | Description | Complexity |
|---|---|---|
| Per-channel queues | One `owambe:webhook-dispatch:{channelSlug}` queue per channel | High — requires dynamic queue/worker creation |
| Single queue with channel-aware concurrency limiter | BullMQ `groupKey` or custom rate limiter per channel slug | Medium — BullMQ Pro feature or custom implementation |
| Single queue with channel-aware circuit breaker | Track consecutive failures per channel; skip dispatch when circuit open | Low — application-level, no BullMQ changes |

The circuit breaker pattern (Option 3) is the lowest-complexity path to AC-D5 satisfaction and aligns with the existing `WebhookDeliveryLog` infrastructure (consecutive failure count is already tracked via `attemptCount`).

---

## Summary

| Flag | Verdict | Key finding |
|---|---|---|
| **V4** | CONFIRMED | Two live code artefacts hold old naming canonically (`webhookDispatcher.service.ts` lines 41–42 and 67–68; `channel.ts` lines 735–736). Brief D is the only scoped brief requiring amendment. Inbound handler already on new naming — outbound/inbound asymmetry is the implementation gap. |
| **V5** | CONFIRMED | No channel capability mapping pattern exists. Pattern α is fully greenfield. `requireMode.ts` is a user entitlement pattern, not a channel capability pattern — no constraint on Pattern α. |
| **V6** | CONFIRMED | Single global queue, no per-channel isolation. AC-D5 is new implementation surface. Permanently failed jobs do not block the queue (natural isolation). Slow-channel slot monopolisation is the primary failure mode to address. Circuit breaker pattern is lowest-complexity AC-D5 path. |

---

*Addendum to PHASE-5-2-VERIFY-REPORT.md. Prior 18 CONFIRMED + 1 CORRECTION REQUIRED verdicts unchanged.*
*Codebase state: commit `8eb9562` (master) / `f59ea31` (staging).*
