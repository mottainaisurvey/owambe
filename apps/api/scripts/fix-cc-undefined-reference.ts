/**
 * One-time fix: Update the CC-undefined booking reference to a proper reference.
 * The booking was created with a missing cc_reservation_id in the test payload.
 * We assign it a deterministic reference based on its ID.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const booking = await prisma.stayBooking.findFirst({
    where: { reference: 'CC-undefined' },
  });

  if (!booking) {
    console.log('No CC-undefined booking found — nothing to fix.');
    return;
  }

  // Generate a deterministic reference from the booking ID
  const shortId = booking.id.replace(/-/g, '').substring(0, 8).toUpperCase();
  const newReference = `CC-TEST-${shortId}`;

  await prisma.stayBooking.update({
    where: { id: booking.id },
    data: { reference: newReference },
  });

  console.log(`Fixed booking ${booking.id}: reference updated from 'CC-undefined' to '${newReference}'`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
