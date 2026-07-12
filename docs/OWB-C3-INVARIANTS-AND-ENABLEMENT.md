# OWB-C3 Invariants & Enablement Notes

## 1. C3 Architectural Invariants

The following invariants are established by the C3 concurrency design decision and must be inherited by downstream cycles without architectural reinterpretation:

| Invariant | Definition |
| :--- | :--- |
| **Atomic Allocation** | Capacity reservation occurs exactly at the moment of booking creation via an atomic `updateMany` predicate (`bookedCount + guestCount <= capacity`). No separate "hold" state exists. |
| **Optimistic Concurrency** | The system does not lock rows for reading. If the atomic allocation fails, the transaction aborts and returns `409 Conflict`. |
| **Payment Timeout** | A booking remains in `PENDING` status until verified. If payment is not completed, the capacity remains allocated. A background sweep (or manual operator action) is required to release unpaid seats. |
| **Disclosure Gate** | `meetingDetails` is strictly guarded. It is never returned to consumers unless the booking `paymentStatus` is exactly `PAID`. |

## 2. Phase D Enablement (Consumer Integration)

The Coastal Corridor consumer workstream (Phase D) will integrate with the Experiences API. The following wire shapes and auth contexts are established:

### Authentication Context
Consumers must authenticate using the standard `/api/auth/login` endpoint. The hydration payload will return `activeMode: EVENTS` and `availableModes: ["EVENTS"]`. The C3 API routes do not require `EXPERIENCES` mode for consumers; standard `CONSUMER` role authentication is sufficient.

### Wire Shape 1: Experience Discovery (`GET /api/experiences`)
Returns a paginated list of published experiences.
*   **Condition:** Only returns rows where `isApproved === true` and `isActive === true`.
*   **Masking:** `meetingDetails` is never included in this response.

### Wire Shape 2: Slot Selection (`GET /api/experience-slots/:experienceId`)
Returns the list of available slots for a specific experience.
*   **Condition:** Returns all active slots (`isActive === true`) for the experience.
*   **Capacity:** The client must calculate remaining capacity as `capacity - bookedCount`.

### Wire Shape 3: Booking & Payment Init (`POST /api/experience-bookings`)
Creates the booking and returns the Paystack authorization URL.
*   **Payload:** `{ experienceId, slotId, guestCount }`
*   **Response:** `{ success: true, data: { booking: {...}, authorizationUrl: "https://checkout.paystack.com/..." } }`
*   **Concurrency:** Will return `409 Conflict` if the requested `guestCount` exceeds the remaining capacity at the exact moment of execution.

## 3. Founder UX Walkthrough Enablement

*(Updated post UIENABLE-01 consolidation cycle)*

The following dual-journey scripts are provided for the Founder UX Walkthrough, detailing the exact entry states and steps required to demonstrate the end-to-end flow entirely through the user interface, without requiring API interventions.

### Journey 1: Operator Setup & Publication
1.  **Entry State:** Operator selects the `OPERATOR` role on the web registration form and completes sign-up. Hydration sets mode to `EXPERIENCES`.
2.  **Action:** Navigate to `Dashboard > Experiences > Add New`.
3.  **Execution:** Fill the form, including `meetingDetails`. Submit. The experience is created in `DRAFT` state and is submitted for platform review.
4.  **Action:** Navigate to `Manage Slots`. Select a specific day (e.g., Saturday) under the Recurring tab. Submit to create recurring slots.
5.  **Action:** (Admin Intervention) Log in as an Admin and navigate to the admin approval queue to approve the experience.
6.  **Action:** Operator navigates to the Experiences list. The card menu now displays the "Publish" button. Click "Publish". The experience is now live.

### Journey 2: Consumer Booking & Confirmation
1.  **Entry State:** Consumer logs in.
2.  **Action:** Navigate to the public Experiences listing. The published experience is visible.
3.  **Execution:** Click the experience. The detail page loads. Select a slot and guest count. Click "Book".
4.  **Action:** The system creates the booking and redirects to Paystack.
5.  **Execution:** Complete the test payment. Paystack redirects back to the verify URL.
6.  **Action:** The system verifies the payment, updates the booking to `PAID`, and displays the confirmation page.
7.  **Confirmation:** The `meetingDetails` are now visible on the confirmation page. Postmark emails are dispatched to both the guest and the operator.

Signed: **Thread-2 / Owambe Developer**
