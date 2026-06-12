# Workstream E2 Investigation Report: Host & Property Approval Workflow

**Date:** 2026-06-11
**Author:** Manus AI
**Status:** Investigation Complete

## 1. Executive Summary

This report details the findings of the E2 investigation cycle, focusing on the backend schema, existing API endpoints, and UI patterns required to build the Host and Property approval workflow for the Owambe admin dashboard. The investigation confirms that the underlying schema models (`Host` and `Property`) are fully defined and populated by the registration flow, but the admin API endpoints and UI surfaces for reviewing and approving these entities are entirely missing.

## 2. Schema Analysis

The schema already contains the necessary fields to support an approval workflow.

### 2.1 Host Model
The `Host` model [1] tracks verification status using two fields:
- `isVerified` (Boolean, defaults to `false`)
- `verifiedAt` (DateTime, nullable)

When a user registers as a `HOST`, the `auth.controller.ts` creates a `Host` record with `isVerified: false` [2].

### 2.2 Property Model
The `Property` model [3] tracks its status using the `isActive` field:
- `isActive` (Boolean, defaults to `true`)

*Note:* Unlike `Host`, `Property` does not have an explicit `isApproved` or `isVerified` field. The current implementation relies on `isActive` to determine if a property is visible/bookable. For the approval workflow, we will need to either add an `isApproved` field or use `isActive` as the proxy for approval (defaulting new properties to `false` until approved). Given the ACs, adding an explicit `isApproved` field is the safer and more explicit path.

## 3. API Endpoint Gap Analysis

A comprehensive search of the `admin.ts` routes [4] and other route files confirms that there are **zero** existing admin endpoints for managing Hosts or Properties.

To satisfy the E2 Acceptance Criteria, the following endpoints must be built in `apps/api/src/routes/admin.ts`:

1.  **`GET /api/admin/hosts/pending`**: Fetch all `Host` records where `isVerified === false`, including their associated `User` data (email, name) and `Property` count.
2.  **`PUT /api/admin/hosts/:id/verify`**: Update a `Host` record to set `isVerified = true` and `verifiedAt = new Date()`. This endpoint must also trigger an email notification to the host.
3.  **`PUT /api/admin/hosts/:id/reject`**: Update a `Host` record (potentially adding a `rejectionReason` field or just leaving it unverified) and trigger a rejection email.
4.  **`GET /api/admin/properties/pending`**: Fetch all `Property` records that require approval, including their associated `Host` and `Room` data.
5.  **`PUT /api/admin/properties/:id/approve`**: Update a `Property` record to mark it as approved and trigger an email notification.
6.  **`PUT /api/admin/properties/:id/reject`**: Reject a property and trigger an email notification.

## 4. UI Pattern Analysis

The admin dashboard currently has a `VendorQueueTab` [5] that serves as the perfect template for the new Host and Property approval queues.

### 4.1 VendorQueueTab Pattern
The `VendorQueueTab` uses a split-pane layout:
- **Left Pane:** A table listing pending vendors.
- **Right Pane:** A detail view of the selected vendor, showing comprehensive information (category, city, pricing, bank connection status, description).
- **Actions:** "Verify & Go Live" and "Reject" buttons in the detail pane, with inline reject reason inputs in the table rows.

### 4.2 Recommended E2 UI Design
Based on the investigation, the recommended approach is to build **two separate tabs**:
1.  **Host Queue:** Modeled directly after `VendorQueueTab`, focusing on the `Host` entity (business name, user email, bank connection status).
2.  **Property Queue:** Modeled after `VendorQueueTab`, focusing on the `Property` entity (name, type, location, amenities, associated host).

While a single "Stays Verification" tab is possible, separating them aligns better with the distinct entity models and allows for clearer, more focused review processes.

## 5. Email Notification Infrastructure

The `email.service.ts` [6] handles outbound notifications. The investigation revealed that the required templates for E2 do not currently exist.

**Existing Templates:**
- `vendor-verified`
- `vendor-rejected`

**Missing Templates (To be created):**
- `host-verified`
- `host-rejected`
- `property-approved`
- `property-rejected`

The implementation phase must add these templates to the `templates` dictionary in `email.service.ts` and ensure the new admin endpoints call `sendEmail` with the correct template and data payload.

## 6. Conclusion and Next Steps

The E2 investigation confirms that the foundational schema is ready, but the entire admin layer (API and UI) for Host and Property approvals must be built from scratch. The implementation should follow the established patterns of the `VendorQueueTab` and the vendor verification endpoints.

**Next Step:** Proceed with the E2 implementation cycle, building the endpoints, UI tabs, and email templates as specified in this report.

---
### References
[1] `apps/api/prisma/schema.prisma` (Lines 467-495)
[2] `apps/api/src/controllers/auth.controller.ts` (Lines 57-58)
[3] `apps/api/prisma/schema.prisma` (Lines 496-540)
[4] `apps/api/src/routes/admin.ts`
[5] `apps/web/src/app/admin/page.tsx` (Lines 188-370)
[6] `apps/api/src/services/email.service.ts`
