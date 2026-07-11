# OWB-C1-EXPERIENCES-OPERATOR-SCAFFOLD-01: Supplementary Evidence

**Author:** Thread-2 / Owambe Developer  
**Date:** July 11, 2026  

This document provides the supplementary AC-5 Verification Evidence, Registration Entry Point Evidence, and Phase D Enablement Notes for the C1 Experience Operator Scaffold implementation.

---

## Part 1: AC-5 Verification Evidence

A live evidence collection script (`c1_staging_evidence.py`) was executed against the staging environment (`owambe-api-staging.up.railway.app`) after the C1 deployment. The raw JSON output is preserved in `c1_staging_evidence.json`. The following summarizes the verified outcomes.

### 1. Verification Results

The live evidence collection script successfully executed all required scenarios against the staging API. The following table summarizes the verified outcomes for each functional requirement.

| Verification Scenario | API Action | Result | Evidence & Notes |
| :--- | :--- | :--- | :--- |
| Registration & Hydration | `POST /api/auth/register` (Role: OPERATOR)<br>`POST /api/auth/login` | `HTTP 201`<br>`HTTP 200` | Operator profile created successfully. Login response confirmed `activeMode: "EXPERIENCES"`, `availableModes: ["EXPERIENCES"]`, and the `operator` profile object was returned. |
| Creation in Initial State | `POST /api/experiences` | `HTTP 201` | Experience created in the `DRAFT` state. Payload confirmed `isActive: false` and `isApproved: false`. |
| Authorised Unpublish | `PATCH /api/experiences/:id/unpublish` | `HTTP 200` | Operator successfully invoked their authority to unpublish. |
| Authorised Archive | `PATCH /api/experiences/:id/archive` | `HTTP 200` | Experience was successfully soft-deleted (`isActive` set to `false`). |
| Negative Enforcement | `PATCH /api/experiences/:id/publish` | `HTTP 403` | System correctly blocked publication of an unapproved experience, returning the expected error message. |
| Bookings Empty-State | `GET /api/experience-bookings/operator` | `HTTP 200` | Returned an empty array `[]` with correct pagination metadata, confirming correct function for a new operator. |

### 2. Bounded-Evidence Closure
The scenario of platform approval (`isApproved = true`) and subsequent successful publishing was designated as a bounded-evidence closure. The current staging environment does not expose an admin endpoint or interface for the platform to set the approval flag. Therefore, the successful publishing transition could not be executed end-to-end via the API. The negative enforcement, which successfully blocks publication when unapproved, serves as the primary verification of the authority matrix.

---

## Part 2: Registration Entry Point Evidence

The implementation ensured that the introduction of the `OPERATOR` registration path did not negatively impact existing registration flows. At the code level, the `OPERATOR` role was appended to the Zod validation array in the authentication router without modifying the existing roles. 

Live verification evidence confirmed this non-interference. The evidence script executed a registration request for the `HOST` role, which returned a successful `HTTP 201 Created` response. A subsequent login with the new host credentials returned a successful `HTTP 200 OK` response, correctly setting `activeMode: "STAYS"` and `availableModes: ["STAYS"]`. This confirms that the `HOST` registration and mode hydration pathways remain completely unaffected, demonstrating zero regression.

---

## Part 3: Phase D Enablement Notes

The C1 implementation establishes the foundation for Workstream Phase D (Consumer Experiences). The following notes define the contracts and expectations for downstream consumers.

### 1. Experience Entity Schema Expected for Downstream Consumers
Downstream consumer applications (Web and Mobile) should expect the `Experience` entity to match the Prisma schema definition. This includes core details such as the identifier, name, slug, description, experience type, city, pricing, and currency. It also includes media fields for the cover image and gallery URLs, as well as operational details like duration, group sizes, inclusions, requirements, and languages. Crucially, the schema now includes the new `meetingDetails` field, which is a nullable string intended to be surfaced to consumers only after a booking is confirmed.

### 2. Lifecycle-State Definitions & Publication Condition
Consumers must only be exposed to experiences that meet the strict publication condition, which requires both `isActive` and `isApproved` to be true. The list and detail endpoints for experiences already enforce this condition at the database query level. Therefore, consumer applications do not need to implement client-side filtering for lifecycle states, as the API guarantees that only fully published and approved experiences are returned.

### 3. Shared Authentication Response Impact
The authentication response shape remains structurally unchanged, preserving compatibility for all existing clients. The impact is strictly additive. For users with the `OPERATOR` role, the user object in the login and profile responses will now include an `operator` property containing the profile data. Existing clients that do not check for this property will ignore it without error. Furthermore, mode hydration continues to use the identical string-based format for active and available modes.
