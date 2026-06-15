# OWB-E2-SUB-CYCLE-B-IMPLEMENTATION-01 — AC-0 Verification Report

**Date:** 2026-06-15
**Branch:** staging (post-E2 Sub-cycle A `531b0e8`)

---

## AC-0.1 — 7 Cohort-Priority Surfaces Current State

| Surface | Existing tab(s) | Backend backing | State |
|---|---|---|---|
| **Users** | `Users` tab (line 372) | `GET /admin/users` (admin.ts:107) — real Prisma query with role/search filters + cohort fields | **Functional** — enhancement scope: add search input, reinstate action, cohort-code display column |
| **Vendors** | `Vendor Queue` + `Categories` + `Tags` tabs | `GET /admin/vendors/pending` (admin.ts:42) — real Prisma query | **Functional** — enhancement scope: add vendor search + total verified count display |
| **Hosts** | `Approvals` tab → Hosts sub-tab (line 1260) + Users HOST filter | `GET /admin/hosts/pending` (admin.ts:908) — real Prisma query | **Functional** — enhancement scope: add a dedicated Hosts listing surface (all hosts, not just pending) |
| **Experiences** | `Approvals` tab → Experiences sub-tab (line 1260) | `GET /admin/experiences/pending` (admin.ts:1102) — real Prisma query | **Functional** — enhancement scope: add a dedicated Experiences listing surface (all experiences, not just pending) |
| **Events** | `Overview` tab — Total Events + Active Bookings + GMV metrics (line 120) | `GET /admin/platform/stats` (admin.ts:11) — real Prisma count + aggregate | **Partial** — Overview has aggregate metrics only; no operational event listing surface. Enhancement scope: add Events listing sub-surface to Overview or as distinct tab |
| **Payments** | `Disputes` tab (line 648) — **MOCK DATA** (`MOCK_DISPUTES` hardcoded); `Commission` tab (line 716) — **MOCK DATA** (`RATE_PRESETS` hardcoded) | `GET /admin/bookings` (admin.ts:162) — real Prisma query; `POST /admin/bookings/:id/refund` (admin.ts:183) — real Paystack refund; `PUT /admin/vendors/:id/commission` (admin.ts:213) — real Prisma update | **Mock-data state** — real backend exists but UI disconnected. Enhancement scope: wire Disputes tab to real `/admin/bookings` data; wire Commission tab to real per-vendor commission data |
| **Platform Health** | `Overview` tab — Platform Health card (line 144) — **HARDCODED** static strings | `GET /admin/platform/stats` (admin.ts:11) — real Prisma query | **Partial/hardcoded** — health indicators (API response time, payment success rate, email deliverability, database connections) are static strings. Enhancement scope: wire dynamic values from platform stats; add pending approval counts |

---

## AC-0.2 — Enhancement Specification Per Surface

### Surface 1: Users
- Add a search input (name/email) wired to the existing `search` query param on `GET /admin/users`.
- Add a "Reinstate" action button for suspended users (backend `PUT /admin/users/:id/reinstate` already exists at admin.ts:153).
- Display `cohortCode` and `cohortType` columns in the users table.

### Surface 2: Vendors
- Add a total verified vendor count badge to the Vendor Queue tab header.
- No structural changes needed; functional state is good.

### Surface 3: Hosts
- Add a "All Hosts" listing view to the Approvals tab Hosts sub-tab (currently shows only `isApproved: false` pending queue). Add a toggle: "Pending" vs "All".
- Backend: add `GET /admin/hosts` endpoint returning all hosts with approval state.

### Surface 4: Experiences
- Add a "All Experiences" listing view to the Approvals tab Experiences sub-tab (currently shows only `isApproved: false` pending queue). Add a toggle: "Pending" vs "All".
- Backend: add `GET /admin/experiences` endpoint returning all experiences with approval state.

### Surface 5: Events
- Add an Events listing surface to the Overview tab as a second section: a paginated table of recent events from `GET /admin/events` (new endpoint needed).
- Backend: add `GET /admin/events` endpoint returning events with planner/vendor/booking counts.

### Surface 6: Payments
- **Disputes:** Wire `DisputesTab` to real `GET /admin/bookings` data (filter by `status: 'DISPUTED'` or show all bookings with dispute-relevant statuses). Remove `MOCK_DISPUTES` hardcode. Add real refund action wired to `POST /admin/bookings/:id/refund`.
- **Commission:** Wire `CommissionTab` rate table to real vendor data from `GET /admin/vendors` with `commissionRate` field. Remove `RATE_PRESETS` hardcode. Wire "Edit Rate" to real `PUT /admin/vendors/:id/commission`.

### Surface 7: Platform Health
- Wire the Platform Health card in OverviewTab to dynamic data: replace hardcoded strings with values from `/admin/platform/stats` (pending vendors count, pending approvals count). Keep static indicators (API response time, email deliverability) as informational placeholders but clearly label them.

---

## AC-0.3 — Canonical Construction Sites

| Surface | Frontend file:line | Backend file:line |
|---|---|---|
| Users | `apps/web/src/app/admin/page.tsx:372` (UsersTab) | `apps/api/src/routes/admin.ts:107` (GET /admin/users) |
| Vendors | `apps/web/src/app/admin/page.tsx:188` (VendorQueueTab) | `apps/api/src/routes/admin.ts:42` (GET /admin/vendors/pending) |
| Hosts | `apps/web/src/app/admin/page.tsx:1260` (ApprovalsTab) | `apps/api/src/routes/admin.ts:908` (GET /admin/hosts/pending) |
| Experiences | `apps/web/src/app/admin/page.tsx:1260` (ApprovalsTab) | `apps/api/src/routes/admin.ts:1102` (GET /admin/experiences/pending) |
| Events | `apps/web/src/app/admin/page.tsx:108` (OverviewTab) | `apps/api/src/routes/admin.ts:11` (GET /admin/platform/stats) |
| Payments | `apps/web/src/app/admin/page.tsx:648` (DisputesTab) + `:716` (CommissionTab) | `apps/api/src/routes/admin.ts:162` (GET /admin/bookings) + `:213` (PUT /admin/vendors/:id/commission) |
| Platform Health | `apps/web/src/app/admin/page.tsx:144` (OverviewTab Platform Health card) | `apps/api/src/routes/admin.ts:11` (GET /admin/platform/stats) |

---

## AC-0.4 — Existing Surface Dependencies (Non-Mock)

All non-mock surfaces have verified functional backend dependencies:
- `GET /admin/platform/stats` — real Prisma aggregates
- `GET /admin/users` — real Prisma query with role/search/cohort fields
- `GET /admin/vendors/pending` — real Prisma query
- `GET /admin/hosts/pending` — real Prisma query (E2 Sub-cycle A)
- `GET /admin/experiences/pending` — real Prisma query (E2 Sub-cycle A)
- `GET /admin/bookings` — real Prisma query (backing Payments surface)
- `PUT /admin/vendors/:id/commission` — real Prisma update (backing Commission surface)

---

## AC-0.5 — Cohort-Relevant Data Filter Requirements

| Surface | Cohort filter requirement |
|---|---|
| Users | Filter by `cohortCode` / `cohortType` — existing `search` param covers name/email; cohort filter to be added |
| Vendors | No cohort filter required at this scope |
| Hosts | Filter by `cohortType = COASTAL_CORRIDOR_HOST` — informational display |
| Experiences | No cohort filter required at this scope |
| Events | No cohort filter required at this scope |
| Payments | No cohort filter required at this scope |
| Platform Health | Add pending approval counts (cohort-relevant) to health card |

---

## AC-0.6 — Brief Amendment 01 Prophylactic Trigger Assessment

| Trigger | Assessment | Determination |
|---|---|---|
| (trigger-1) Surface count expansion beyond 7 | NOT triggered — 7 surfaces confirmed | No amendment needed |
| (trigger-2) Mock-data-to-functional conversion at substantial scope | **PARTIALLY triggered** — Disputes + Commission are mock-data state, but real backend already exists (`/admin/bookings`, `/admin/vendors/:id/commission`). Conversion is **wiring-only** (not a new backend build). Scope is bounded and within E2 Sub-cycle B scope. | No amendment needed — wiring scope is within cycle |
| (trigger-3) Multiple surfaces at substantial deficiency | NOT triggered — only Payments is mock-data; Events and Platform Health are partial but not deficient | No amendment needed |
| (trigger-4) Events/Payments/Platform Health specification ambiguity | Events: Overview enhancement (not distinct tab) — bounded scope. Platform Health: Overview enhancement — bounded scope. Payments: wiring-only — bounded scope. | No amendment needed |
| (trigger-5) Surface-level cohort go-live prioritisation direction | NOT triggered — all 7 surfaces are in scope | No amendment needed |
| (trigger-6) Scope-out boundary observation | Commission tab `RATE_PRESETS` signals post-cohort commission rate configuration scope per Strategy v 1.5 §8.3. However, the enhancement here is wiring existing `commissionRate` field (per-vendor) to the UI — not building a new commission rate configuration system. This is within scope-in-3. | No amendment needed — wiring existing field, not building new commission system |

**AC-0.6 conclusion:** No Brief Amendment 01 surfacing required. All 7 surfaces are within E2 Sub-cycle B scope with bounded enhancements.
