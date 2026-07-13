# EMAIL-DIAG-01 — Railway Staging Log Evidence

Captured: 2026-07-13T21:36 UTC
Source: Railway project `c57d784c-0f16-4855-8adf-dfa37eaf3738`, staging environment
Filter: `Email`, range 2026-07-13 18:00–21:40 UTC

## Verbatim log lines (all email-related entries in range)

| Timestamp (Railway) | Service | Message |
|---|---|---|
| Jul 13 2026 18:27:51 | owambe-api | `2026-07-13 18:27:48 [error]: Email failed: guest-experience-booking-confirmed → prewalk-verify-consumer@test.owambe.com` |
| Jul 13 2026 18:27:51 | owambe-api | `2026-07-13 18:27:48 [error]: Email failed: operator-new-booking → smoke-operator-uienable01@test.owambe.com` |
| Jul 13 2026 20:23:39 | owambe-api | `2026-07-13 20:23:32 [error]: Email failed: guest-experience-booking-confirmed → prewalk-verify-consumer@test.owambe.com` |
| Jul 13 2026 20:23:39 | owambe-api | `2026-07-13 20:23:32 [error]: Email failed: operator-new-booking → smoke-operator-uienable01@test.owambe.com` |
| Jul 13 2026 20:23:46 | owambe-api | `2026-07-13 20:23:46 [error]: Email failed: guest-experience-booking-confirmed → prewalk-verify-consumer@test.owambe.com` |
| Jul 13 2026 20:23:46 | owambe-api | `2026-07-13 20:23:46 [error]: Email failed: operator-new-booking → smoke-operator-uienable01@test.owambe.com` |
| Jul 13 2026 21:00:51 | owambe-api | `2026-07-13 21:00:51 [warn]: Redis unavailable (Queue name cannot contain :). Email queue degraded to synchronous fallback.` |

## Raw data (first entry, verbatim from Railway)

```json
{
  "message": "2026-07-13 18:27:48 [error]: Email failed: guest-experience-booking-confirmed → prewalk-verify-consumer@test.owambe.com",
  "severity": "info",
  "attributes": {
    "level": "info"
  },
  "tags": {
    "project": "c57d784c-0f16-4855-8adf-dfa37eaf3738",
    "environment": "388aaa3b-46e5-464f-be07-2b2501c6a4c9",
    "service": "3cc8cf6c-4fd0-4021-9473-5a4e569965be",
    "deployment": "ee7f8fa6-aaf4-461f-bcfb-094bb5b64651",
    "replica": "1b7ec63b-4938-462b-8420-2cde33a91c6f"
  },
  "timestamp": "2026-07-13T18:27:51.455037933Z"
}
```

## Observations

1. All four expected dispatch attempts executed (setImmediate fired for both bookings at both timestamps).
2. All four attempts logged `[error]: Email failed` — the Postmark call threw an exception.
3. The error message body does NOT include the underlying exception detail (the logger call is `logger.error(msg, err?.message || err)` but Railway only captures the first argument as the log message; the error detail is not visible in the Railway log panel).
4. A subsequent `[warn]` at 21:00:51 reveals a Redis queue issue: `Queue name cannot contain :` — this caused the email queue to degrade to synchronous fallback. This warn post-dates the two booking events and is likely unrelated to the failures at 18:27 and 20:23, but is noted as context.
5. No `[info]: Email sent` lines appear anywhere in the range — confirming zero successful Postmark deliveries.
