# OWB-C-GUEST-CHECKOUT-01 (Rev 3) Closure Report

## 1. Overview
This document serves as the formal closure report for the `OWB-C-GUEST-CHECKOUT-01` cycle. The objective was to implement the guest checkout flow for experience bookings, including the post-purchase account creation flow, and to deliver the corresponding bilateral contract revision (Amendment 009 Rev 4).

All Acceptance Criteria (AC-0 through AC-4) have been fully delivered and verified on the `staging` environment.

## 2. Delivered Scope

### AC-1: Implementation
- **G-1 (Schema):** `ExperienceBooking.guestUserId` was already nullable at the baseline. The `GuestClaimToken` model was added to the Prisma schema to support the G-5 claim flow, and the corresponding migration was generated.
- **G-2 (Guest API):** The `POST /api/experience-bookings` endpoint was refactored to use `authenticateOptional`. It now accepts `guestName`, `guestEmail`, and `guestPhone` in the payload. Unauthenticated requests are validated for guest fields and process the booking with a `null` user ID, recording the guest PII directly on the booking record.
- **G-3 (Idempotency):** Deduplication was implemented on the booking creation endpoint using the `Idempotency-Key` header and the Redis cache service. Duplicate requests within the TTL return the cached booking response.
- **G-4(i) (Continuity):** The web app's `ExperiencesBookingClient` was updated to preserve `?exp=<id>&slot=<id>` URL parameters across the login redirect. Upon successful login, the user is returned to the booking form with their selected slot pre-selected.
- **G-4(ii) (Public Retrieval):** A new `GET /api/experience-bookings/public/:reference` endpoint was implemented. It returns booking details without requiring authentication, but strictly redacts all PII (guest name, email, phone) to prevent enumeration attacks.
- **G-5 (Post-Purchase Account):** The `POST /api/auth/claim-guest-booking` endpoint was implemented. It accepts a `bookingId` and `email`, validates them against the booking record, generates a secure `GuestClaimToken`, and dispatches an email (via `EMAIL_CAPTURE_MODE` on staging) containing the magic link.

### AC-2: G-7 Test Suite
The `gco01GuestCheckout.test.ts` suite was authored and successfully executed. It covers:
- Guest booking creation (201 Created).
- PII gating on the public retrieval endpoint (guest fields are `null` in the response).
- The claim flow initiation (token generation and email dispatch).
- Idempotency (duplicate requests return the identical cached response).
- Regression coverage for authenticated bookings (ensuring the `userId` is correctly populated when a token is present).

All 18 API test suites (280/280 tests) pass in the CI pipeline.

### AC-3: Browser Smoke (FPRW Journey)
A full guest-first First-Person-Render-Walkthrough (FPRW) was conducted on the staging environment:
1. Navigated to the experiences catalogue.
2. Selected the seeded `GCO01 Smoke Experience` and an available slot.
3. Filled the guest checkout form (`GCO01 Smoke Guest`, `gco01-smoke-guest@smoke.owambe.test`, `+2348000000001`).
4. Clicked "Book & Pay".
5. Verified the booking creation confirmation surface (Paystack fallback).
6. Verified the booking record via the admin API, confirming `guestUserId: null` and the guest PII was correctly stored.

*Evidence screenshots and API JSON responses are attached to the delivery bundle.*

### AC-4: Documentation & Closure
- The CI job table confirming a clean build and staging deploy has been captured.
- The `OWB-C3-INVARIANTS-AND-ENABLEMENT.md` document has been updated to include the guest path in the Consumer Booking Journey.
- This four-dimension closure report has been authored.

## 3. Bilateral Contract Revision (G-6)
The `BILATERAL-AMENDMENT-009-REV4-GUEST-USER-ID.md` document was authored and committed to the repository (`bfed5f3`), formalising the agreement that `guestUserId` remains nullable to support the guest checkout flow.

## 4. CI Evidence
Run ID: `30156652793`
Commit: `d194d51` (HEAD)

```text
✓ staging Owambe CI/CD · 30156652793
Triggered via push about 18 minutes ago
JOBS
✓ Lint & Type Check in 1m50s
✓ Vocabulary Lint (Advisory) in 10s
✓ Run Tests in 2m18s
✓ Build in 2m22s
✓ Deploy API to Staging (Railway) in 1m27s
✓ Deploy Web to Staging (Railway) in 3m1s
- Deploy API to Production (Railway) (SKIPPED)
```

*Signed: Thread-2 — GCO01 Closure 2026-07-25*
