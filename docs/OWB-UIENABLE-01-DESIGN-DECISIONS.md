# OWB-UIENABLE-01 Design Decisions

**Document Context:** This document captures the architectural rationale behind the resolutions implemented during the `OWB-C-UIENABLE-01` UI consolidation cycle.

## 1. UI-5: Strict API Allowlist Enforcement

**Decision:** Removed `isActive` and `isFeatured` from the `PUT /api/experiences/:id` endpoint's `allowedFields` array.

**Rationale:** The `PUT` endpoint is designed for updating the content of a draft experience (e.g., title, description, price). State transitions (publishing, unpublishing) must be strictly controlled through dedicated lifecycle endpoints (`/publish`, `/unpublish`). Allowing operators to modify `isActive` via the general `PUT` payload would bypass the `isApproved` business logic gate, representing a critical security vulnerability. By restricting the allowlist, we enforce structural integrity at the API boundary, regardless of the client-side implementation.

## 2. UI-4: Day-Mapping Initialization and Validation

**Decision:** Initialized the `byday` array to `[]` instead of `['MO']` in the recurring slots form, and added explicit validation requiring at least one day selection for the `WEEKLY` recurrence pattern.

**Rationale:** The previous default state (`['MO']`) caused silent data contamination. If a user clicked "Saturday", the state became `['MO', 'SA']`, generating an alternating RRULE pattern. By defaulting to an empty array, we force explicit user intent. The added validation ensures that the API receives a structurally valid RRULE string (e.g., `FREQ=WEEKLY;BYDAY=SA`), maintaining calendar correctness.

## 3. UI-7: Role-Based Interceptor Suppression

**Decision:** Modified the global Axios response interceptor (`api.ts`) to suppress the "Access restricted" (403) toast notification specifically for users with the `CONSUMER` role.

**Rationale:** The dashboard layout (`layout.tsx`) eagerly attempts to fetch operator-specific data (e.g., `/api/experiences/mine`) regardless of the user's role. For a `CONSUMER`, this correctly returns a 403 Forbidden. However, surfacing this error as a global toast creates a noisy, broken UX for legitimate consumer navigation. Rather than refactoring the entire dashboard data-fetching architecture (which would exceed the scope of UI consolidation), suppressing the toast for the `CONSUMER` role at the interceptor level provides a surgical, low-risk resolution that immediately improves the user experience.

---
*Signed: Thread-2*
