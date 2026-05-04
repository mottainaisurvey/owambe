/**
 * Phase A.5 — Idempotent Data Migration: Existing User Backfill
 *
 * Purpose:
 *   Ensures all existing Owambe Events users have the correct default values
 *   for the new Phase A.5 cohort and mode fields. This script is safe to run
 *   multiple times (idempotent) — it only updates rows that need updating.
 *
 * Run via:
 *   npx ts-node --transpile-only scripts/migrate-existing-users.ts
 *
 * Or compile and run:
 *   npx tsc && node dist/scripts/migrate-existing-users.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

async function main(): Promise<void> {
  console.log('=== Phase A.5 Existing User Data Migration ===');
  console.log(`Environment: ${process.env.NODE_ENV ?? 'unknown'}`);
  console.log(`Database: ${process.env.DATABASE_URL?.split('@')[1] ?? 'unknown'}`);
  console.log('');

  // ─── Step 1: Count users that need backfilling ──────────────────────────────
  const totalUsers = await prisma.user.count();
  const usersNeedingBackfill = await prisma.user.count({
    where: {
      OR: [
        { onboardedAt: null },
        // Users who have never had their availableModes explicitly set
        // (default is ['EVENTS'] so this catches new schema users too)
      ],
    },
  });

  console.log(`Total users: ${totalUsers}`);
  console.log(`Users needing backfill (onboardedAt is null): ${usersNeedingBackfill}`);
  console.log('');

  if (usersNeedingBackfill === 0) {
    console.log('✅ No users need backfilling. Migration is already complete.');
    return;
  }

  // ─── Step 2: Backfill existing users ────────────────────────────────────────
  // Rule: All existing users (pre-Phase A.5) are Events-mode users.
  // - activeMode = EVENTS (already the default, but ensure it)
  // - availableModes = [EVENTS] (already the default, but ensure it)
  // - cohortMember = false (they are not Coastal Corridor cohort members)
  // - channelOrigin = DIRECT (they signed up directly, not via a channel)
  // - preferredCurrency = NGN (default for Nigerian market)
  // - onboardedAt = createdAt (backfill with their account creation date)

  console.log('Backfilling existing users with Phase A.5 defaults...');

  const result = await prisma.user.updateMany({
    where: {
      onboardedAt: null,
    },
    data: {
      activeMode: 'EVENTS',
      availableModes: ['EVENTS'],
      cohortMember: false,
      channelOrigin: 'DIRECT',
      preferredCurrency: 'NGN',
      // onboardedAt will be set per-user below (can't use field reference in updateMany)
    },
  });

  console.log(`  Updated ${result.count} users with Phase A.5 defaults`);

  // ─── Step 3: Set onboardedAt = createdAt for each backfilled user ────────────
  // Prisma updateMany doesn't support field-to-field updates, so we do this
  // in batches using raw SQL for efficiency.
  console.log('  Setting onboardedAt = createdAt for backfilled users...');

  await prisma.$executeRaw`
    UPDATE users
    SET "onboardedAt" = "createdAt"
    WHERE "onboardedAt" IS NULL
  `;

  console.log('  ✅ onboardedAt backfilled from createdAt');

  // ─── Step 4: Verify the migration ───────────────────────────────────────────
  console.log('');
  console.log('=== Verification ===');

  const stillNeedingBackfill = await prisma.user.count({
    where: { onboardedAt: null },
  });

  const eventsOnlyUsers = await prisma.user.count({
    where: {
      activeMode: 'EVENTS',
      cohortMember: false,
    },
  });

  const cohortMembers = await prisma.user.count({
    where: { cohortMember: true },
  });

  console.log(`Users still needing backfill: ${stillNeedingBackfill}`);
  console.log(`Events-mode, non-cohort users: ${eventsOnlyUsers}`);
  console.log(`Cohort members: ${cohortMembers}`);
  console.log('');

  if (stillNeedingBackfill === 0) {
    console.log('✅ Migration complete. All existing users have been backfilled.');
  } else {
    console.error(`❌ ${stillNeedingBackfill} users still need backfilling. Check for errors.`);
    process.exit(1);
  }
}

main()
  .catch((err: Error) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
