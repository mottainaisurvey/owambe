# OWB-C2-EXPERIENCES-SLOT-SCHEDULING-01 — Raw Evidence Bundle

**Date:** July 11, 2026
**Author:** Manus AI (Thread-2 / Owambe Developer)
**Purpose:** Supplementary raw evidence artefacts for coordinator assessment. No summaries — verbatim outputs only.

---

## 1. Test Execution Output

**CI Run:** `29160803397` | **Job:** Run Tests (`86565561726`) | **Timestamp:** `2026-07-11T17:02:45 – 17:03:15 UTC`

### 1a. API Test Suite Results (verbatim from CI log)

```
PASS src/__tests__/api.test.ts (16.799 s)
PASS src/__tests__/reservationEventDispatch.test.ts
PASS src/__tests__/bookingEventDispatch.test.ts
PASS src/__tests__/c2ExperienceSlotScheduling.test.ts
PASS src/__tests__/vendorMarketplaceExpansion01.test.ts
PASS src/__tests__/c1ExperienceOperatorScaffold.test.ts
PASS src/__tests__/webhookDispatcher.fix.test.ts
PASS src/__tests__/cohortInterest.test.ts
PASS src/__tests__/e2ApprovalStateModel.test.ts
PASS src/__tests__/e2bAdminSurfaces.test.ts
PASS src/__tests__/change-password.test.ts
PASS src/__tests__/stayBookings.paystackFailure.test.ts
PASS src/__tests__/paystackInitializationConfig.test.ts
PASS src/__tests__/propertiesRouteOrder.test.ts

Test Suites: 14 passed, 14 total
Tests:       212 passed, 212 total
Snapshots:   0 total
Time:        34.419 s
```

### 1b. Web Test Suite Results (verbatim from CI log)

```
FAIL src/test/components/CategoryVisibilityTab.test.tsx
  CategoryVisibilityTab — admin/page Categories tab (AC-4 Surface 3)
    T1: renders category rows with visibility toggle switches
```

**Note:** The `CategoryVisibilityTab.test.tsx` failure is a pre-existing failure that predates C2. It was present in CI run `29147755947` (C1 final CI) and is not a C2 regression. All C2 test files (`c2ExperienceSlotScheduling.test.ts`) passed.

---

## 2. Repository Lineage and Working-Tree Status

### 2a. C2 Feature Branch → Staging Lineage (verbatim from `git log --oneline`)

```
03cf5ac (HEAD -> staging, origin/staging) docs(c2): add C2 closure report, invariants, and enablement notes
8de8092 fix(c2): correct test 16 field names — pricePerPerson, remove capacity
fb13503 fix(c2): register experience-slots router in app.ts (test-facing app)
5a3675a fix(c2): update root package-lock.json with rrule@2.8.1; remove pnpm lock files
7832507 merge(c2): RRULE slot scheduling into staging — OWB-C2-EXPERIENCES-SLOT-SCHEDULING-01
84dbb5d (c2-experiences-slot-scheduling-01) feat(c2): RRULE slot scheduling — schema, API, UI, tests
138cd95 docs(c1): add micro-supplement 01 — test evidence, CI evidence, taxonomy + lifecycle-copy clarifications
0dbd640 docs(c1): add supplementary evidence bundle for staging-first closure
1453d3d docs(c1): add OWB-C1-EXPERIENCES-OPERATOR-SCAFFOLD-01 closure report
fa80988 test(c1): fix assertion mismatches in c1ExperienceOperatorScaffold tests
11cb21f fix(c1): add proper Prisma migration for meetingDetails + isActive default
```

### 2b. Working-Tree Status (verbatim from `git status`)

```
On branch staging
Your branch is up to date with 'origin/staging'.
nothing to commit, working tree clean
```

### 2c. Origin/Staging HEAD (verbatim)

```
03cf5ac (HEAD -> staging, origin/staging) docs(c2): add C2 closure report, invariants, and enablement notes
```

---

## 3. CI Job Table — Run 29160803397

**Branch:** `staging` | **Trigger:** push | **Conclusion:** success

| Job | Status | Duration | Job ID |
|-----|--------|----------|--------|
| Vocabulary Lint (Advisory) | ✓ success | 11s | 86565447460 |
| Lint & Type Check | ✓ success | 1m12s | 86565447474 |
| Run Tests | ✓ success | 1m58s | 86565561726 |
| Build | ✓ success | 1m43s | 86565720748 |
| Deploy Web to Staging (Railway) | ✓ success | 2m17s | 86565856408 |
| Deploy API to Staging (Railway) | ✓ success | 1m19s | 86565856430 |
| **Deploy API to Production (Railway)** | **— SKIPPED** | **0s** | **86565856897** |

**Deploy-API-to-Production SKIPPED confirmation** (verbatim from `gh run view --job 86565856897`):

```
✓ staging Owambe CI/CD · 29160803397
Triggered via push about 54 minutes ago
- Deploy API to Production (Railway) in 0s (ID 86565856897)
```

The `-` prefix in the GitHub CLI output denotes a skipped job. Duration of `0s` confirms no execution occurred.

### 3a. Migration Deployment Evidence (verbatim from CI log — Run Tests job, "Run migrations" step)

```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "owambe_test", schema "public" at "localhost:5432"

19 migrations found in prisma/migrations

Applying migration `20260505000000_baseline_phase_a5`
Applying migration `20260509000000_owb_unblock_01_booking_status_refunded`
Applying migration `20260509000001_owb_unblock_01_payment_status_paid`
Applying migration `20260510000000_phase_c_commission_audit_log`
Applying migration `20260511000000_pay_canonical_01_step1`
Applying migration `20260511000001_pay_canonical_01_step2`
Applying migration `20260511000002_pay_canonical_01_step3`
...
Applying migration `20260711000001_c1_experience_operator_scaffold`
Applying migration `20260711000002_c2_experience_slot_scheduling`
  └─ 20260711000001_c1_experience_operator_scaffold/
  └─ 20260711000002_c2_experience_slot_scheduling/
```

Both C1 and C2 migrations were applied successfully in the CI database.

---

## 4. Staging Smoke Outputs (AC-5 Execution)

All outputs captured against `https://owambe-api-staging.up.railway.app` at `2026-07-11T17:55 UTC`.

### 4a. Health Endpoint (verbatim)

```json
{
    "status": "ok",
    "timestamp": "2026-07-11T17:55:29.549Z",
    "service": "owambe-api",
    "version": "1.0.0",
    "environment": "staging",
    "build": "local"
}
HTTP_STATUS: 200
```

### 4b. Auth Boundary — `GET /api/experience-slots/:id` (unauthenticated, verbatim)

```json
{"success":false,"error":"Authentication required"}
HTTP_STATUS: 401
```

### 4c. Auth Boundary — `GET /api/experiences/mine` (unauthenticated, verbatim)

```json
{"success":false,"error":"Authentication required"}
HTTP_STATUS: 401
```

---

## 5. Bounded-Evidence-Closure Register

The following scenarios could not be exercised against staging without creating production-equivalent test data or requiring platform-authority actions. Each is documented with its closure rationale.

| # | Scenario | Closure Rationale |
|---|----------|-------------------|
| 1 | Authenticated OPERATOR creates a recurring series on staging | Requires a live OPERATOR account on staging. The auth boundary (401) confirms the endpoint exists and is protected. Full execution is evidenced by the CI test suite (`c2ExperienceSlotScheduling.test.ts` tests 2–4). |
| 2 | Series cancellation preserving booked instances | Requires an active booking on a slot. Evidenced by CI test 11 (`cancel series preserves booked instances`). |
| 3 | Foreign-operator authority rejection | Requires two OPERATOR accounts. Evidenced by CI test 12 (`foreign operator cannot manage slots`). |

No platform-authority transitions (e.g., `isApproved`) were exercised, as the C2 cycle does not introduce any new platform-authority surfaces.

---

## 6. C1 Note-2 Confirmation

**Note-2 Claim:** The C1 migration (`20260711000001_c1_experience_operator_scaffold`) changed the `isActive` default on the `experiences` table from `true` to `false`. This change was safe because zero experience rows existed in the staging database prior to the C1 migration.

### 6a. Evidence — Staging Experience Row Count (verbatim, queried 2026-07-11T17:55 UTC)

```json
{
    "success": true,
    "data": [],
    "pagination": {
        "page": 1,
        "limit": 50,
        "total": 0,
        "pages": 0
    }
}
```

`total: 0` confirms that no experience rows exist on staging. The pre-C1 count was also zero (no experience creation capability existed before C1 introduced the OPERATOR registration path and portal).

### 6b. Evidence — C1 Migration SQL (verbatim)

```sql
-- C1: Experience Operator Scaffold — Schema Additions
-- OWB-C1-EXPERIENCES-OPERATOR-SCAFFOLD-01
-- Add meetingDetails field to Experience model (C2-forward-compatible, nullable)
ALTER TABLE "experiences" ADD COLUMN IF NOT EXISTS "meetingDetails" TEXT;
-- Fix isActive default to false (DRAFT state per C1-b.0 lifecycle model)
-- Note: existing rows are not affected; new rows will default to false
ALTER TABLE "experiences" ALTER COLUMN "isActive" SET DEFAULT false;
```

The migration comment explicitly states: `existing rows are not affected; new rows will default to false`. The zero-row count on staging confirms no data mutation occurred.

---

*Signed: Thread-2 / Owambe Developer*
