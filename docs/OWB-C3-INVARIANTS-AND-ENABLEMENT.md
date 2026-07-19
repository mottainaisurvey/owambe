# OWB-C3-INVARIANTS-AND-ENABLEMENT

**Document Context:** This document details the end-to-end execution path for the Founder UX Walkthrough, encompassing the Experience Operator journey and the Consumer booking journey. It has been updated following the `OWB-C-UIENABLE-01` cycle to reflect that the entire flow can now be executed via the web UI. Updated again following `OWB-C-PREWALK-01` to record paid and PENDING walkthrough entry states, remove the Paystack fallback rough-edge, and add D-5 to the rough-edges register.

## 1. Environment Prerequisites

- **Environment:** Railway Staging (`owambe-web-staging.up.railway.app`)
- **Data Seed:** The T1 staging seed must be executed to provision the `ADMIN` account required for experience approval.

## 2. The Experience Operator Journey

1. **Registration:** Navigate to `/register` and select the `OPERATOR` role. Complete the registration form.
2. **Login & Dashboard:** Log in with the newly created operator credentials. The user will be routed to the dashboard in `EXPERIENCES` mode.
3. **Creation:** Navigate to "Add Experience" (`/dashboard/experiences/new`). Fill out the required fields (title, description, price, duration, location, etc.) and click "Save as Draft".
   - *Note:* The experience is created with `isApproved: false` and `isActive: false`. The creation toast correctly states: "Saved as draft. Platform approval is required before publishing."
4. **Slot Management:** Navigate to "Manage Slots" for the newly created experience. Create a recurring slot series (e.g., Weekly on Saturdays).
5. **Admin Approval (Out-of-Band):** An administrator must log in to the admin panel (`/admin`) and approve the experience. The admin panel provides a UI control that calls `POST /api/admin/experiences/:id/approve`, setting `isApproved: true`. Alternatively, the API endpoint may be called directly with an `ADMIN`-role JWT.

   > **Walkthrough correction (M-4 reconciliation 2026-07-13):** The prior version of this step stated only "log in (or use the API)" without referencing the admin UI path. The `/admin` page has been available since the E2 implementation cycle and is the preferred method for the Founder UX Walkthrough.
6. **Publication:** Once approved, the operator navigates to "My Experiences" (`/dashboard/experiences/list`). The "Publish" option will now be available in the experience card's dropdown menu. Click "Publish" to set `isActive: true`.

## 3. The Consumer Booking Journey

1. **Discovery:** Navigate to the public experiences listing (`/experiences`). The newly published experience will be visible.
2. **Selection:** Click on the experience to view details and available slots.
3. **Booking Initiation:** Select a slot (e.g., a Saturday instance) and click "Book & Pay".
4. **Authentication:** If not logged in, the user will be prompted to register or log in as a `CONSUMER`.
5. **Payment Handoff:** Upon confirming the booking, the system creates a pending reservation and initialises the Paystack payment handoff. The consumer is redirected to the Paystack checkout page to complete payment.
6. **Confirmation:** After successful payment, the consumer is redirected back to the Owambe web app. The confirmation surface displays the booking details including the `meetingDetails` field, which is disclosed only upon successful payment.

## 4. Walkthrough Entry States (PREWALK-01 Fixtures)

The following fixture bookings were created during the PREWALK-01 verification sequence and remain on the staging environment as walkthrough entry states:

| Fixture | Booking ID | Reference | Status | meetingDetails |
| :--- | :--- | :--- | :--- | :--- |
| **Paid fixture** | `b5cc1c52-76cd-435f-82c7-4772b349cb13` | `EXP-1783967267574-OMP6M8` | CONFIRMED / PAID | Disclosed |
| **PENDING fixture** | `aab59f36-8d05-4d7e-8bb5-475885522ccf` | `EXP-1783974211804-7J6HY5` | PENDING | Withheld (null) |

Both bookings are against the PREWALK Verification Lagos Lekki Tour (`f035ea66-e014-43b3-8a1a-80dbb87b28b8`), slot `1539c4a4` (2026-07-25 09:00–12:00 UTC), consumer `prewalk-verify-consumer@test.owambe.com`.

## 5. Out-of-Scope Statement

The guest cancellation and refund journey is explicitly out of scope for this walkthrough. While the underlying booking data model supports cancellation states and refund tracking, the end-to-end UI flows for consumer-initiated cancellations and operator-initiated refunds are not yet fully enabled or validated for the Founder UX Walkthrough.

## 6. Rough-Edges Register

Walkthrough participants will encounter the following known, non-blocking imperfections. These are expected behaviors in the current staging environment and do not represent architectural defects:

1. **Staging Cold-Start Latency:** The Railway staging environment hibernates the API container when idle. The first request to the dashboard (e.g., `/api/experiences/mine`) may take 15–25 seconds while the container wakes up. An 8-second slow-load notice ("Taking longer than usual...") will appear to provide feedback during this delay.
2. **UTC Slot-Time Display:** Slot times are currently rendered in UTC across the dashboard and booking interfaces. Local timezone conversion is not yet implemented in the presentation layer.

---
*Signed: Thread-2 — Walkthrough Enablement Completion 2026-07-13; updated PREWALK-01 2026-07-13*
