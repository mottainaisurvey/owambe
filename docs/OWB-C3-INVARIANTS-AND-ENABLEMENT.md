# OWB-C3-INVARIANTS-AND-ENABLEMENT

**Document Context:** This document details the end-to-end execution path for the Founder UX Walkthrough, encompassing the Experience Operator journey and the Consumer booking journey. It has been updated following the `OWB-C-UIENABLE-01` cycle to reflect that the entire flow can now be executed via the web UI.

## 1. Environment Prerequisites

- **Environment:** Railway Staging (`owambe-web-staging.up.railway.app`)
- **Data Seed:** The T1 staging seed must be executed to provision the `ADMIN` account required for experience approval.

## 2. The Experience Operator Journey

1. **Registration:** Navigate to `/register` and select the `OPERATOR` role. Complete the registration form.
2. **Login & Dashboard:** Log in with the newly created operator credentials. The user will be routed to the dashboard in `EXPERIENCES` mode.
3. **Creation:** Navigate to "Add Experience" (`/dashboard/experiences/new`). Fill out the required fields (title, description, price, duration, location, etc.) and click "Save as Draft".
   - *Note:* The experience is created with `isApproved: false` and `isActive: false`. The creation toast correctly states: "Saved as draft. Platform approval is required before publishing."
4. **Slot Management:** Navigate to "Manage Slots" for the newly created experience. Create a recurring slot series (e.g., Weekly on Saturdays).
5. **Admin Approval (Out-of-Band):** An administrator must log in (or use the API) to set `isApproved: true` for the new experience.
6. **Publication:** Once approved, the operator navigates to "My Experiences" (`/dashboard/experiences/list`). The "Publish" option will now be available in the experience card's dropdown menu. Click "Publish" to set `isActive: true`.

## 3. The Consumer Booking Journey

1. **Discovery:** Navigate to the public experiences listing (`/experiences`). The newly published experience will be visible.
2. **Selection:** Click on the experience to view details and available slots.
3. **Booking Initiation:** Select a slot (e.g., a Saturday instance) and click "Book & Pay".
4. **Authentication:** If not logged in, the user will be prompted to register or log in as a `CONSUMER`.
5. **Payment Handoff:** Upon confirming the booking, the system creates a pending reservation and attempts to initialize the payment gateway.
   - *Staging Note:* As payment keys are not seeded in staging, the system gracefully falls back with the message: "Booking Created — payment could not be initialised automatically." This represents the successful completion of the booking boundary.

---
*Signed: Thread-2*
