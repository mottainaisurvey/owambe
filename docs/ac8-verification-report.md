# AC-8 Pre-Implementation Verification Report
**Phase:** PHASE-5-3-B-COORDINATED-TEST-DATA-ALIGNMENT-01
**Target:** Owambe-side anchors V-PH53B-2, V-PH53B-3, V-PH53B-4, and V-PH53B-5

This report documents the verification of the Owambe staging test data seed script and schema conventions against the AC-8 requirements, prior to Coastal Corridor's implementation of the Amendment 009 Rev 3 booking wire shape.

## V-PH53B-2: Entity Inventory and ID Conventions

**Finding:** Verified. The seed script provisions the required entities, and the schema uses `dbgenerated("gen_random_uuid()")` for all IDs.

The seed script located at `apps/api/src/database/seed-staging-test-data.ts` successfully provisions the required entity inventory. It creates six distinct users (Consumer, Host, Vendor, Operator, Planner, Admin) using the `upsertUser` helper function. Furthermore, it provisions three Properties with associated Rooms and CalendarEntries, one VendorPackage, one PortfolioItem, and two Experiences with ExperienceSlots. The script also generates canonical booking records, including three StayBookings (in CONFIRMED, PENDING, and CANCELLED states), one Vendor Booking (RFQ) with an associated Quote, and one CONFIRMED ExperienceBooking.

An audit of the canonical schema (`apps/api/prisma/schema.prisma`) confirms the ID format conventions. All 55 models defined in the schema utilize the `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid` directive for their primary keys. There are zero instances of Prisma-generated `@default(cuid())` or `@default(uuid())` defaults across the entire schema, ensuring that all IDs are generated directly by the PostgreSQL database.

## V-PH53B-3: Test Marker Mechanism

**Finding:** Verified. There is no `is_test_data` boolean field on core entity models. Test data is marked via cohort metadata on the `User` model and descriptive strings elsewhere.

A comprehensive search across the schema file reveals no instances of an `is_test_data`, `isTestData`, or similar boolean flag on any core entity models. Instead, the test marker mechanism is implemented through cohort metadata fields on the `User` model, specifically `cohortCode`, `cohortMember`, and `cohortType`.

The seed script leverages this mechanism by creating the test users with `cohortMember: true`, `cohortType: 'INTERNAL'`, and `cohortCode: SEED_MARKER`, where the `SEED_MARKER` constant is defined as `T1_STAGING_TEST_DATA`. For other entities such as Properties, Rooms, and Bookings, the script prepends or injects the `SEED_MARKER` into descriptive text fields like `bio`, `description`, `specialRequests`, and `cancellationReason` to clearly indicate that they are staging test records.

## V-PH53B-4: Idempotency and Cleanup

**Finding:** Verified with one minor gap. The seed script is largely idempotent, using `upsert` with stable natural keys. There is no explicit cleanup/teardown function in the script or admin routes.

The seed script employs robust idempotency patterns for almost all entity types by utilizing Prisma's `upsert` operation keyed on stable natural identifiers rather than committed UUIDs. Users are upserted by their `email` address, Properties by their unique `slug`, and all Booking types (Stay, Vendor, Experience) by their canonical `reference` strings (e.g., `T1-STAY-CONFIRMED-001`). Rooms are handled via a `findFirst` lookup by `propertyId` and `name` followed by an update or create operation, while CalendarEntries use a composite unique key of `roomId_date`. VendorPackages use a fallback mechanism where they are upserted by `id`, falling back to a zero UUID if not found via a `findFirst` query by `vendorId` and `name`.

However, a minor idempotency gap exists in the creation of `ExperienceSlot` records. The script uses a `futureDate()` helper function to set the `startTime`, which calculates a date relative to the current execution time. Because this `startTime` changes on every run, the `findFirst` lookup fails to find the existing slot, resulting in the creation of a new `ExperienceSlot` on every rerun instead of updating the existing one.

Regarding cleanup mechanisms, the seed script does not contain a `deleteMany` or teardown block for the seeded entities. A repository-wide search confirms the absence of any dedicated cleanup script or admin cleanup endpoint. The documentation in `docs/staging-test-data.md` states that the script is intended to be idempotent and that repeated executions update the same canonical records, but it does not prescribe a teardown procedure.

## V-PH53B-5: Amendment 009 Rev 3 Wire Shape Alignment

**Finding:** Verified. The inbound channel routes for stays and experiences align with the expected wire shape and handle the payload correctly.

The inbound channel routes defined in `apps/api/src/routes/channel.ts` are fully prepared to accept the Amendment 009 Rev 3 booking wire shape from Coastal Corridor. The implementation details for both Stays and Experiences are summarized in the table below.

| Integration | Endpoint | Payload Handling and Validation | Persistence Mapping |
| :--- | :--- | :--- | :--- |
| **Stays Reservation** | `POST /stays/reservations` | Accepts all required snake_case fields including `cc_reservation_id`, `owambe_property_id`, `owambe_room_id`, and financial fields. Supports both flat snake_case and nested `guest` object structures for guest information. | Maps payload to the `StayBooking` model, correctly assigning `externalRef` to `cc_reservation_id`, `externalPropertyId` to `owambe_property_id`, and setting `channelOrigin` to `COASTAL_CORRIDOR`. |
| **Experience Booking** | `POST /experiences/bookings` | Accepts all required snake_case fields including `cc_booking_id`, `cc_experience_id`, `owambe_time_slot_id`, and participant details. Supports both flat snake_case and nested `lead_participant` object structures. Validates `owambe_time_slot_id` as a UUID, returning a structured 422 error if invalid. | Maps payload to the `ExperienceBooking` model, correctly assigning `externalRef` to `cc_booking_id`, `externalExperienceId` to `cc_experience_id`, and setting `channelOrigin` to `COASTAL_CORRIDOR`. |

## Conclusion
The Owambe staging test data seed script and schema conventions successfully meet the AC-8 pre-implementation verification requirements. The entity inventory is complete, ID conventions are strictly DB-generated UUIDs, and the test marker mechanism correctly utilizes cohort metadata rather than boolean flags. The script is largely idempotent, with only a minor gap identified in `ExperienceSlot` creation due to relative future dates. Finally, the inbound channel routes are fully aligned with the Amendment 009 Rev 3 booking wire shape, ensuring readiness for Coastal Corridor's implementation.
