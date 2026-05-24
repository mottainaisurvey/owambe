import 'dotenv/config';
import { PrismaClient, VendorCategory, VendorStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── PRODUCTION GUARD ────────────────────────────────────────────────────────
// The seed script MUST NOT run in production.
// Production admin accounts are created manually by the technical lead.
// See: docs/PRODUCTION_ADMIN_SETUP.md for the manual creation process.
//
// PRIMARY guard: NODE_ENV check.
if (process.env.NODE_ENV === 'production') {
  console.error('❌ SEED SCRIPT BLOCKED: NODE_ENV=production');
  console.error('   Seed scripts must not run in production environments.');
  console.error('   To create a production admin account, follow docs/PRODUCTION_ADMIN_SETUP.md');
  process.exit(1);
}

// SECONDARY guard: DATABASE_URL hostname check (belt-and-suspenders).
// Blocks the seed even when NODE_ENV is unset or set to 'development' but the
// DATABASE_URL points at a production host. Matches Railway production proxy
// hostnames and any URL containing 'prod' or 'production' as a segment.
const _dbUrl = process.env.DATABASE_URL ?? '';
const _prodHostPatterns = [
  /metro\.proxy\.rlwy\.net/i,       // Railway production public proxy
  /railway\.internal.*prod/i,        // Railway internal production hostname
  /[.\-_]prod[.\-_]/i,              // any hostname segment exactly 'prod'
  /[.\-_]production[.\-_]/i,        // any hostname segment exactly 'production'
];
if (_prodHostPatterns.some((re) => re.test(_dbUrl))) {
  console.error('❌ SEED SCRIPT BLOCKED: DATABASE_URL matches a production hostname pattern.');
  console.error('   URL:', _dbUrl.replace(/:([^@]+)@/, ':***@')); // mask password
  console.error('   Seed scripts must not run against production databases.');
  console.error('   To create a production admin account, follow docs/PRODUCTION_ADMIN_SETUP.md');
  process.exit(1);
}

async function main() {
  console.log('🌱 Seeding Owambe database (staging/development only)...');

  // ─── ADMIN USER (staging/dev only) ───────────────────────────────────────
  // NOTE: This admin account exists in staging and development only.
  // Production admin accounts are created manually — see docs/PRODUCTION_ADMIN_SETUP.md
  const adminHash = await bcrypt.hash('Admin@Owambe2026!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@owambe.com' },
    update: {},
    create: {
      email: 'admin@owambe.com',
      passwordHash: adminHash,
      firstName: 'Owambe',
      lastName: 'Admin',
      role: 'ADMIN',
      isEmailVerified: true,
    },
  });
  console.log('✅ Admin user created (staging/dev only)');

  // ─── TEST PLANNER (staging/dev only) ─────────────────────────────────────
  const plannerHash = await bcrypt.hash('Planner123!', 12);
  const plannerUser = await prisma.user.upsert({
    where: { email: 'planner@test.com' },
    update: {},
    create: {
      email: 'planner@test.com',
      passwordHash: plannerHash,
      firstName: 'Adaeze',
      lastName: 'Okonkwo',
      role: 'PLANNER',
      isEmailVerified: true,
      planner: {
        create: {
          companyName: 'AO Events Lagos',
          plan: 'GROWTH',
        }
      }
    },
    include: { planner: true }
  });
  console.log('✅ Test planner created (staging/dev only)');

  // ─── SEED VENDORS (Lagos) ────────────────────────────
  const vendors = [
    {
      businessName: 'Eko Hotel & Suites',
      category: VendorCategory.VENUE,
      description: 'Lagos\'s premier five-star event destination with world-class facilities for up to 3,000 guests. Situated on Victoria Island with stunning lagoon views.',
      shortBio: 'Premier Lagos event venue on Victoria Island',
      city: 'Lagos', state: 'Lagos', address: 'Plot 1415 Adetokunbo Ademola St, Victoria Island',
      latitude: 6.4281, longitude: 3.4219,
      minPrice: 2500000, maxPrice: 15000000,
      rating: 4.8, reviewCount: 142, bookingCount: 89,
      isInstantBook: false, commissionRate: 10,
    },
    {
      businessName: 'Balmoral Convention Center',
      category: VendorCategory.VENUE,
      description: 'Modern convention center in the heart of Lagos with flexible spaces for conferences, weddings and product launches. State-of-the-art AV included.',
      shortBio: 'Modern convention center, GRA Ikeja',
      city: 'Lagos', state: 'Lagos', address: 'Federal Palace Hotel, 6 Ahmadu Bello Way, Victoria Island',
      latitude: 6.4295, longitude: 3.4172,
      minPrice: 1800000, maxPrice: 8000000,
      rating: 4.6, reviewCount: 98, bookingCount: 67,
      isInstantBook: false, commissionRate: 10,
    },
    {
      businessName: 'Mama Cass Catering',
      category: VendorCategory.CATERING,
      description: 'Lagos\'s most loved catering company specialising in authentic Nigerian cuisine, continental dishes, and buffet setups for events of all sizes.',
      shortBio: 'Authentic Nigerian and continental catering',
      city: 'Lagos', state: 'Lagos', address: 'Surulere, Lagos',
      latitude: 6.5013, longitude: 3.3584,
      minPrice: 350000, maxPrice: 5000000,
      rating: 4.9, reviewCount: 231, bookingCount: 187,
      isInstantBook: true, commissionRate: 8,
    },
    {
      businessName: 'Spice Route Catering',
      category: VendorCategory.CATERING,
      description: 'Corporate and private event catering specialists. From canapes to full buffet service. Halal and dietary options available.',
      shortBio: 'Corporate catering specialists, Island Lagos',
      city: 'Lagos', state: 'Lagos', address: 'Lekki Phase 1, Lagos',
      latitude: 6.4477, longitude: 3.5005,
      minPrice: 500000, maxPrice: 8000000,
      rating: 4.7, reviewCount: 89, bookingCount: 72,
      isInstantBook: true, commissionRate: 8,
    },
    {
      businessName: 'Clicks & Flicks Photography',
      category: VendorCategory.PHOTOGRAPHY_VIDEO,
      description: 'Award-winning photography and videography studio capturing Lagos events in stunning detail. Drone coverage, same-day edits, and live streaming available.',
      shortBio: 'Award-winning event photography & video',
      city: 'Lagos', state: 'Lagos', address: 'Ikoyi, Lagos',
      latitude: 6.4550, longitude: 3.4351,
      minPrice: 250000, maxPrice: 2500000,
      rating: 4.9, reviewCount: 178, bookingCount: 145,
      isInstantBook: true, commissionRate: 8,
    },
    {
      businessName: 'SoundWave AV Productions',
      category: VendorCategory.AV_PRODUCTION,
      description: 'Full AV production house: PA systems, LED screens, stage lighting, DJ equipment and technical crew. Corporate and concert experience.',
      shortBio: 'Full AV production for any event size',
      city: 'Lagos', state: 'Lagos', address: 'Ikeja, Lagos',
      latitude: 6.6018, longitude: 3.3515,
      minPrice: 180000, maxPrice: 3000000,
      rating: 4.7, reviewCount: 112, bookingCount: 98,
      isInstantBook: true, commissionRate: 8,
    },
    {
      businessName: 'Petals & Blooms Décor',
      category: VendorCategory.DECOR_FLORALS,
      description: 'Transforming Lagos venues into breathtaking spaces. Floral arrangements, backdrop setups, centrepieces, and full event décor packages.',
      shortBio: 'Luxury floral and event décor Lagos',
      city: 'Lagos', state: 'Lagos', address: 'Magodo, Lagos',
      latitude: 6.6120, longitude: 3.3970,
      minPrice: 150000, maxPrice: 2000000,
      rating: 4.8, reviewCount: 167, bookingCount: 134,
      isInstantBook: true, commissionRate: 8,
    },
    {
      businessName: 'Asa Entertainment',
      category: VendorCategory.ENTERTAINMENT,
      description: 'Lagos\'s premier entertainment agency. Live bands, DJs, MCs, comedians, and traditional cultural performers for all event types.',
      shortBio: 'Live entertainment agency for events',
      city: 'Lagos', state: 'Lagos', address: 'Victoria Island, Lagos',
      latitude: 6.4280, longitude: 3.4200,
      minPrice: 200000, maxPrice: 5000000,
      rating: 4.6, reviewCount: 93, bookingCount: 78,
      isInstantBook: false, commissionRate: 10,
    },
    {
      businessName: 'Glow Up Studio',
      category: VendorCategory.MAKEUP_ARTIST,
      description: 'Mobile makeup and beauty studio for brides, corporate events, and photo shoots. Team of certified artists available for large groups.',
      shortBio: 'Mobile beauty studio for events & weddings',
      city: 'Lagos', state: 'Lagos', address: 'Lekki, Lagos',
      latitude: 6.4480, longitude: 3.5012,
      minPrice: 80000, maxPrice: 800000,
      rating: 4.9, reviewCount: 204, bookingCount: 189,
      isInstantBook: true, commissionRate: 8,
    },
    {
      businessName: 'Dr. Chidi Okeke — Keynote Speaker',
      category: VendorCategory.SPEAKER,
      description: 'Renowned leadership and business growth speaker with 20+ years experience. TEDx speaker, Forbes Africa contributor. Inspires Nigerian corporates.',
      shortBio: 'TEDx keynote speaker — leadership & growth',
      city: 'Lagos', state: 'Lagos', address: 'Victoria Island, Lagos',
      latitude: 6.4285, longitude: 3.4215,
      minPrice: 500000, maxPrice: 3000000,
      rating: 4.8, reviewCount: 56, bookingCount: 43,
      isInstantBook: false, commissionRate: 10,
    },
  ];

  for (const v of vendors) {
    const vendorHash = await bcrypt.hash('Vendor123!', 12);
    const email = `${v.businessName.toLowerCase().replace(/[^a-z]/g, '')}@owambe-vendor.com`;

    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash: vendorHash,
        firstName: v.businessName.split(' ')[0],
        lastName: 'Vendor',
        role: 'VENDOR',
        isEmailVerified: true,
        vendor: {
          create: {
            businessName: v.businessName,
            slug: v.businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'),
            category: v.category,
            description: v.description,
            shortBio: v.shortBio,
            status: VendorStatus.VERIFIED,
            city: v.city,
            state: v.state,
            address: v.address,
            country: 'Nigeria',
            latitude: v.latitude,
            longitude: v.longitude,
            minPrice: v.minPrice,
            maxPrice: v.maxPrice,
            rating: v.rating,
            reviewCount: v.reviewCount,
            bookingCount: v.bookingCount,
            isInstantBook: v.isInstantBook,
            commissionRate: v.commissionRate,
            currency: 'NGN',
            verifiedAt: new Date(),
            launchBonusActive: false,
          }
        }
      }
    });
    console.log(`✅ Vendor seeded: ${v.businessName}`);
  }

  // ─── SAMPLE EVENT ────────────────────────────────────
  const planner = await prisma.planner.findFirst({ where: { companyName: 'AO Events Lagos' } });
  if (planner) {
    await prisma.event.upsert({
      where: { slug: 'lagos-tech-summit-2026' },
      update: {},
      create: {
        plannerId: planner.id,
        name: 'Lagos Tech Summit 2026',
        slug: 'lagos-tech-summit-2026',
        description: 'Nigeria\'s premier technology conference bringing together 500+ founders, investors, and innovators.',
        type: 'Conference',
        format: 'IN_PERSON',
        status: 'PUBLISHED',
        startDate: new Date('2026-07-15T09:00:00'),
        endDate: new Date('2026-07-15T18:00:00'),
        venue: 'Eko Hotel & Suites',
        address: 'Plot 1415 Adetokunbo Ademola St',
        city: 'Lagos',
        maxCapacity: 500,
        isPublic: true,
        ticketTypes: {
          create: [
            { name: 'General Admission', price: 25000, currency: 'NGN', capacity: 400, status: 'ACTIVE' },
            { name: 'VIP Pass', price: 75000, currency: 'NGN', capacity: 80, status: 'ACTIVE' },
            { name: 'Startup Founder', price: 15000, currency: 'NGN', capacity: 100, status: 'ACTIVE' },
          ]
        }
      }
    });
    console.log('✅ Sample event seeded');
  }

  // ─── CHANNEL REGISTRY SEED (Brief A Rev 2 + Amendment-01) ─────────────────
  // Coastal Corridor channel: canonical staging seed.
  // hmacSecret sourced from CC_HMAC_SECRET env var (set in Railway staging Variables).
  // destinationUrl sourced from CC_WEBHOOK_INBOUND_URL env var (Amendment-01).
  // Seed is idempotent: upsert on slug; update:{} preserves any manual overrides.
  await prisma.channel.upsert({
    where: { slug: 'coastal-corridor' },
    create: {
      slug: 'coastal-corridor',
      name: 'Coastal Corridor',
      contactEmail: null,
      authScheme: 'HMAC_SHA256',
      hmacSecret: process.env.CC_HMAC_SECRET ?? null,
      signatureHeader: 'X-Signature',
      supportsStays: true,
      supportsExperiences: true,
      supportsEvents: false,
      supportsVendors: false,
      destinationUrl: process.env.CC_WEBHOOK_INBOUND_URL ?? null,
      state: 'ACTIVE',
    },
    update: {},
  });
  console.log('✅ Coastal Corridor channel seeded (Amendment-01)');

  console.log('\n🎉 Seed complete! Staging/dev test credentials:');
  console.log('   Admin:   admin@owambe.com / Admin@Owambe2026!');
  console.log('   Planner: planner@test.com / Planner123!');
  console.log('\n⚠️  These credentials are for staging/development ONLY.');
  console.log('   Production admin accounts must be created manually.');
  console.log('   See: docs/PRODUCTION_ADMIN_SETUP.md');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
