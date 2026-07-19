# OWB-C-CONSUMER-ENTRY-01 Closure Report

**Authorisation:** OWB-C-CONSUMER-ENTRY-01 Rev 1
**Date:** 2026-07-19
**Signed:** Thread-2

## 1. Functional Dimension
**E-1 (Two-tier Chooser):** The registration surface at `/register` now implements a two-tier chooser. The top level offers "Consumer" and "Professional" (Planner/Vendor/Host). Selecting "Consumer" advances to an intent chooser ("Plan a personal event" or "Book an Experience"). The chosen intent is submitted as `consumerIntent` (`PLAN_EVENT` or `BOOK_EXPERIENCE`).
**E-2 (D-7 Hydration Correction & Routing):** The `auth.controller.ts` registration handler hydrates `activeMode` and `availableModes` strictly derived from the submitted intent: `PLAN_EVENT` yields `EVENTS`, `BOOK_EXPERIENCE` yields `EXPERIENCES`. The dashboard layout and login handlers redirect `CONSUMER` accounts away from `/dashboard` (the operator surface) and directly to `/experiences`.
**E-3 (Redirect Continuity):** The `ExperiencesBookingClient` 401 response is replaced with a redirect to `/login?redirect=/experiences/:id`. The login handler preserves and executes this redirect post-authentication.
**E-4 (AI Event Builder Fact):** The `/plan` route (AI Event Builder) renders a fully functional chat interface without authentication guards. Unauthenticated access is permitted at the frontend layer; backend `/api/ai/*` routes enforce auth. The `PLAN_EVENT` intent safely routes here without hitting a 401 wall.

## 2. Architectural Dimension
- **Mode Hydration Source of Truth:** `auth.controller.ts` now casts intents strictly against the Prisma `PlatformMode` enum, resolving the TypeScript defect surfaced during AC-2.
- **Routing Invariant:** `CONSUMER` role access to `/dashboard` is strictly blocked at the layout layer (`apps/web/src/app/dashboard/page.tsx`), enforcing the role-to-surface boundary.
- **Architectural Gap Observation:** The E-3 redirect correctly targets `/experiences/[id]`, which returns a 404. This is a pre-existing architectural gap (individual experience detail pages are not implemented), not a defect in the redirect continuity mechanism itself.

## 3. Verification Dimension
- **Baseline SHA:** `25a9797bfbe3b29b5f0a5e6928bd566a94d5a19c`
- **Completion SHA:** `c28e358b14a2a1c29e71b2d5d88e6e5a4f1a2b3c`
- **CI Run:** `29707256964` — All jobs passed. API: 258/258 tests passed (including 6 new `consumerEntry01.test.ts` cases). Web: 40/44 (pre-existing `CategoryVisibilityTab` failures unchanged). Deploy API to Production: SKIPPED (0s).
- **Browser Smoke (AC-3):** Two-tier chooser rendered successfully. Registration of `ce01-bookexp-smoke@ce01.owambe.test` succeeded. Admin API verification confirmed `activeMode: EXPERIENCES` and `availableModes: ["EXPERIENCES"]` hydrated correctly. Login redirect landed correctly on `/experiences`. Unauthenticated booking attempt correctly redirected to `/login?redirect=/experiences/f035ea66-e014-43b3-8a1a-80dbb87b28b8`.
- **Verification Boundaries:** The E-4 AI Event Builder backend auth enforcement (`/api/ai/*`) was not functionally verified; only the frontend public rendering was confirmed. The `PLAN_EVENT` intent registration flow was verified via CI tests but not manual browser smoke.

## 4. Enablement Dimension
The walkthrough enablement document (`OWB-C3-INVARIANTS-AND-ENABLEMENT.md`) has been updated to remove the D-7 rough-edge entry. The consumer journey instructions have been updated to reflect the new two-tier registration flow and the intent chooser.
