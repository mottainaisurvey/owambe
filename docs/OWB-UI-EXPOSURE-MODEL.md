# Owambe UI Exposure Model

## 1. Registration Role Exposure
The registration form exposes role selection directly to the user.
- **Roles Exposed:** `CONSUMER`, `ORGANIZER`, `VENDOR`, `OPERATOR`.
- **Validation:** Enforced via Zod schema (`z.enum(["CONSUMER", "ORGANIZER", "VENDOR", "OPERATOR"])`) on the client and strict enum validation on the API.
- **Default State:** No role is pre-selected.

## 2. Experience Lifecycle Exposure
The operator UI exposes state transitions, but actual state changes are strictly gated by the API.
- **Draft State:** Experiences are created as drafts (`isApproved: false`, `isActive: false`). The UI communicates this via a "Draft" badge and a toast notification indicating submission for review.
- **Approval Gate:** The "Publish" action is entirely hidden from the UI until `isApproved` is true. The card menu displays "Awaiting platform approval" instead.
- **Publish Action:** Once approved, the "Publish" button is exposed. This triggers a dedicated `PUT /api/experiences/:id/publish` endpoint.
- **API Integrity:** The general `PUT /api/experiences/:id` endpoint explicitly strips `isActive` and `isApproved` from the allowlist. Operators cannot bypass the approval gate by modifying the payload.

## 3. Recurring Slot Day-Mapping
The recurring slot form exposes day selection for weekly patterns.
- **Default State:** No days are pre-selected (`byday: []`).
- **Validation:** The form requires at least one day to be selected if the `WEEKLY` pattern is chosen.
- **API Integrity:** The API expands the `RRULE` using the provided `BYDAY` values. The form strictly sends only the user-selected days (e.g., `BYDAY=SA` for Saturday only).

## 4. Consumer Access Exposure
Consumers have restricted access to certain dashboard features.
- **Navigation:** Consumers can access their bookings but are restricted from operator-specific pages (e.g., creating experiences).
- **Error Handling:** When a consumer accesses a restricted route, the API returns a 403. The global API response interceptor suppresses the generic "Access restricted" toast for `CONSUMER` roles, preventing noisy errors during normal navigation (e.g., when the dashboard layout attempts to fetch operator data).
