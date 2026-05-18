const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  if (!email) { console.error('ADMIN_EMAIL not set'); process.exit(1); }
  const updated = await prisma.user.update({
    where: { email },
    data: { role: 'ADMIN' },
    select: { id: true, email: true, role: true }
  });
  console.log('Promoted:', JSON.stringify(updated));
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
