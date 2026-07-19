# OWB-C-UIFIX-02 — Closure Report (Thread-2)

## 1. Functional Dimension
Both target defects have been successfully remediated and verified in the staging environment.

*   **F-1 (D-1 Remediation):** The `meetingDetails` field was added to the `updatable` array in `PUT /api/experiences/:id` (`apps/api/src/routes/experiences.ts`, line 296). The `isActive`, `isApproved`, and `isFeatured` fields remain intentionally excluded from this allowlist, preserving the C1-b.0 lifecycle authority model.
*   **F-2 (D-5 Remediation):** The `numberOfGuests` reference was corrected to `guestCount` in the operator bookings surface (`apps/web/src/app/dashboard/experiences/bookings/page.tsx`, lines 14 and 190). The UI now correctly maps to the API payload, resolving the data-binding failure.

## 2. Architectural Dimension
*   **D-1 Lifecycle Preservation:** The one-line allowlist addition strictly addresses the missing `meetingDetails` field without altering the update perimeter. Lifecycle transitions (publish/unpublish) continue to flow through their dedicated `PATCH` endpoints.
*   **D-5 Data Binding:** The correction aligns the web client interface with the established API schema (`guestCount`), requiring no backend modifications and maintaining the existing data contract.

## 3. Verification Dimension
*   **Baseline:** Staging HEAD SHA `25a9797bfbe3b29b5f0a5e6928bd566a94d5a19c` (confirmed verbatim pre-change).
*   **D-1 Verification (Throwaway PUT):** Executed via API using the smoke operator credentials. `PUT /api/experiences/:id` with payload `{"meetingDetails": "UIFIX02-DIAG-THROWAWAY: ..."}` returned HTTP 200 (`success: true`). Subsequent `GET /api/experiences/mine` confirmed persistence of the updated value.
*   **D-5 Verification (Browser Smoke):** The operator bookings surface (`/dashboard/experiences/bookings`) was accessed via browser. The page rendered successfully without errors, and the guest count data (e.g., "1 guest") was visibly populated for all bookings.
*   **CI Regression:** Run `29680240245` completed successfully. API tests: 251/251 passed (including `c3ExperienceCustomerBooking` and `uiEnable01UIExposureConsolidation`). Web tests: 40/44 passed (the 4 failures in `CategoryVisibilityTab` are pre-existing, confirmed against prior run `29287130340`).
*   **Resumption Baseline Delta:** `a39090f` (fix commit).

## 4. Enablement Dimension
*   **Walkthrough Document:** `OWB-C3-INVARIANTS-AND-ENABLEMENT.md` has been updated. The D-1 and D-5 entries have been removed from the rough-edges register.
*   **Defect Register:** D-1 and D-5 are resolved and closed.

---
*Signed: Thread-2 (Owambe developer)*
