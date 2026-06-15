# OWB-F1-NEW-IMPLEMENTATION-01 Production Deploy Closure Report

**Date:** 2026-06-15
**Target Environment:** Railway Production (`owambe-api-production.up.railway.app`)
**Commit Hash:** `ad314532de038ca26e9463bf68796cba280bb1cb` (main)
**Feature Flag:** `OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED=true`

## 1. Deployment Summary

The F1-new (Coastal Corridor Outbound Booking Events) implementation has been successfully deployed to the production environment. The deployment followed the Discipline 3 `no-ff` merge pattern from `staging` to `main`.

The feature flag `OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED` was explicitly set to `true` on the Railway production environment (AC-F1-PROD-01), activating the outbound webhook dispatch layer for production traffic.

## 2. Production Smoke Probes (AC-F1-PROD-02)

A 5-probe production smoke verification cycle was executed against the live production environment using the production HMAC secret. To facilitate this without polluting production data, a temporary `probe-seed` endpoint was used to provision a minimal T1 probe experience and a far-future time slot (2030-07-04).

**Run ID:** `41F2C873`

| Probe | Target | Expected | Actual | Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Probe-1** | `booking.created` (POST `/experiences/bookings`) | HTTP 201 | HTTP 201 | ✅ PASS | Dispatched `booking.created` payload. |
| **Probe-2** | `booking.cancelled` (POST `/experience-bookings/:id/cancel`) | HTTP 200 | HTTP 200 | ✅ PASS | Used synthetic guest email (`@owambe-probe.invalid`) per §7.25 discipline. |
| **Probe-3** | `booking.refunded` (POST `/webhooks/inbound`) | HTTP 200 | HTTP 200 | ✅ PASS | Created fresh booking, cancelled, then triggered refund webhook. |
| **Probe-4a** | Auth Guard (No HMAC headers) | HTTP 401 | HTTP 401 | ✅ PASS | Rejected unauthorized access. |
| **Probe-4b** | Auth Guard (Bad HMAC signature) | HTTP 401 | HTTP 401 | ✅ PASS | Rejected invalid signature. |

All production smoke probes passed successfully.

## 3. Operational Caution & Cleanup

- **Synthetic Data:** Probe-2 (cancellation) utilised a synthetic guest email (`@owambe-probe.invalid`) to prevent dual-dispatch to real users during the transitional state (V-OBS1-2).
- **Cleanup:** The temporary `probe-seed` endpoint used for probe calibration was removed from `admin.ts` in commit `ad31453` immediately following the successful probe run.

## 4. Status

The F1-new implementation is now **LIVE** in production. The Thread-1 implementation scope is fully closed.
