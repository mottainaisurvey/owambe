# OWB-C1-EXPERIENCES-OPERATOR-SCAFFOLD-01: Micro-Supplement 01

**Author:** Thread-2 / Owambe Developer  
**Date:** July 11, 2026  
**Purpose:** Documentary completion only. No implementation work was performed.

---

## Item 1: Test Execution Evidence

### API Test Suite — CI Run `29147755947`

The following table records the complete API test suite execution from the CI run that validated the final C1 implementation at commit `fa80988` (staging branch). All 13 API test suites passed, totalling 195 tests.

| Test Suite | Result | Notes |
| :--- | :--- | :--- |
| `api.test.ts` | **PASS** (19.702 s) | Core API integration tests |
| `reservationEventDispatch.test.ts` | **PASS** | Reservation event dispatch regression |
| `bookingEventDispatch.test.ts` | **PASS** | Booking event dispatch regression (referenced in closure report) |
| `vendorMarketplaceExpansion01.test.ts` | **PASS** | Vendor marketplace expansion regression |
| `c1ExperienceOperatorScaffold.test.ts` | **PASS** | C1 new suite — 19 tests |
| `webhookDispatcher.fix.test.ts` | **PASS** | Webhook dispatcher regression |
| `cohortInterest.test.ts` | **PASS** | Cohort interest regression |
| `e2ApprovalStateModel.test.ts` | **PASS** | E2 approval state model regression |
| `e2bAdminSurfaces.test.ts` | **PASS** | E2b admin surfaces regression |
| `change-password.test.ts` | **PASS** | Change password regression |
| `stayBookings.paystackFailure.test.ts` | **PASS** | Stays Paystack failure regression |
| `paystackInitializationConfig.test.ts` | **PASS** | Paystack initialization config regression |
| `propertiesRouteOrder.test.ts` | **PASS** | Properties route order regression |

**Summary:** `Test Suites: 13 passed, 13 total` | `Tests: 195 passed, 195 total` | `Time: 38.556 s`

### Web Test Suite — CI Run `29147755947`

The web (Vitest) test suite reported 6 passed and 1 failed test file. The failing file (`CategoryVisibilityTab.test.tsx`) is a pre-existing failure unrelated to C1. The failure affects 4 of 6 tests in the `CategoryVisibilityTab` suite (T1, T2, T3, T5) and was present on the `staging` baseline (`f235b1d`) before any C1 work commenced. It is not a C1 regression.

**Summary:** `Test Files: 1 failed | 6 passed (7)` | `Duration: 7.33s`

---

## Item 2: Repository & CI Evidence

### Feature Branch → `fa80988` Commit Lineage

The C1 implementation was developed on the dedicated feature branch `c1-experiences-operator-scaffold-01` and merged into `staging` via a no-fast-forward merge commit. The full commit lineage from the baseline to the current `origin/staging` HEAD is as follows:

```
* 0dbd640  docs(c1): add supplementary evidence bundle for staging-first closure
* 1453d3d  docs(c1): add OWB-C1-EXPERIENCES-OPERATOR-SCAFFOLD-01 closure report
* fa80988  test(c1): fix assertion mismatches in c1ExperienceOperatorScaffold tests
* 11cb21f  fix(c1): add proper Prisma migration for meetingDetails + isActive default
*   1ade34f  merge: C1 Experience Operator persona + portal scaffold
|\
| * 7852e52  (c1-experiences-operator-scaffold-01) feat(c1): Experience Operator persona + portal scaffold
|/
* f235b1d  (baseline) merge: STAYS-J1 UI auth header remediation
```

### Working Tree & Origin/Staging Status

Working tree is clean. `staging` and `origin/staging` are in sync at `0dbd640`.

```
On branch staging
Your branch is up to date with 'origin/staging'.
nothing to commit, working tree clean
```

### CI Run `29147755947` — Full Job Table

This run was triggered by the push of commit `fa80988` to the `staging` branch. The `Deploy API to Production (Railway)` job was correctly **SKIPPED** because the trigger condition `github.ref == 'refs/heads/main'` was not met (this was a staging branch push).

| Job | Status | Duration | Job ID |
| :--- | :--- | :--- | :--- |
| Vocabulary Lint (Advisory) | **PASS** | — | 86532103032 |
| Lint & Type Check | **PASS** | 1m 41s | 86532103032 |
| Run Tests | **PASS** | 2m 52s | 86532221847 |
| Build | **PASS** | 2m 16s | 86532438530 |
| Deploy Web to Staging (Railway) | **PASS** | 3m 21s | 86532607776 |
| Deploy API to Staging (Railway) | **PASS** | 1m 20s | 86532607784 |
| **Deploy API to Production (Railway)** | **SKIPPED** | 0s | 86532608001 |

### Migration `20260711000001_c1_experience_operator_scaffold` Deploy Evidence

The CI log for the `Run Tests` job (ID `86532221847`) confirms that `prisma migrate deploy` applied 18 migrations in sequence, with the C1 migration applied last:

```
18 migrations found in prisma/migrations
...
Applying migration `20260615000001_e2_add_is_approved_field`
Applying migration `20260711000001_c1_experience_operator_scaffold`
The following migration(s) have been applied:
  └─ 20260711000001_c1_experience_operator_scaffold/
      └─ migration.sql
```

---

## Item 3: Taxonomy Clarification (Flag A)

**Confirmation:** The enablement notes in the supplementary evidence bundle used informal labels. The canonical Workstream C taxonomy is as follows, and the content maps accordingly:

| Document Label Used | Canonical Taxonomy | Mapping |
| :--- | :--- | :--- |
| "C2 (Operator Capabilities)" | **C2: Experiences slot/capacity scheduling (RRULE)** | The `ExperienceSlot` schema forward-compatibility notes and the `/dashboard/experiences/slots` UI scaffold map to canonical C2. |
| "C3 (Operator Financials)" | **C3: Experiences customer-facing booking flow** | The Paystack sub-account fields on the `Operator` model and the financial enablement notes map to canonical C3. |
| "Phase D consumer enablement" | **Owambe C3 AND CC Phase D** | **Confirmed.** The Phase D Enablement Notes section serves both Owambe C3 (the customer-facing booking flow that requires a published, approved experience) and CC Phase D (the Coastal Corridor consumer workstream). The dual-boolean publication condition (`isActive=true AND isApproved=true`), the `meetingDetails` field, and the authentication response additive-only impact are relevant to both downstream consumers. |

---

## Item 4: Lifecycle-Copy Clarification (Flag B)

**Finding:** Option (a) applies. The `"Submit for review first."` copy in the `HTTP 403` publish-blocked error message is **dormant copy**. It references a conceptual workflow step that has no corresponding implementation.

**Evidence:** A full-text search of `apps/api/src/` for `submit`, `submitForReview`, `submit-for-review`, `/submit`, and `SUBMITTED` returned zero results outside of the single error message string at `apps/api/src/routes/experiences.ts:412`. No submit-for-review endpoint, route handler, state transition, or workflow mechanism exists anywhere in the codebase.

**Status:** The copy is forward-looking guidance text that was authored in anticipation of a future review-submission workflow. It should be treated as dormant copy to be adjusted at an authorised future beat, consistent with option (a). No implementation or modification is performed under this request.
