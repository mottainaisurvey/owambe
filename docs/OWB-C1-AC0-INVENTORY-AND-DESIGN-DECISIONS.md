# OWB-C1-EXPERIENCES-OPERATOR-SCAFFOLD-01: Scaffolding Inventory & Design Decisions

**Author:** Thread-2 / Owambe Developer  
**Date:** July 11, 2026  

This document provides the supplementary AC-0 Scaffolding Inventory and the formal Design Decisions analysis for the C1 Experience Operator Scaffold implementation, as requested by the Owambe Coordinator.

---

## Part 1: AC-0 Scaffolding Inventory

Before any implementation commenced, a thorough inspection of the `staging` baseline (`f235b1d`) was conducted to document the exact state of the existing scaffolding. This ensured the implementation built upon existing foundations rather than duplicating effort.

### 1. Existing Role Model & Authentication Stack
- **`UserRole` Enum:** The `OPERATOR` value was found to already exist in the Prisma schema (`enum UserRole`), marked with a `Phase A: Experiences mode` comment.
- **`Operator` Profile Model:** A dedicated `Operator` model was found, containing a `userId` foreign key to the `User` model, along with fields for `businessName`, `isVerified`, and `isApproved`.
- **Authentication Route:** The `POST /api/auth/register` endpoint validated roles using Zod, but `OPERATOR` was missing from the allowed array (`['PLANNER', 'VENDOR', 'CONSUMER', 'HOST']`).
- **Auth Controller:** The `register` function had branches for `HOST`, `VENDOR`, etc., to create profiles and set mode hydration (`activeMode`, `availableModes`), but no branch existed for `OPERATOR`.

### 2. Existing Integration-Layer Models
- **`Experience` Model:** The core `Experience` model was fully scaffolded with essential fields (`name`, `slug`, `pricePerPerson`, `currency`, `operatorId`). Crucially, it already contained `isActive` and `isApproved` boolean flags.
- **`ExperienceSlot` Model:** A forward-compatible `ExperienceSlot` model was found, confirming that the schema was already prepared for C2 (Operator Capabilities) scheduling features.
- **`ExperienceBooking` Model:** The booking model was also present, linking consumers to slots and experiences.

### 3. Existing Routes & Placeholders
- **API Routes:** The `experiences.ts` and `experience-bookings.ts` router files existed. They contained endpoints protected by `requireRole('OPERATOR')` and `requireMode('EXPERIENCES')` middleware. The `POST /api/experiences` endpoint existed but lacked lifecycle state enforcement.
- **Web Navigation Shell:** The dashboard layout (`apps/web/src/app/dashboard/layout.tsx`) contained a fully defined `EXPERIENCES_NAV` array.
- **Web Pages:** The root `/dashboard/experiences` page existed as a "Coming Soon" placeholder, but the specific sub-pages (`/list`, `/new`, `/bookings`, `/slots`) were not yet created.

---

## Part 2: Design Decisions Document

### 1. Existing Role Model Analysis
**Explicit Finding:** The `OPERATOR` role **already existed** in the system prior to C1. 
**Evidence:** The Prisma schema at `f235b1d` contained `OPERATOR` in the `UserRole` enum and a fully defined `Operator` profile model. Therefore, C1 did not introduce the role to the database; C1 integrated the existing role into the authentication, registration, and hydration flows.

### 2. Options Considered for Lifecycle Management
When implementing the `DRAFT → APPROVED → PUBLISHED/UNPUBLISHED → ARCHIVED` lifecycle, two primary options were considered:

- **Option A: Introduce a `status` Enum.** Create a new `ExperienceStatus` enum (`DRAFT`, `PENDING`, `APPROVED`, `PUBLISHED`, `ARCHIVED`) and migrate the `Experience` model to use it.
- **Option B: Utilize Existing Boolean Flags.** Map the conceptual lifecycle states to combinations of the existing `isActive` and `isApproved` boolean flags.

### 3. Recommended Approach and Rationale
**Selected Approach:** Option B (Utilize Existing Boolean Flags).

**Rationale for Lifecycle-to-Boolean Mapping:**
The `e2ApprovalStateModel` architecture was already established in the codebase, using `isApproved` for platform authority. By leveraging this and `isActive` for operator authority, we achieved the full lifecycle without schema disruption.

The mapping is defined as follows:

| Conceptual State | `isActive` (Operator) | `isApproved` (Platform) | Visibility |
| :--- | :--- | :--- | :--- |
| **DRAFT** | `false` | `false` | Operator only |
| **APPROVED (Unpublished)** | `false` | `true` | Operator only |
| **PUBLISHED** | `true` | `true` | Public (Consumers) |
| **ARCHIVED** | `false` | `true` or `false` | Operator only (Soft-deleted) |

**Rationale for Archive Policy:**
Archiving is implemented as a soft-delete (`isActive = false`). A hard delete (`DELETE FROM experiences`) is not permitted to ensure financial, booking, and audit trails remain intact. Furthermore, a business rule enforces that an experience cannot be archived if it has active (future) bookings.

### 4. Migration Implications
Because Option B was selected, the migration footprint was minimal and purely additive. The `20260711000001_c1_experience_operator_scaffold` migration only:
1. Added the nullable `meetingDetails` field.
2. Altered the default value of `isActive` to `false` at the database level to ensure all new experiences begin in the `DRAFT` state.

Existing rows were unaffected, ensuring zero data loss or disruption to staging data.

### 5. Compatibility Implications (C2, C3, Phase D)
- **C2 (Operator Capabilities):** The scaffolding is perfectly forward-compatible. The `ExperienceSlot` model was left untouched and is ready for C2 scheduling logic. The `/dashboard/experiences/slots` UI was built to seamlessly integrate with C2 APIs.
- **C3 (Operator Financials):** The `Operator` profile model already contains Paystack sub-account fields (`paystackSubAccountCode`, etc.), ensuring C3 can build directly on the C1 authentication and profile foundation.
- **Phase D (Consumer Experiences):** The dual-boolean lifecycle mapping (`isActive=true` AND `isApproved=true`) is already the standard query filter for consumer-facing endpoints. Phase D consumers will only see fully published, platform-approved experiences without requiring any query logic changes. The new `meetingDetails` field is exposed in the schema for inclusion in downstream booking confirmation payloads.
