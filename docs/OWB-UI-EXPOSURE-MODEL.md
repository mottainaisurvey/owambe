# OWB-UI-EXPOSURE-MODEL

**Document Context:** This document maps the web-tier components to the API-tier endpoints they consume for the `EXPERIENCES` domain, following the completion of the `OWB-C-UIENABLE-01` consolidation cycle. It serves as the structural contract between the frontend and backend boundaries.

## 1. Discovery & Public Access (Consumer Facing)

The public-facing components accessed by unauthenticated users or users with the `CONSUMER` role.

| Web Component Path | Target API Endpoint | Method | Role Boundary | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/app/experiences/page.tsx` | `/api/experiences` | `GET` | Public | Fetches all active and approved experiences for the discovery listing. |
| `/app/experiences/[id]/page.tsx` | `/api/experiences/:id` | `GET` | Public | Fetches the full details of a single published experience. |
| `/app/experiences/[id]/page.tsx` | `/api/experiences/:id/slots` | `GET` | Public | Fetches available scheduling slots for a specific experience. |

## 2. Operator Dashboard & Lifecycle Management

The restricted components accessed exclusively by users with the `OPERATOR` role.

| Web Component Path | Target API Endpoint | Method | Role Boundary | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/app/dashboard/experiences/list/page.tsx` | `/api/experiences/mine` | `GET` | `OPERATOR` | Fetches all experiences owned by the authenticated operator, regardless of publication status. |
| `/app/dashboard/experiences/new/page.tsx` | `/api/experiences` | `POST` | `OPERATOR` | Creates a new experience in draft state (`isApproved: false`, `isActive: false`). |
| `/app/dashboard/experiences/new/page.tsx` | `/api/experiences/:id` | `PUT` | `OPERATOR` | Updates draft experience details. (`isActive` and `isFeatured` are stripped from the payload by the API allowlist). |
| `/app/dashboard/experiences/list/page.tsx` | `/api/experiences/:id/publish` | `POST` | `OPERATOR` | Transitions an approved experience to published state (`isActive: true`). Will 403 if `isApproved` is false. |
| `/app/dashboard/experiences/list/page.tsx` | `/api/experiences/:id/unpublish` | `POST` | `OPERATOR` | Transitions a published experience back to draft state (`isActive: false`). |

## 3. Scheduling & Slots Management

The restricted components for managing availability, accessed by the `OPERATOR` role.

| Web Component Path | Target API Endpoint | Method | Role Boundary | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/app/dashboard/experiences/slots/page.tsx` | `/api/experiences/:id/slots` | `GET` | `OPERATOR` | Fetches all scheduling slots configured for the operator's experience. |
| `/app/dashboard/experiences/slots/page.tsx` | `/api/experiences/:id/slots` | `POST` | `OPERATOR` | Creates new slots (one-off or recurring series via RRULE). |
| `/app/dashboard/experiences/slots/page.tsx` | `/api/experiences/:id/slots/:slotId` | `DELETE` | `OPERATOR` | Deletes a specific scheduling slot. |

## 4. Booking & Transaction Execution

The components responsible for securing inventory and initiating payment.

| Web Component Path | Target API Endpoint | Method | Role Boundary | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/app/experiences/[id]/book/page.tsx` | `/api/experiences/:id/slots/:slotId/book` | `POST` | Authenticated | Creates a pending booking reservation for the selected slot and initiates the payment handoff sequence. |

---
*Signed: Thread-2*
