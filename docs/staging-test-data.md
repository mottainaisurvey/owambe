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

| Slug | Property | Property UUID | Room | Room UUID | Status intent |
|---|---|---|---|---|---|
| `t1-lekki-family-villa` | T1 Lekki Family Villa | `8e0845a8-dc5b-448a-9977-213fbbb3287e` | Family Suite | `671c1b2d-2d2c-4671-9473-8b57d9429e48` | Available villa sample with a confirmed stay booking. |
| `t1-ikoyi-serviced-apartment` | T1 Ikoyi Serviced Apartment | `7dbdc10d-03e6-4d97-887c-7050d5e3926f` | Executive Apartment | `544219ce-ff7c-4038-997a-d848fec052aa` | Serviced apartment sample with a pending stay booking and a blocked calendar entry. |
| `t1-victoria-island-boutique-stay` | T1 Victoria Island Boutique Stay | `0000103b-5272-41ad-9a84-2f5c990ef4dd` | Presidential Suite | `6b170479-b519-4cea-9b17-a1bdd6888ff9` | Featured boutique stay sample with a cancelled/refunded stay booking and a maintenance calendar entry. |

Canonical stay booking references:

| Reference | Booking UUID | Intended state |
|---|---|---|
| `T1-STAY-CONFIRMED-001` | `d0ccb13d-09b2-4c90-a867-b26a78b778d9` | Confirmed stay booking with deposit paid. |
| `T1-STAY-PENDING-001` | `1ddf1acf-3ef0-41fd-a7f3-31d9b754d19c` | Pending stay booking with pending payment. |
| `T1-STAY-CANCELLED-001` | `98951733-662c-40d6-aacf-ea838fc121c6` | Cancelled stay booking with refunded payment. |

## Vendor sample data

The seed creates a verified vendor named **T1 Lens & Light Studio**, including a package, portfolio item, RFQ booking, and quote.

| Record | Canonical identifier |
|---|---|
| Vendor slug | `t1-lens-light-studio` |
| Package | `T1 Half-Day Photo & Video Coverage` |
| Booking reference | `T1-VENDOR-RFQ-001` |
| Booking UUID | `07305ee5-95a6-4e76-8f1f-98362e56c453` |
| Quote | Linked to `T1-VENDOR-RFQ-001` |

## Experiences sample data

The seed creates a verified operator named **T1 Lagos Experience Co** and two active experiences with reusable future slots.

| Slug | Experience | Experience UUID | Slot UUID | Slot start time | Intended state |
|---|---|---|---|---|---|
| `t1-lagos-food-culture-walk` | T1 Lagos Food & Culture Walk | `6dff6f90-0469-4d1e-8893-25806c350a1d` | `f902b68e-05bf-4a4e-b86c-a2b50c420eea` | `2026-06-27T15:00:00.000Z` | Featured food/culture experience with a confirmed booking. |
| `t1-private-afrobeats-nightlife` | T1 Private Afrobeats Nightlife | `a424fc3f-ba34-44f2-8025-455e0775a686` | `e7af04ef-5ea7-44d7-9e8a-56a7452af023` | `2026-07-04T15:00:00.000Z` | Active nightlife experience with open capacity. |

Canonical experience booking reference:

| Reference | Booking UUID | Intended state |
|---|---|---|
| `T1-EXPERIENCE-CONFIRMED-001` | `4e95e726-0e19-4877-adea-2bdd3162191e` | Confirmed experience booking with deposit paid. |

## UUID publication notes

The UUIDs in this document were retrieved from the live staging database on 2026-06-14 via the authenticated admin API and are authoritative for the current T1 seed state. If the T1 seed is re-run (e.g., after a staging database reset), the UUIDs will change because they are DB-generated. In that case, re-run the UUID publication query and update this document accordingly.

The natural keys (slugs and references) are stable across seed runs and should be used as the primary bilateral coordination identifiers. UUIDs are published here as a secondary reference for direct DB-level or API-level lookup convenience.

## Verification checklist after seeding

After running the seed against staging, verify the following manually or through authenticated browser checks:

| Check | Expected result |
|---|---|
| Login as host account | Host can access Stays mode and see the seeded properties. |
| Open Stays property list | At least the three `T1-*` properties are visible to the host. |
| Open property detail/edit routes | `/dashboard/stays/properties/[id]` and `/dashboard/stays/properties/[id]/edit` load against real seeded property IDs. |
| Login as vendor account | Vendor portal resolves to the seeded vendor profile rather than "Vendor not found." |
| Login as operator account | Experiences operator context has active sample experiences. |
| Login as admin account | Admin can inspect sample users and records without requiring production data. |

## Credential handling

The shared staging password must be routed outside the repository. The ordinary execution-report pattern should state that the accounts were created and identify the secure route used for the password, but it must not paste the password into the report or any committed file.

If the password needs to rotate, re-run the seed with a new `STAGING_TEST_PASSWORD`. The script updates password hashes for all six T1 accounts.
