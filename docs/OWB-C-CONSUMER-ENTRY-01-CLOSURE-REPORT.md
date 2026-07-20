# OWB-C-CONSUMER-ENTRY-01 Closure Report

**Authorisation:** OWB-C-CONSUMER-ENTRY-01 Rev 2 (Final)
**Date:** 2026-07-20
**Signed:** Thread-2
**Status:** COMPLETE (Final Closure Bundle applied)

## 1. Functional Dimension
**E-1 (Two-tier Chooser):** The registration surface at `/register` implements a two-tier chooser. The top level offers "Consumer" and "Professional". Selecting "Consumer" advances to an intent chooser. The implementation contains four consumer intents (`BOOK_STAY`, `BOOK_EXPERIENCE`, `ATTEND_EVENT`, `PLAN_EVENT`). However, as the `/events` destination does not yet exist, the `ATTEND_EVENT` intent has been hidden from the UI surface via a `hidden: true` flag in the array and a `.filter(i => !i.hidden)` render condition (F-1). The UI surface presents the three remaining intents. The Professional tier correctly preserves the four deployed supply identities verbatim: Event Planner, Vendor / Business, Host / Property Manager, and Experience Operator.
**E-2 (D-7 Hydration Correction & Routing):** The `auth.controller.ts` registration handler hydrates `activeMode` and `availableModes` strictly derived from the submitted intent, using the Prisma `PlatformMode` enum: `BOOK_STAY` yields `STAYS`, `BOOK_EXPERIENCE` yields `EXPERIENCES`, `ATTEND_EVENT` yields `EVENTS`, and `PLAN_EVENT` yields `EVENTS`. The dashboard layout and login handlers redirect `CONSUMER` accounts away from `/dashboard` (the operator surface) and directly to `/experiences` (or their intent-specific destination).
**E-3 (Redirect Continuity):** The `ExperiencesBookingClient` 401 response is replaced with a redirect to `/login?redirect=/experiences`. The login handler preserves and executes this redirect post-authentication.
**E-4 (AI Event Builder Fact):** The `/plan` route (AI Event Builder) renders a fully functional chat interface without authentication guards. Unauthenticated access is permitted at the frontend layer; backend `/api/ai/*` routes enforce auth. The `PLAN_EVENT` intent safely routes here without hitting a 401 wall.

## 2. Architectural Dimension
- **Mode Hydration Source of Truth:** `auth.controller.ts` casts intents strictly against the Prisma `PlatformMode` enum, resolving the TypeScript defect surfaced during AC-2. The `ATTEND_EVENT` enum value, hydration mapping, and tests are preserved in code despite being hidden from the UI.
- **Routing Invariant:** `CONSUMER` role access to `/dashboard` is strictly blocked at the layout layer (`apps/web/src/app/dashboard/page.tsx`), enforcing the role-to-surface boundary.
- **Redirect Continuity Residual (R-1):** Surface-level continuity is delivered (the user returns to `/experiences`). Context-level continuity is NOT delivered because the `/experiences` surface does not support URL-based state restoration. This residual scope transfers to Cycle 2 G-4(i) as named inherited scope. The F-A cohort gate remains unchanged (both-cycles condition).

## 3. Verification Dimension
- **Baseline SHA:** `25a9797bfbe3b29b5f0a5e6928bd566a94d5a19c`
- **Completion SHA:** `f833040c03aed3530279b304a2c0a1842025f1fb` (F-1 closure head)
- **CI Run:** `29762802603` (from F-1 commit) — All jobs passed. API: 258/258 tests passed. Web: 40/44 (pre-existing `CategoryVisibilityTab` failures unchanged). Deploy API to Production: SKIPPED (0s).
- **Browser Smoke (AC-3 & F-3):** 
  - `PLAN_EVENT`: Registration → `/plan`, `activeMode: EVENTS` confirmed via V-2 smoke.
  - `BOOK_STAY`: Registration through the "Book a Stay" intent with `ce01-v3-bookstay@smoke.owambe.test` succeeded. Admin API verification confirmed `activeMode: STAYS` and `availableModes: ["STAYS"]` hydrated correctly. Login redirect landed correctly on `/stays` (F-3).
  - `BOOK_EXPERIENCE`: Registration succeeded, `activeMode: EXPERIENCES` confirmed, redirect to `/experiences` confirmed.
- **Verification Boundaries:** The `/events` destination was verified as non-existent (404), prompting the F-1 honest-surface correction.

## 4. Enablement Dimension
The walkthrough enablement document (`OWB-C3-INVARIANTS-AND-ENABLEMENT.md`) has been updated to remove the D-7 rough-edge entry. The consumer journey instructions reflect the new two-tier registration flow and the intent chooser. The staging email configuration gap (EMAIL-DIAG-01) is recorded in the rough edges register.
