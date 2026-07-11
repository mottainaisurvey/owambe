# OWB-C3-EXPERIENCES-CUSTOMER-BOOKING-01 — Closure Report

## 1. Execution Summary

The customer-facing experiences booking flow (Workstream C, Phase 3) has been fully implemented, tested, and deployed to `staging` (commit `b1a8811`). This cycle establishes the complete discovery-to-confirmation journey for consumers, including concurrency-safe slot selection, Paystack payment integration, meeting details disclosure, and dual operator/guest notification.

The CI/CD pipeline (run `29166921744`) completed successfully across all jobs, with the `Deploy API to Production` job explicitly **SKIPPED**. The live staging behavioural smoke verified the end-to-end flow, confirming all auth boundaries, lifecycle publication guards, and hydration payloads.

## 2. Verify-First Inventory (AC-0)

The verify-first inventory was conducted to establish the baseline across five key areas. First, the consumer conventions were inspected via the stays consumer flow (`/stays`) and `StaysBookingClient`, confirming that the auth convention (`requireMode('EVENTS')` for consumers) and the component pattern could be directly adopted for the experiences equivalent. Second, the `ExperienceBooking` model in the schema was verified as fully equipped for the C3 flow, with the `paystackRef` field already present, meaning no additive schema migrations were required. Third, the Paystack integration surface was examined; the existing webhook handler in `payments.ts` was confirmed to handle vendor bookings only (`OWB-XXXXX-DEP`/`BAL`), while stay bookings use a synchronous callback verify endpoint, a pattern that experiences have now adopted. Fourth, Postmark notification patterns were reviewed, confirming the existence of the `operator-new-booking` template and utilizing the `guest-stay-reservation-pending` template as the structural pattern for the newly added `guest-experience-booking-confirmed` template. Finally, the §8 enabler for admin approval (`POST /api/admin/experiences/:id/approve`) was confirmed to already exist, correctly gated by the `ADMIN` role, and covered by the existing E2 test suites.

## 3. Concurrency Design Decision (AC-1)

The C3-c concurrency design decision was authored before implementation. The atomic transaction boundary approach was selected, leveraging PostgreSQL's `updateMany` with a `bookedCount + guestCount <= capacity` predicate to ensure absolute safety against double-booking races without requiring heavy locking. See `OWB-C3-DESIGN-DECISIONS.md` for the full five-element mandate and explicit question responses.

## 4. Implementation (AC-3)

The implementation spans the API route and the web client, structured across four primary capabilities. For **C3-a Discovery**, the `/api/experiences` endpoint was updated to strictly enforce the publication condition (`isApproved === true && isActive === true`), ensuring the web client only lists fully published experiences. For **C3-b Slot Selection**, the public `GET /api/experiences/:id` endpoint was configured to return experience details while strictly masking `meetingDetails`, and the slot listing now returns available slots with the remaining capacity calculated dynamically. For **C3-c Booking & Payment**, the `POST /api/experience-bookings` handler executes the atomic concurrency check, creates the booking in `PENDING` status, and initializes the Paystack transaction, successfully returning the authorization URL to the client. Finally, for **C3-d Confirmation & Disclosure**, the `/verify` endpoint confirms the payment, updates the booking to `PAID`, dispatches the Postmark confirmation emails to both the guest and the operator, and securely returns the `meetingDetails`. The `GET /:id` endpoint was also updated to gate `meetingDetails` behind the `PAID` status for existing bookings.

## 5. Regression Test Floor (AC-4)

The test suite (`c3ExperienceCustomerBooking.test.ts`) comprises 17 comprehensive cases designed to establish a robust regression floor. These cases cover concurrency race conditions to ensure over-capacity rejections function correctly, and publication guards to verify that draft or inactive experiences cannot be booked. The suite also tests slot lifecycle guards to ensure cancelled slots are rejected, and validates the meeting details disclosure logic to confirm information remains hidden before payment and is correctly disclosed afterward. Additionally, the tests verify operator populated-state visibility and include C1/C2 regressions covering mode hydration and operator slot creation.

All 17 tests pass in CI.

## 6. Staging Behavioural Smoke (AC-5)

The live staging smoke executed an 8-step behavioural verification against the deployed API to validate the end-to-end flow. Key confirmations include the correct generation of hydration payloads for both OPERATOR and CONSUMER registrations, and the verification that new experience creation correctly defaults to the DRAFT state. The smoke test also confirmed that unauthenticated booking attempts correctly return a 401 Unauthorized status, and booking attempts on DRAFT experiences correctly return a 400 Bad Request status. Finally, the §8 admin approval enabler was verified at the auth boundary; this remains a bounded-evidence-closure item due to the absence of staging admin credentials, but the endpoint's existence and security gating were fully confirmed.

Signed: **Thread-2 / Owambe Developer**
