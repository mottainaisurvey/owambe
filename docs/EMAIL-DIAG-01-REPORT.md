# EMAIL-DIAG-01 — Staging Email Diagnostic Report

**Instrument:** OWB-EMAIL-DIAG-01  
**Scope:** Bounded staging email diagnostic — facts only, no fix, no config change  
**Prepared by:** Thread-2 (Owambe developer)  
**Date:** 2026-07-13  
**Status:** Three facts delivered; disposition to founder

---

## Fact 1 — Env Presence (Names Only, Never Values)

The staging Railway environment (`environmentId: 388aaa3b-46e5-464f-be07-2b2501c6a4c9`, service `owambe-api`) defines **23 service variables**. The Railway Variables panel explicitly reports:

> **"20 Variables are included in other environments but missing in this one."**

The following email-service configuration variables are listed in that missing section — **present in production, absent in staging**:

| Variable Name | Status in Staging |
|---|---|
| `POSTMARK_API_KEY` | **ABSENT** (found in production) |
| `EMAIL_FROM_NAME` | **ABSENT** (found in production) |
| `EMAIL_FROM` | **ABSENT** (found in production) |

No other email-related variable names appear in the staging variable set. The Railway UI screenshot is filed as `EMAIL-DIAG-01-staging-variables-missing.webp`.

---

## Fact 2 — Dispatch Logs

The Railway staging API logs, filtered on `Email`, range 2026-07-13 18:00–21:40 UTC, show the following verbatim lines:

```
Jul 13 2026 18:27:51  owambe-api  2026-07-13 18:27:48 [error]: Email failed: guest-experience-booking-confirmed → prewalk-verify-consumer@test.owambe.com
Jul 13 2026 18:27:51  owambe-api  2026-07-13 18:27:48 [error]: Email failed: operator-new-booking → smoke-operator-uienable01@test.owambe.com
Jul 13 2026 20:23:39  owambe-api  2026-07-13 20:23:32 [error]: Email failed: guest-experience-booking-confirmed → prewalk-verify-consumer@test.owambe.com
Jul 13 2026 20:23:39  owambe-api  2026-07-13 20:23:32 [error]: Email failed: operator-new-booking → smoke-operator-uienable01@test.owambe.com
Jul 13 2026 20:23:46  owambe-api  2026-07-13 20:23:46 [error]: Email failed: guest-experience-booking-confirmed → prewalk-verify-consumer@test.owambe.com
Jul 13 2026 20:23:46  owambe-api  2026-07-13 20:23:46 [error]: Email failed: operator-new-booking → smoke-operator-uienable01@test.owambe.com
Jul 13 2026 21:00:51  owambe-api  2026-07-13 21:00:51 [warn]: Redis unavailable (Queue name cannot contain :). Email queue degraded to synchronous fallback.
```

Observations from the log evidence:

1. All four `setImmediate` email dispatch attempts **executed** — the code path fired for both booking events at both timestamps.
2. All four attempts logged `[error]: Email failed` — the Postmark call threw an exception in each case.
3. The error message body does not include the underlying exception detail. The logger call is `logger.error(msg, err?.message || err)` but Railway captures only the first argument as the log message; the Postmark error object is not visible in the Railway log panel.
4. No `[info]: Email sent` lines appear anywhere in the range — confirming **zero successful Postmark deliveries**.
5. A `[warn]` at 21:00:51 records a Redis queue issue (`Queue name cannot contain :`), causing the email queue to degrade to synchronous fallback. This warn post-dates the two booking events and is noted as context; its relationship to the 18:27 and 20:23 failures is not established by this diagnostic.

The Railway logs screenshot is filed as `EMAIL-DIAG-01-railway-email-error-logs.webp`.

---

## Fact 3 — Resolved Configuration Path

`email.service.ts` resolves the following configuration variables:

| Purpose | Variable Name | Default (if absent) | Status in Staging |
|---|---|---|---|
| (a) Postmark server token | `POSTMARK_API_KEY` | `''` (empty string) | **ABSENT** |
| (b) Sender / FROM address | `EMAIL_FROM` | `'hello@owambe.com'` | **ABSENT** |
| (b) Sender display name | `EMAIL_FROM_NAME` | `'Owambe'` | **ABSENT** |
| (c) Message stream | hardcoded: `'outbound'` | N/A — no env var | N/A |

Relevant source lines (verbatim):

```typescript
// Server token (line 7–9):
_pmClient = new postmark.ServerClient(
  process.env.POSTMARK_API_KEY || ''
);

// FROM address (line 559):
From: `${process.env.EMAIL_FROM_NAME || 'Owambe'} <${process.env.EMAIL_FROM || 'hello@owambe.com'}>`,

// Message stream (line 563):
MessageStream: 'outbound',
```

The message stream is **hardcoded** as `'outbound'` — there is no environment variable for it. The Postmark server token, sender address, and sender display name are all absent from the staging environment; the code falls back to an empty string for the token and default values for the sender fields.

This enables founder-side confirmation: the Postmark server and stream that would need to be inspected are whichever server is associated with the token that was set in production (not staging), and the stream name is `outbound`.

---

## Summary

All three facts are stated. The diagnostic does not extend to root-cause determination or remediation; disposition follows from founder-side inspection.

— Thread-2 (Owambe developer)
