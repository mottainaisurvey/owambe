# OWB-C1 AC-0 Scaffolding Inventory

## AC-0.1 Working Copy
- Branch: staging, HEAD: f235b1da3c23c634f768c8e43dfeef63cb6c7667 (f235b1d), clean tree. CONFIRMED.

## AC-0.2 Experiences Scaffolding — FOUND vs ASSUMED

### Schema (apps/api/prisma/schema.prisma)
**FOUND — fully scaffolded:**
- `model Experience` — complete with: id, operatorId, name, slug, description, experienceType (enum), city, state, country, address, lat/lng, coverImageUrl, galleryUrls[], durationMinutes, maxGroupSize, minGroupSize, pricePerPerson, currency, includes[], requirements[], languages[], **isActive** (bool, default true), **isApproved** (bool, default false, E2 comment), approvedAt, isFeatured, rating, reviewCount, createdAt, updatedAt. Relations: operator (Operator), availableSlots (ExperienceSlot[]), experienceBookings (ExperienceBooking[]).
- `model ExperienceSlot` — id, experienceId, startTime, endTime, capacity, bookedCount, isActive, createdAt. C2 schema already present.
- `model ExperienceBooking` — full booking model with PaymentStatus, ExperienceBookingStatus, channel integration fields.
- `model ExperienceTypeLookup` — lookup table for experience types.
- `enum ExperienceType` — CULTURAL_TOUR, FOOD_TASTING, ADVENTURE, WELLNESS_SPA, NIGHTLIFE, WORKSHOP, SPORTS, SIGHTSEEING, PRIVATE_DINING, MUSIC_PERFORMANCE.
- `model Operator` — id, userId (FK→User, unique), businessName, city, state, country, phone, bio, logoUrl, isVerified, verifiedAt, **isApproved** (bool, E2), approvedAt, paystackSubAccountCode/Id, bankCode/AccountNumber/AccountName, rating, reviewCount. Relation: user (User), experiences (Experience[]).

**KEY FINDING — isActive/isApproved pattern:**
- Experience has BOTH isActive (operator authority) AND isApproved (platform/admin authority). This is the existing convention.
- Public search filters: `isActive: true, isApproved: true` — customer visibility requires BOTH.
- Operator model also has isApproved (platform approval of the operator themselves).
- This is the lifecycle convention to follow per C1-b.0.

### UserRole Enum
```
enum UserRole {
  PLANNER
  VENDOR
  CONSUMER
  ADMIN
  HOST       // Phase A: Stays mode
  OPERATOR   // Phase A: Experiences mode
}
```
**KEY FINDING: OPERATOR role already exists in the enum.** No new enum value needed. The role is `OPERATOR`.

### PlatformMode Enum
```
enum PlatformMode { EVENTS, STAYS, EXPERIENCES }
```
EXPERIENCES mode already exists.

### User model
- Has `activeMode: PlatformMode @default(EVENTS)` and `availableModes: PlatformMode[] @default([EVENTS])`.
- HOST registration sets `activeMode: 'STAYS', availableModes: ['STAYS']`.
- OPERATOR registration: NOT YET WIRED in auth controller (gap to fill).

### API Routes (apps/api/src/routes/)
**FOUND:**
- `experiences.ts` — GET /api/experiences (public search), GET /api/experiences/:slug (public), POST /api/experiences (OPERATOR, requireRole), PUT /api/experiences/:id (OPERATOR), POST /api/experiences/:id/slots (OPERATOR), DELETE /api/experiences/:id/slots/:slotId (OPERATOR), GET /api/experiences/:id/slots (public).
- `experience-bookings.ts` — GET /api/experience-bookings (OPERATOR, own bookings), GET /api/experience-bookings/:id, POST /api/experience-bookings/:id/cancel.
- Routes use `authenticate` + `requireRole('OPERATOR')` + `requireMode('EXPERIENCES')` pattern.

**GAP:** No lifecycle transition endpoints (publish/unpublish) — only isActive/isApproved fields exist on the model. Need to add PATCH /api/experiences/:id/publish and /unpublish (operator-authority transitions).

**GAP:** No soft-delete/archive endpoint — only hard delete would be possible currently. Need to add PATCH /api/experiences/:id/archive (soft-delete convention).

### Middleware
- `authenticate.ts` — JWT Bearer token verification, attaches userId + userRole to req.
- `requireRole.ts` — checks req.userRole against allowed roles.
- `requireMode.ts` — checks user.availableModes in DB.

## AC-0.3 Registration Surface + Role/Auth Stack

### Registration Route (apps/api/src/routes/auth.ts)
- Validation: `body('role').isIn(['PLANNER', 'VENDOR', 'CONSUMER', 'HOST'])` — **OPERATOR not in allowed list**. GAP to fill.
- Register controller: HOST creates host profile + sets STAYS mode. OPERATOR: no branch exists yet.

### Registration Page (apps/web/src/app/register/page.tsx)
- ROLES array: PLANNER, VENDOR, HOST, CONSUMER — **OPERATOR not present**. GAP to fill.
- Schema: `role: z.enum(['PLANNER', 'VENDOR', 'CONSUMER', 'HOST'])` — needs OPERATOR added.

### Login/Auth Response
- Returns: accessToken, user (id, email, firstName, lastName, role, avatarUrl, isEmailVerified, activeMode, availableModes, profile).
- HOST profile returned as `host: profile`. OPERATOR profile not yet wired.

## AC-0.4 Navigation/Dashboard Shell

### Experiences Nav (FOUND — fully defined in dashboard layout):
```
EXPERIENCES_NAV = [
  Main: Dashboard (/dashboard/experiences), My Experiences (/dashboard/experiences/list), Add Experience (/dashboard/experiences/new)
  Bookings: Bookings (/dashboard/experiences/bookings), Manage Slots (/dashboard/experiences/slots)
  Tools: Analytics, Reviews, Pricing
]
```
- Mode-aware CTA: EXPERIENCES → "Add Experience" → /dashboard/experiences/new
- getDashboardShellMode() and shouldSyncDashboardMode() already handle EXPERIENCES mode.
- PAGE_TITLES already has all Experiences routes defined.

### Experiences Dashboard Page (apps/web/src/app/dashboard/experiences/page.tsx)
- Currently a Coming Soon placeholder with links to: My Experiences, Add Experience, Bookings.
- No real content yet — this is the surface C1-b replaces.

### Sub-pages — NOT YET CREATED:
- /dashboard/experiences/list — missing
- /dashboard/experiences/new — missing
- /dashboard/experiences/bookings — missing
- /dashboard/experiences/[id] — missing
- /dashboard/experiences/[id]/edit — missing

## AC-0.5 Test Infrastructure
- API: Jest + ts-jest, tests in apps/api/src/__tests__/*.test.ts. Pattern: supertest against Express app.
- Web: Vitest + React Testing Library, tests in apps/web/src/**/*.test.tsx. Pattern: component rendering + mocked API.
- Existing test files: api.test.ts (main integration), e2ApprovalStateModel.test.ts (isApproved pattern), stayBookings.paystackFailure.test.ts (pattern for new tests).

## Escalation Assessment

### trigger-3 (role-model decision):
- OPERATOR role already exists in UserRole enum. No ambiguity. No new enum value needed.
- Decision: extend existing OPERATOR role with EXPERIENCES mode hydration (parallel to HOST→STAYS pattern).
- **NO ESCALATION REQUIRED** — evidence clearly supports one option.

### trigger-9 (lifecycle convention):
- isActive (operator authority) + isApproved (platform authority) pattern EXISTS on Experience model (E2 comment confirms this was intentional).
- Convention: operator sets isActive; platform/admin sets isApproved; customer visibility = isActive AND isApproved.
- **NO ESCALATION REQUIRED** — existing convention applies directly.

### trigger-10 (soft-delete convention):
- Operator model has isActive on User (user.isActive). Experience has isActive field.
- No explicit "isArchived" or "deletedAt" field found on Experience model.
- The isActive=false pattern is the existing soft-delete convention (setting isActive=false removes from public view without deleting).
- **NO ESCALATION REQUIRED** — isActive=false is the established soft-delete/archive convention.

## Summary: What C1 needs to BUILD (gaps to fill)

### Backend (API):
1. Auth route: add OPERATOR to allowed roles in registration validation
2. Auth controller register(): add OPERATOR branch (create Operator profile, set EXPERIENCES mode)
3. Auth controller login(): add OPERATOR profile fetch + operator key in response
4. Experiences route: add lifecycle transition endpoints (PATCH /:id/publish, /:id/unpublish)
5. Experiences route: add soft-archive endpoint (PATCH /:id/archive, isActive=false)
6. Experiences route: verify create endpoint sets isActive=false, isApproved=false (draft state) — CHECK

### Frontend (Web):
1. Register page: add OPERATOR role option ("Hosting Experiences / Tours")
2. Register page: update schema + validation to include OPERATOR
3. /dashboard/experiences/list — My Experiences page (list own, lifecycle actions)
4. /dashboard/experiences/new — Create Experience form
5. /dashboard/experiences/bookings — Bookings empty state
6. /dashboard/experiences/[id] — Experience detail/edit page (optional, can be inline)
7. Dashboard layout: role-gated redirect for OPERATOR to /dashboard/experiences

### Schema:
- No new migrations needed — Experience model already has isActive + isApproved.
- C2 forward-compat: ExperienceSlot model already exists (C2 will populate it).
- Verify: no meetingDetails field on Experience — may need to add (b.1 requirement).

### Tests:
- API: experience operator role gating, registration→hydration, CRUD, lifecycle transitions, negative tests
- Web: registration form with OPERATOR option, dashboard redirect
