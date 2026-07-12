# OWB-UIENABLE-01 Closure Report

## 1. Cycle Overview
The `OWB-C-UIENABLE-01` consolidation cycle was executed to address seven distinct UI defects (BLOCK-1 through NB-4) discovered during the C3 staging walkthrough. These defects prevented a seamless end-to-end founder walkthrough of the Experience Operator and Consumer journeys.

This cycle strictly adhered to the Verify-First principle, capturing verbatim reproduction evidence before any code inspection or modification.

## 2. Defect Resolutions

| ID | Issue | Root Cause | Resolution |
| :--- | :--- | :--- | :--- |
| **UI-1** (BLOCK-1) | `OPERATOR` role missing from registration UI. | The `ROLES` array in the registration component did not include the `OPERATOR` enum value. | Added `OPERATOR` to the `ROLES` array and Zod validation schema in `apps/web/src/app/register/page.tsx`. |
| **UI-2** (BLOCK-2) | Misleading 403 copy on publish endpoint. | The publish endpoint returned "Submit for review first" instead of "Requires platform approval". | Updated the 403 error message in `apps/api/src/routes/experiences.ts` to accurately reflect the platform approval requirement. |
| **UI-3** (BLOCK-3) | Experiences list page intermittent hang. | Railway staging cold-start latency caused the loading skeleton to display indefinitely without feedback. | Implemented a loading timeout UX in `apps/web/src/app/dashboard/experiences/list/page.tsx` that displays a slow-load notice after 8 seconds. |
| **UI-4** (NB-2) | Day-mapping defect (Monday contamination). | The `byday` state in the slots form initialized to `['MO']`. Selecting another day appended to the array instead of replacing it. | Changed the initial state to `[]` and added validation to require at least one day for weekly patterns in `apps/web/src/app/dashboard/experiences/slots/page.tsx`. |
| **UI-5** (Security) | `isActive` settable via PUT payload. | The `isActive` field was included in the `allowedFields` array for the general `PUT` endpoint. | Removed `isActive` and `isFeatured` from the allowlist in `apps/api/src/routes/experiences.ts`, enforcing lifecycle transitions through dedicated endpoints. |
| **UI-6** (NB-3) | Capacity placeholder shows `undefined`. | The form referenced `experience.capacity`, but the `capacity` field does not exist on the `Experience` Prisma model. | Removed the stale reference and used a fixed default placeholder (`"e.g. 10"`) in the slots form. |
| **UI-7** (NB-4) | Noisy 403 toasts for consumers. | The dashboard layout attempts to fetch operator data, resulting in 403s for consumers. The global interceptor displayed toasts for all 403s. | Updated the response interceptor in `apps/web/src/lib/api.ts` to suppress 403 toasts specifically for the `CONSUMER` role. |

## 3. Four-Dimension Evidence

### Dimension 1: API Unit Test Coverage
- **Status:** PASSED (249/249 API tests, 6/6 UI-7 Web tests).
- **Additions:** A new test suite (`uiEnable01UIExposureConsolidation.test.ts`) was created to explicitly cover all seven defect resolutions, including comprehensive day-mapping tests for all seven days.
- **Regression:** The full C1, C2, and C3 regression suites passed without issue (after updating one C1 assertion to match the new UI-2 copy).

### Dimension 2: Verbatim Reproduction
- **Status:** COMPLETED.
- **Evidence:** Captured verbatim API responses and web form payloads for the UI-4 day-mapping defect and the UI-3 list hang before any code changes were made. Documented in `uienable01_investigations.md`.

### Dimension 3: CI Pipeline Verification
- **Status:** PASSED.
- **Run ID:** 29185450338
- **Commit:** `4d01135`
- **Jobs:** All jobs (Vocab Lint, Lint & Type Check, Run Tests, Build, Deploy API, Deploy Web) completed successfully.

### Dimension 4: Browser-Level Staging Smoke
- **Status:** COMPLETED.
- **Evidence:** Executed a full end-to-end walkthrough on the live Railway staging environment. Captured 13 screenshots confirming the resolution of all seven defects in the deployed application. Documented in `ac5_smoke_evidence.md`.

## 4. Deliverables
1.  **Code Changes:** Committed and pushed to `staging`.
2.  **UI Exposure Model:** Authored `OWB-UI-EXPOSURE-MODEL.md` detailing the structural integrity of the web-to-API boundaries.
3.  **Founder UX Walkthrough:** Updated `OWB-C3-INVARIANTS-AND-ENABLEMENT.md` to reflect the new UI-driven end-to-end flow.
4.  **Closure Report:** This document.

Signed: **Thread-2 / Owambe Developer**
