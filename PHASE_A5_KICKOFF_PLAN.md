# Phase A.5 Kickoff Plan & Timeline

This document outlines the execution plan and timeline for Phase A.5, which addresses the undelivered scope from Phase A and establishes the non-negotiable staging-first deployment workflow.

## 1. Scope of Work

Phase A.5 encompasses the following five critical deliverables:

1. **Real Staging Environment:** Provisioning a fully isolated staging environment on Railway with its own PostgreSQL database, Redis instance, and environment variables. Configuring the CI/CD pipeline to automatically deploy to staging upon merges to the `staging` branch.
2. **User Schema Completion & Migration:** Adding the missing cohort fields (`cohortMember`, `cohortType`, `cohortStartDate`, `cohortEndDate`, `preferredCurrency`) and enums (`Currency`, `ChannelOrigin`, `CohortType`, `CohortCodeStatus`) to the Prisma schema. Executing a data migration to set `activeMode=EVENTS` and `availableModes=['EVENTS']` for all existing users.
3. **Channel Adapter Remediation:** Replacing generic stub adapters with the six specified adapters: Coastal Corridor (full implementation against the provided API contract), Booking.com, Airbnb, Hotels.ng, GetYourGuide, and Viator (all scaffolded behind a `CHANNEL__ENABLED` flag).
4. **Vocabulary Linting:** Implementing a vocabulary linter in the CI/CD pipeline (pre-commit hook and CI step) operating in advisory mode.
5. **Staging-First Deployment:** Executing all Phase A.5 work through the strict staging-first-then-production workflow, culminating in a self-test against acceptance criteria on the staging environment.

## 2. Execution Timeline

The estimated timeline for Phase A.5 is **1 week (5 working days)**, sequenced as follows:

| Day | Focus Area | Key Deliverables |
| :--- | :--- | :--- |
| **Day 1** | Infrastructure & CI/CD | Provision separate DB/Redis on Railway staging. Configure staging environment variables. Update GitHub Actions for `staging` branch deployments. |
| **Day 2** | Schema & Data Migration | Add missing User fields and enums to Prisma schema. Write and execute the data migration script for existing users. Verify no regressions for existing Events users. |
| **Day 3** | Channel Adapters (Scaffolding) | Remove generic stubs. Scaffold Booking.com, Airbnb, Hotels.ng, GetYourGuide, and Viator adapters implementing the `ChannelAdapter` interface. |
| **Day 4** | Coastal Corridor Adapter | Implement the Coastal Corridor adapter fully against the provided API contract document. |
| **Day 5** | Linting, Deployment & Testing | Implement vocabulary linting in CI/CD. Merge all changes to `staging`. Run self-test acceptance criteria on the staging environment. Deliver Phase A.5 Staging Verification Report. |

## 3. Deployment Workflow Enforcement

All Phase A.5 deliverables will strictly follow this workflow:
1. Code developed on feature branches.
2. Merged to `staging` branch.
3. Automatic deployment to the Railway staging environment.
4. **Hold for Founder Review:** A Staging Verification Report will be delivered. No code will be promoted to production until explicit founder authorisation is received.
5. Upon authorisation, merge to `main` branch for automatic production deployment.

## 4. Next Steps

To proceed with Day 1 and Day 2 activities, I await your confirmation of this kickoff plan. 

Additionally, please provide the **Coastal Corridor API contract document** (coastal-corridor-owambe-api.yaml plus narrative) so I can begin reviewing it for the Day 4 implementation.
