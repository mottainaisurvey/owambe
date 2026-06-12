# Bilateral Test Fixture Conventions

**Status:** Active
**Context:** Phase 5.3 sub-item-b (Coordinated Test Data Alignment)
**Bilateral Scope:** Owambe Platform ↔ Coastal Corridor (CC)

## 1. Purpose and Scope

This document articulates the bilateral test fixture conventions agreed between the Owambe platform and Coastal Corridor (CC). It establishes the shared data shape, ID conventions, and fixture composition required to support end-to-end production-shape testing of the Amendment 009 Rev 3 wire contract.

The conventions documented here apply specifically to the bilateral integration layer. They ensure that test bookings dispatched from Owambe's `webhookDispatcher` can be successfully processed by CC's validation gates and seed endpoints.

## 2. Convention-A: Production-Shape ID Format

Test entity IDs must use production-shape formats to pass the Phase 5.3 sub-item-a validation gate. Diagnostic prefixes (e.g., `probe-`, `test-`) are strictly prohibited.

| Platform | ID Format Convention | Implementation |
|---|---|---|
| **Owambe** | UUID v4 | `dbgenerated("gen_random_uuid()") @db.Uuid` across all 55 schema models |
| **Coastal Corridor** | cuid | `cuid()` across all CC schema models |

Owambe-facing cross-reference fields at CC (e.g., `owambeExperienceId`, `owambeTimeSlotId`) are plain `String` types and accept Owambe's UUID v4 format natively at the wire layer.

## 3. Convention-B: Test Marker Patterns

Test entities are flagged via dedicated fields at the application layer rather than via ID prefixes. Each platform preserves its existing operational pattern for marking test data.

### Owambe-Side Pattern
Test entities are identified via cohort metadata and descriptive field injection:
- **User Identity:** `cohortMember: true`, `cohortType: 'INTERNAL'`, `cohortCode: 'T1_STAGING_TEST_DATA'`
- **Entity Identity (Property, Room, Booking):** The `SEED_MARKER` constant (`T1_STAGING_TEST_DATA`) is injected into descriptive fields such as `bio`, `description`, `specialRequests`, and `cancellationReason`.

### CC-Side Pattern
Test entities are identified via email domain heuristics and cross-references:
- **User Identity:** Email domain `@cc-staging.test`
- **Entity Identity:** Cross-reference fields (`owambeExperienceId`, etc.) pointing to known Owambe test IDs.

## 4. Convention-C: Persistent Lifecycle

Test entities are persistent across test runs. They are not ephemeral per-test-run fixtures. This stability is required so both sides can coordinate on a known set of test IDs.

- **Cleanup:** Cleanup is handled at the admin scope (manual or scheduled job), not via inline per-test teardown.
- **Owambe ExperienceSlot Idempotency:** The Owambe seed script uses deterministic anchor dates (e.g., `2027-03-01T15:00:00Z`) rather than relative execution-time dates to ensure `ExperienceSlot` creation is idempotent across seed runs.

## 5. Convention-D: Coordinated 2-Set Fixture Composition

The bilateral coordinated fixture set consists of two distinct sets covering the primary operational currency (NGN) and the diaspora payment path (USD).

### Set 1: NGN Fixture Set
- **Property:** `t1-lekki-family-villa` (NGN-priced rooms)
- **Experience:** `t1-lagos-food-culture-walk` (NGN-priced slots)
- **Operator:** `staging-experience-operator-1@owambe.test` (NGN preference)
- **Guest:** `staging-consumer-1@owambe.test`

### Set 2: USD Fixture Set
- **Property:** `t1-diaspora-waterfront-suite` (USD-priced rooms)
- **Experience:** `t1-diaspora-cooking-masterclass` (USD-priced slots)
- **Operator:** `staging-experience-operator-1@owambe.test` (USD preference)
- **Guest:** `staging-consumer-1@owambe.test`

*Note: Owambe maintains additional fixture variants (e.g., 6 Users, 3 Properties) in its seed script for internal comprehensiveness. The 2-set above is the specific subset coordinated bilaterally with CC.*

## 6. Convention-E: Stable-ID Conventions

Test fixture IDs must remain stable across deployments to prevent coordination breakage.

- **Owambe-Side:** Stable IDs are generated via natural-key upserts in the seed script (`apps/api/src/database/seed-staging-test-data.ts`). Keys such as `email`, `slug`, and `reference` ensure the same UUIDs are resolved or created on each run.
- **CC-Side:** CC seed endpoints (e.g., `seed/route.ts`) use stable deterministic patterns for Owambe cross-reference fields (e.g., `coord-test-exp-NGN`) rather than timestamp-suffixed probes.

## 7. Bilateral Fixture Reference Resolution

CC test fixtures reference Owambe test entities by their stable Owambe IDs. The resolution mechanism operates as follows:

1. Owambe runs its seed script, producing stable UUIDs for the NGN and USD fixture sets.
2. The canonical Owambe UUIDs are documented and shared (or queried via staging API).
3. CC seed endpoints inject these specific Owambe UUIDs into their `owambeExperienceId` and `owambePropertyId` fields.
4. When a test booking is dispatched from Owambe to CC, CC resolves the incoming Owambe ID against its seeded cross-reference fields.

## 8. Operational Constraints

- **Validation Gate:** All test fixtures must pass the Phase 5.3 sub-item-a validation gate. Non-UUID formats or diagnostic prefixes will be rejected at the sync queue entry.
- **Wire Shape:** All test bookings must conform to the Amendment 009 Rev 3 wire shape contract.

## 9. Engagement-Record Observation References

This convention document was established following the AC-8 pre-implementation verification cycle (2026-06-10). Key outcomes banked at the engagement-record layer include:
- Verification of UUID v4 (Owambe) and cuid (CC) production-shape ID formats.
- Verification of cohort metadata and email domain test marker patterns.
- Resolution of the Owambe `ExperienceSlot` idempotency gap via deterministic anchor dates.
- Establishment of the NGN + USD 2-set composition.
