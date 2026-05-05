# Phase A.5 Kickoff Plan & Timeline (Revised)

This document outlines the execution plan and timeline for Phase A.5, incorporating the 9-day timeline, the explicit regression test set, and the strict production promotion sequence.

## 1. Scope of Work

Phase A.5 encompasses the following critical deliverables:

1. **Real Staging Environment:** Provisioning a fully isolated staging environment on Railway with its own PostgreSQL database, Redis instance, and environment variables (including Paystack test config). Configuring the CI/CD pipeline to automatically deploy to staging upon merges to the `staging` branch.
2. **User Schema Completion & Migration:** Adding the missing cohort fields (`cohortMember`, `cohortType`, `cohortStartDate`, `cohortEndDate`, `preferredCurrency`) and enums (`Currency`, `ChannelOrigin`, `CohortType`, `CohortCodeStatus`) to the Prisma schema. Executing an idempotent data migration to set `activeMode=EVENTS` and `availableModes=['EVENTS']` for all existing users.
3. **Channel Adapter Remediation:** Replacing generic stub adapters with the six specified adapters: Coastal Corridor (full implementation against the provided API contract), Booking.com, Airbnb, Hotels.ng, GetYourGuide, and Viator (all scaffolded behind a `CHANNEL__ENABLED` flag).
4. **Vocabulary Linting:** Implementing a vocabulary linter in the CI/CD pipeline (pre-commit hook and CI step) operating in advisory mode.
5. **Staging-First Deployment & Regression Testing:** Executing all Phase A.5 work through the strict staging-first-then-production workflow, culminating in a comprehensive regression test on the staging environment.

## 2. Execution Timeline (9 Working Days)

| Day | Focus Area | Key Deliverables |
| :--- | :--- | :--- |
| **Day 1-2** | Infrastructure & CI/CD | Provision separate DB/Redis on Railway staging. Configure staging environment variables (including Paystack test config). Update GitHub Actions for `staging` branch deployments. Ensure staging is genuinely operational. |
| **Day 3** | Schema & Data Migration | Add missing User fields and enums to Prisma schema. Write idempotent data migration script. Test migration script on staging. |
| **Day 4** | Channel Adapters (Scaffolding) | Remove generic stubs. Scaffold Booking.com, Airbnb, Hotels.ng, GetYourGuide, and Viator adapters implementing the `ChannelAdapter` interface. |
| **Day 5-6** | Coastal Corridor Adapter | Implement the Coastal Corridor adapter fully against the provided OpenAPI contract and narrative document. |
| **Day 7** | Vocabulary Linting | Implement vocabulary linting in CI/CD (pre-commit hook + CI step, advisory mode). |
| **Day 8** | Staging Deployment & Testing | Deploy all Phase A.5 changes to staging. Run regression test set and self-test acceptance criteria. Prepare Staging Verification Report. |
| **Day 9** | Review & Final Verification | Buffer for staging acceptance review. Address any issues surfaced by founder review. Final verification before production promotion. |

## 3. Regression Test Design

Phase A.5 acceptance requires explicit verification that existing Owambe Events users continue to function unchanged. The following regression test set will be executed on staging (and subsequently on production):

1. Existing user login (with backfilled `activeMode=EVENTS`).
2. Existing event creation, attendee management, and ticketing flows.
3. Existing vendor marketplace search and booking.
4. Existing payment processing through Paystack (with current test keys configuration).
5. Existing email delivery via BullMQ.
6. Existing real-time check-in via Socket.io.
7. Existing admin functions including category management.
8. Verification that the mode switcher does not appear for single-mode users.

## 4. Production Promotion Sequence

Once Phase A.5 is verified on staging and authorised by the founder, the promotion to production will follow this strict sequence:

1. **Schema Migration:** Run the Prisma schema migrations against the production database.
2. **Data Migration:** Run the idempotent data migration script for existing users against the production database.
3. **Code Deployment:** Merge the `staging` branch to the `main` branch, triggering the automatic production deployment.
4. **Smoke Test:** Conduct a production smoke test to confirm successful deployment.
5. **Regression Verification:** Verify that existing Owambe Events users remain unchanged in production.

## 5. Phase A.5 Acceptance Gate

Phase A.5 is complete and Phase B implementation is authorised when:
- Real staging environment is fully operational (separate DB, Redis, Paystack config, CI/CD).
- All missing User fields, enums, and existing-user migration are shipped via staging-first deployment.
- All six brief-specified channel adapters are present with correct interface implementation.
- Coastal Corridor adapter implements against the API contract.
- Vocabulary linting is integrated in CI/CD (advisory mode).
- Phase A.5 deployment to production is verified via staging acceptance.
- Existing Owambe Events users are verified unchanged in production.
- Regression test set passes in both staging and production.

I will now begin Day 1 work (Infrastructure & CI/CD).
