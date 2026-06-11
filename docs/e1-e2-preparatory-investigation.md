# Workstream E Preparatory Investigation: Admin Dashboard Audit

**Date:** June 10, 2026
**Author:** Manus AI
**Branch:** `investigate/E-preparatory-investigation`

## Executive Summary

This report details the findings of a comprehensive audit of the Owambe Admin Dashboard at the staging environment (`https://owambe-web-staging.up.railway.app/admin`). The investigation was conducted to prepare for Workstream E (Admin Tooling for Cohort Operations), specifically focusing on identifying gaps in the current administrative capabilities required to support the Coastal Corridor cohort launch.

The audit covered the UI surface, API routes, authentication model, and underlying database schema. The primary finding is that while the platform has robust infrastructure for `EVENTS` mode, it currently lacks the necessary administrative interfaces and API endpoints to manage `STAYS` mode entities (Hosts and Properties) and cohort-specific operations.

## 1. Authentication and Session Model

The admin dashboard relies on a dual-token authentication system implemented via a shared Axios client and Zustand state management.

*   **Token Lifecycle:** The backend (`/api/auth/login`) issues a short-lived JWT access token (default 15 minutes) and a long-lived refresh token stored in an `httpOnly` cookie [1].
*   **Client-Side Handling:** The `api.ts` Axios client includes an interceptor that catches `401 Unauthorized` responses, automatically calls `/auth/refresh` using the cookie, updates the bearer token, and replays the failed request [2].
*   **Hydration Race Condition:** A race condition exists on the frontend where child components (like the Users tab) may fire React Query requests before the Zustand store has fully rehydrated the auth token into the Axios client, leading to initial `401` errors that are subsequently resolved by the interceptor [3].

## 2. Current Admin UI Surface

The staging Admin Dashboard currently features the following tabs:

| Tab Name | Functionality | Status / Observations |
| :--- | :--- | :--- |
| **Overview** | High-level platform statistics. | Functional. Displays `EVENTS` mode metrics (Total Events, Active Bookings, GMV) [4]. |
| **Vendor Queue** | Verification of pending vendors. | Functional. Allows approval/rejection of vendor profiles [5]. |
| **Users** | User management (suspend/reinstate). | Functional, but role filters are limited to `PLANNER`, `VENDOR`, `CONSUMER`, and `ADMIN`. Missing `HOST` and `OPERATOR` filters [6]. |
| **Disputes** | Dispute resolution. | Currently uses hardcoded mock data (`MOCK_DISPUTES`) [7]. |
| **Commission** | Commission rate management. | Currently uses hardcoded static data (`RATE_PRESETS`) [8]. |
| **Portals** | Tenant/White-label management. | Functional. Calls `/api/tenants` endpoints [9]. |
| **Contracts** | Contract overview. | Functional. Uses the planner's `/contracts` endpoint with an admin bypass to view all contracts [10]. |
| **Tags** | Vendor tag management. | **Broken.** Calls `/admin/vendors/tags` instead of the correct `/admin/tags` endpoint [11]. |
| **Categories** | Vendor category visibility. | Functional. Calls `/admin/categories/vendor` [12]. |
| **Interest Captures** | Cohort interest form submissions. | Functional. Allows filtering by source and CSV export [13]. |

## 3. Gap Analysis for Workstream E

The audit identified significant gaps between the current system state and the requirements for Workstream E.

### E1: Cohort Code Management (Missing UI)

*   **Backend:** The API already supports cohort code management via `POST /api/admin/cohort-codes` and `GET /api/admin/cohort-codes/:code` [14]. The `CohortCode` Prisma model is fully defined [15].
*   **Frontend:** There is **no UI surface** in the Admin Dashboard to create, view, or manage cohort codes.
*   **User Assignment:** The API supports assigning users to cohorts via `POST /api/admin/users/set-cohort-code` [16], but this is not exposed in the UI.

### E2: Host & Property Approval Workflow (Missing UI & API)

*   **Backend:** The `Host` and `Property` models exist in the schema [17]. However, there are **no admin API endpoints** for listing, reviewing, or approving Hosts or Properties. The existing `/api/properties` routes are designed for public search or host self-management [18].
*   **Frontend:** There are **no tabs or interfaces** in the Admin Dashboard for managing Hosts or Properties. The platform stats only reflect `EVENTS` mode data.
*   **Role Management:** The Users tab lacks filters for the `HOST` role, making it difficult to identify host accounts [19].

## 4. Recommendations for Implementation

Based on the findings, the following actions are recommended for Workstream E:

1.  **Fix Existing Bugs:** Correct the API endpoint URL in the Tags tab (`/admin/vendors/tags` -> `/admin/tags`).
2.  **Implement E1 (Cohort Management):**
    *   Create a new "Cohorts" tab in the Admin Dashboard.
    *   Build UI components to list existing cohort codes and create new ones, interfacing with the existing `/api/admin/cohort-codes` endpoints.
    *   Add functionality to the Users tab to assign cohort codes to specific users via `/api/admin/users/set-cohort-code`.
3.  **Implement E2 (Host/Property Approvals):**
    *   **API:** Develop new admin endpoints (e.g., `GET /api/admin/hosts/pending`, `PUT /api/admin/hosts/:id/verify`, `GET /api/admin/properties/pending`, `PUT /api/admin/properties/:id/approve`).
    *   **UI:** Create new "Host Queue" and "Property Queue" tabs (or a combined "Stays Verification" tab) in the Admin Dashboard to consume these new endpoints.
    *   **Users Tab:** Add `HOST` and `OPERATOR` to the role filter options in the Users tab.

## References

[1] `/home/ubuntu/owambe-git/apps/api/src/controllers/auth.controller.ts` (Lines 80-139)
[2] `/home/ubuntu/owambe-git/apps/web/src/lib/api.ts` (Lines 31-91)
[3] `/home/ubuntu/owambe-git/apps/web/src/app/admin/page.tsx` (Lines 20-50, 370-380)
[4] `/home/ubuntu/owambe-git/apps/api/src/routes/admin.ts` (Lines 12-45)
[5] `/home/ubuntu/owambe-git/apps/web/src/app/admin/page.tsx` (Lines 185-250)
[6] `/home/ubuntu/owambe-git/apps/web/src/app/admin/page.tsx` (Lines 386-395)
[7] `/home/ubuntu/owambe-git/apps/web/src/app/admin/page.tsx` (Lines 458-520)
[8] `/home/ubuntu/owambe-git/apps/web/src/app/admin/page.tsx` (Lines 526-605)
[9] `/home/ubuntu/owambe-git/apps/api/src/routes/tenants.ts` (Lines 224-260)
[10] `/home/ubuntu/owambe-git/apps/api/src/routes/contracts.ts` (Lines 31-75)
[11] `/home/ubuntu/owambe-git/apps/web/src/app/admin/page.tsx` (Lines 715-726)
[12] `/home/ubuntu/owambe-git/apps/web/src/app/admin/page.tsx` (Lines 811-820)
[13] `/home/ubuntu/owambe-git/apps/web/src/app/admin/page.tsx` (Lines 870-1000)
[14] `/home/ubuntu/owambe-git/apps/api/src/routes/admin.ts` (Lines 646-700)
[15] `/home/ubuntu/owambe-git/apps/api/prisma/schema.prisma` (Lines 779-845)
[16] `/home/ubuntu/owambe-git/apps/api/src/routes/admin.ts` (Lines 418-475)
[17] `/home/ubuntu/owambe-git/apps/api/prisma/schema.prisma` (Lines 467-540)
[18] `/home/ubuntu/owambe-git/apps/api/src/routes/properties.ts`
[19] `/home/ubuntu/owambe-git/apps/web/src/app/admin/page.tsx` (Lines 386-395)
