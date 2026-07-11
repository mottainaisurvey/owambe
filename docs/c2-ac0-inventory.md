# OWB-C2 AC-0 Inventory Findings

## AC-0.1 Working Copy
- Branch: staging, HEAD: 138cd95 (local) / 0dbd640 (origin/staging — micro-supplement pushed after this)
- Working tree: clean
- Baseline for C2 implementation: 138cd95 (which is 0dbd640 + micro-supplement doc commit)

## AC-0.2 ExperienceSlot Model — FOUND (not assumed)
```
model ExperienceSlot {
  id              String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  experienceId    String     @db.Uuid
  startTime       DateTime
  endTime         DateTime
  capacity        Int
  bookedCount     Int        @default(0)
  isActive        Boolean    @default(true)
  createdAt       DateTime   @default(now())
  experience         Experience          @relation(...)
  experienceBookings ExperienceBooking[]
  @@index([experienceId])
  @@index([startTime])
  @@map("experience_slots")
}
```
Key findings:
- NO rrule/recurrenceRule field — not yet present
- NO timezone field — not yet present
- NO parentSlotId / seriesId — no recurrence grouping yet
- bookedCount already present (C3-ready capacity tracking)
- isActive present (soft-delete ready)
- ExperienceBooking→slot FK: slotId String @db.Uuid → ExperienceSlot @relation

## AC-0.2 ExperienceBooking→slot relation
- slotId: String @db.Uuid (NOT NULL — required FK)
- slot: ExperienceSlot @relation(fields: [slotId], references: [id])
- C3 will require a stable slot instance identity — confirmed by FK shape

## AC-0.3 C1 Slots UI Scaffold
- /dashboard/experiences/slots/page.tsx exists
- Has experience selector, one-off slot form (date, startTime, endTime, capacity)
- Calls POST /api/experiences/:id/slots
- Calls GET /api/experiences/:id/slots
- No recurrence UI yet — scaffold only handles one-off slots

## AC-0.4 Existing Slot Endpoints
- POST /api/experiences/:id/slots — OPERATOR only, creates one-off slot (startTime, endTime, capacity)
  - Own-experience check: experience.operator.userId === userId
  - No rrule support yet
- GET /api/experiences/:id/slots — PUBLIC, returns slots with availableSpots + isSoldOut
- DELETE /api/experiences/:id/slots/:slotId — LISTED IN HEADER COMMENT but NOT IMPLEMENTED (no router.delete found)

## AC-0.5 RRULE Library Landscape
- NO rrule library exists in any package.json
- Existing date library: date-fns ^3.6.0 (both API and web)
- Other relevant: bullmq ^5.76.5 + ioredis ^5.10.1 (queue infrastructure exists — trigger-5 relevant)
- No moment, luxon, dayjs present
- Introducing rrule library = trigger-4 flagged decision

## AC-0.6 Test Infrastructure
- Jest (API): ts-jest, testMatch: **/__tests__/**/*.test.ts, testTimeout: 30000
- 13 existing test suites, 195 tests passing
- DATABASE_URL required (CI provides Postgres 16 service container)
- Pattern: supertest against real DB, prisma migrate deploy in CI setup

## Note-2 Evidence (AC-7 carry-forward)
- Pre-C1 isActive default in schema: @default(true)
- C1 migration SQL: ALTER TABLE "experiences" ALTER COLUMN "isActive" SET DEFAULT false
  - Note in migration: "existing rows are not affected; new rows will default to false"
- Staging experience row count at time of C1 migration: 0 (confirmed via GET /api/experiences → total: 0)
- Therefore: the isActive default→false change was intentional AND safe — zero existing rows existed to be affected
