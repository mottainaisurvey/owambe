# T1 Staging Test Data

This document defines the reusable **staging-only** test-data set created for Cycle T1. It is intended to unblock pre-cohort verification across Stays, Vendor platform, Experiences, Consumer Experience, and Admin/QA flows without relying on ad hoc manual records.

> **Safety rule:** These accounts and records are for staging only. Do not run the T1 seed against production or use the records for real guest-facing QA.

## Purpose

Cycle T1 establishes stable test accounts and sample entities that later cycles can reference when validating portal behaviour. The seed is deliberately idempotent: repeated executions update the same accounts and canonical records rather than creating unlimited duplicates.

| Workstream | T1 support provided |
|---|---|
| A — Stays operator-side readiness | A verified HOST user, multiple active properties, rooms, calendar entries, and stay bookings in mixed statuses. |
| B — Vendor portal readiness | A verified VENDOR user, vendor package, portfolio sample, RFQ booking, and quote. |
| C — Cross-mode consumer/admin checks | A consumer user, planner user, and admin user with predictable roles and mode access. |
| E — Experiences readiness | A verified OPERATOR user, active experiences, slots, and an experience booking sample. |

## Seed command

The implementation lives at:

```text
apps/api/src/database/seed-staging-test-data.ts
```

Run it from the API workspace only when targeting the staging database:

```bash
cd apps/api
OWAMBE_ALLOW_STAGING_TEST_DATA_SEED=true \
STAGING_TEST_PASSWORD='<route securely; do not commit>' \
DATABASE_URL='<staging database url>' \
npm run db:seed:staging-test-data
```

The script refuses to run unless `OWAMBE_ALLOW_STAGING_TEST_DATA_SEED=true` is present and `STAGING_TEST_PASSWORD` is set to a value of at least twelve characters. The password is not stored in the repository and must be routed separately through the agreed secure operational channel.

## Accounts

All account emails use the `.test` reserved namespace and are tagged with the seed marker `T1_STAGING_TEST_DATA` through cohort metadata. The password is common across these accounts for staging QA convenience, but the password value must never be committed or included in ordinary execution reports.

| Account purpose | Email | Role | Active mode | Available modes |
|---|---|---|---|---|
| Consumer QA | `staging-consumer-1@owambe.test` | `CONSUMER` | `EVENTS` | `EVENTS` |
| Stays host QA | `staging-host-1@owambe.test` | `HOST` | `STAYS` | `STAYS` |
| Vendor QA | `staging-vendor-1@owambe.test` | `VENDOR` | `EVENTS` | `EVENTS`, `STAYS`, `EXPERIENCES` |
| Experience operator QA | `staging-experience-operator-1@owambe.test` | `OPERATOR` | `EXPERIENCES` | `EXPERIENCES` |
| Planner QA | `staging-planner-1@owambe.test` | `PLANNER` | `EVENTS` | `EVENTS` |
| Admin QA | `staging-admin-1@owambe.test` | `ADMIN` | `EVENTS` | `EVENTS`, `STAYS`, `EXPERIENCES` |

## Stays sample data

The seed creates a verified host profile and three active Stays properties. Each property has a room, a calendar entry, and is tied to the host account for host-portal ownership checks.

| Slug | Property | Status intent |
|---|---|---|
| `t1-lekki-family-villa` | T1 Lekki Family Villa | Available villa sample with a confirmed stay booking. |
| `t1-ikoyi-serviced-apartment` | T1 Ikoyi Serviced Apartment | Serviced apartment sample with a pending stay booking and a blocked calendar entry. |
| `t1-victoria-island-boutique-stay` | T1 Victoria Island Boutique Stay | Featured boutique stay sample with a cancelled/refunded stay booking and a maintenance calendar entry. |

Canonical stay booking references:

| Reference | Intended state |
|---|---|
| `T1-STAY-CONFIRMED-001` | Confirmed stay booking with deposit paid. |
| `T1-STAY-PENDING-001` | Pending stay booking with pending payment. |
| `T1-STAY-CANCELLED-001` | Cancelled stay booking with refunded payment. |

## Vendor sample data

The seed creates a verified vendor named **T1 Lens & Light Studio**, including a package, portfolio item, RFQ booking, and quote.

| Record | Canonical identifier |
|---|---|
| Vendor slug | `t1-lens-light-studio` |
| Package | `T1 Half-Day Photo & Video Coverage` |
| Booking reference | `T1-VENDOR-RFQ-001` |
| Quote | Linked to `T1-VENDOR-RFQ-001` |

## Experiences sample data

The seed creates a verified operator named **T1 Lagos Experience Co** and two active experiences with reusable future slots.

| Slug | Experience | Intended state |
|---|---|---|
| `t1-lagos-food-culture-walk` | T1 Lagos Food & Culture Walk | Featured food/culture experience with a confirmed booking. |
| `t1-private-afrobeats-nightlife` | T1 Private Afrobeats Nightlife | Active nightlife experience with open capacity. |

Canonical experience booking reference:

| Reference | Intended state |
|---|---|
| `T1-EXPERIENCE-CONFIRMED-001` | Confirmed experience booking with deposit paid. |

## Verification checklist after seeding

After running the seed against staging, verify the following manually or through authenticated browser checks:

| Check | Expected result |
|---|---|
| Login as host account | Host can access Stays mode and see the seeded properties. |
| Open Stays property list | At least the three `T1-*` properties are visible to the host. |
| Open property detail/edit routes | `/dashboard/stays/properties/[id]` and `/dashboard/stays/properties/[id]/edit` load against real seeded property IDs. |
| Login as vendor account | Vendor portal resolves to the seeded vendor profile rather than “Vendor not found.” |
| Login as operator account | Experiences operator context has active sample experiences. |
| Login as admin account | Admin can inspect sample users and records without requiring production data. |

## Credential handling

The shared staging password must be routed outside the repository. The ordinary execution-report pattern should state that the accounts were created and identify the secure route used for the password, but it must not paste the password into the report or any committed file.

If the password needs to rotate, re-run the seed with a new `STAGING_TEST_PASSWORD`. The script updates password hashes for all six T1 accounts.
