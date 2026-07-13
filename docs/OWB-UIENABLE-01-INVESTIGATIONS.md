# OWB-UIENABLE-01 Investigations

**Document Context:** This document preserves the raw investigation notes and verbatim evidence captured during the AC-0 and AC-1 phases of the `OWB-C-UIENABLE-01` cycle, prior to any code modifications.

## 1. UI-3: List Hang (BLOCK-3) Investigation

**Observation:** Navigating to `/dashboard/experiences/list` on the staging environment intermittently resulted in an indefinite loading skeleton.

**Root Cause Analysis:**
- The list page relies on `api.get('/api/experiences/mine')`.
- The Railway staging environment experiences cold-start latency when waking the API service from hibernation.
- The Axios client in `api.ts` has a default timeout of 30 seconds.
- The React component lacked a timeout or error boundary for the loading state. It simply rendered the skeleton while `isLoading` was true. If the request timed out or hung, the skeleton remained indefinitely.
- **Conclusion:** This is a UX feedback issue related to environment latency, not an architectural defect in the API or data fetching logic.

**Resolution:** Implemented a `setTimeout` in the list page component that displays a slow-load notice ("Taking longer than usual...") if the data fetch exceeds 3 seconds, providing user feedback during cold starts.

## 2. UI-4: Day-Mapping (NB-2) Investigation

**Observation:** Creating a weekly recurring slot for "Saturday" resulted in slots alternating between Monday and Saturday.

**Verbatim Reproduction Evidence:**
- **Form Input:** Selected `WEEKLY`, clicked "Saturday".
- **API Payload Sent:** `rruleString: "FREQ=WEEKLY;BYDAY=MO,SA"`
- **API Expansion Logic:** The API correctly expanded the provided RRULE using the `rrule` library, generating instances for both Monday and Saturday.
- **Component State:** The `byday` state in `slots/page.tsx` was initialized as `['MO']`. Clicking "Saturday" appended `'SA'` to the array without removing the default `'MO'`.

**Conclusion:** The defect was entirely isolated to the web form's state initialization. The API's RRULE expansion logic was calendar-correct.

**Resolution:** Changed the initial state of `byday` to `[]` and added validation to ensure at least one day is selected for weekly patterns.

---
*Signed: Thread-2*
