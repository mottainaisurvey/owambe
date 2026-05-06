/**
 * One-off script: set cohort code CC-G7E0VM4G on the test HOST account
 * for the Owambe → Coastal Corridor integration test.
 *
 * Run via: railway run npx ts-node scripts/set-cohort-code.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'host@test.com';
  const cohortCode = 'CC-G7E0VM4G';
  const cohortEndDate = new Date('2026-06-05T14:43:58Z');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { email },
    data: {
      cohortCode,
      cohortMember: true,
      cohortType: 'COASTAL_CORRIDOR_HOST' as any,
      cohortStartDate: new Date(),
      cohortEndDate,
    },
    select: {
      id: true,
      email: true,
      cohortCode: true,
      cohortMember: true,
      cohortType: true,
      cohortStartDate: true,
      cohortEndDate: true,
    },
  });

  console.log('Updated user:');
  console.log(JSON.stringify(updated, null, 2));
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
