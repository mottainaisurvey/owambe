import 'dotenv/config';
import {
  BookingStatus,
  BookingType,
  CalendarEntryStatus,
  ExperienceBookingStatus,
  ExperienceType,
  PaymentStatus,
  PlatformMode,
  PrismaClient,
  PropertyType,
  RoomType,
  StayBookingStatus,
  UserRole,
  VendorCategory,
  VendorStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SEED_MARKER = 'T1_STAGING_TEST_DATA';
const TEST_PASSWORD = process.env.STAGING_TEST_PASSWORD;
const ALLOW_SEED = process.env.OWAMBE_ALLOW_STAGING_TEST_DATA_SEED === 'true';
const DATABASE_URL = process.env.DATABASE_URL ?? '';

const TEST_ACCOUNTS = {
  consumer: 'staging-consumer-1@owambe.test',
  host: 'staging-host-1@owambe.test',
  vendor: 'staging-vendor-1@owambe.test',
  operator: 'staging-experience-operator-1@owambe.test',
  planner: 'staging-planner-1@owambe.test',
  admin: 'staging-admin-1@owambe.test',
} as const;

const PLACEHOLDER_IMAGES = [
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80',
];

function maskDatabaseUrl(url: string) {
  return url.replace(/:([^:@/]+)@/, ':***@');
}

function assertStagingOnly() {
  if (!ALLOW_SEED) {
    throw new Error('Refusing to seed: set OWAMBE_ALLOW_STAGING_TEST_DATA_SEED=true for intentional staging-only execution.');
  }

  if (!TEST_PASSWORD || TEST_PASSWORD.length < 12) {
    throw new Error('Refusing to seed: STAGING_TEST_PASSWORD must be set and at least 12 characters. Do not commit this value.');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV=production. T1 test data is staging-only.');
  }

  const productionPatterns = [
    /metro\.proxy\.rlwy\.net/i,
    /railway\.internal.*prod/i,
    /[._-]prod[._-]/i,
    /[._-]production[._-]/i,
    /owambe.*production/i,
  ];

  if (productionPatterns.some((pattern) => pattern.test(DATABASE_URL))) {
    throw new Error(`Refusing to seed: DATABASE_URL resembles production (${maskDatabaseUrl(DATABASE_URL)}).`);
  }
}

function futureDate(daysFromNow: number, hour = 12) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

// Convention-C.1: deterministic slot dates anchored to a fixed reference date.
// These constants replace futureDate() for ExperienceSlot startTime/endTime so
// that re-running the seed script produces the same slot rows (idempotent).
// Dates are set far enough in the future that they remain valid for bilateral
// end-to-end testing through 2027.
const SLOT_ANCHOR_DATES: Record<string, { start: Date; end: Date }> = {
  't1-lagos-food-culture-walk': {
    start: new Date('2027-03-01T15:00:00Z'),
    end:   new Date('2027-03-01T18:00:00Z'),
  },
  't1-private-afrobeats-nightlife': {
    start: new Date('2027-03-08T15:00:00Z'),
    end:   new Date('2027-03-08T18:00:00Z'),
  },
  // Coordinated 2-set: USD fixture experience slot
  't1-diaspora-cooking-masterclass': {
    start: new Date('2027-03-15T15:00:00Z'),
    end:   new Date('2027-03-15T18:00:00Z'),
  },
};

function dateOnly(daysFromNow: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

async function upsertUser(params: {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  activeMode: PlatformMode;
  availableModes: PlatformMode[];
}) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD!, 12);

  return prisma.user.upsert({
    where: { email: params.email },
    update: {
      passwordHash,
      role: params.role,
      firstName: params.firstName,
      lastName: params.lastName,
      isEmailVerified: true,
      isActive: true,
      activeMode: params.activeMode,
      availableModes: { set: params.availableModes },
      cohortMember: true,
      cohortType: 'INTERNAL',
      cohortCode: SEED_MARKER,
      onboardedAt: new Date(),
    },
    create: {
      email: params.email,
      passwordHash,
      firstName: params.firstName,
      lastName: params.lastName,
      role: params.role,
      isEmailVerified: true,
      isActive: true,
      activeMode: params.activeMode,
      availableModes: params.availableModes,
      cohortMember: true,
      cohortType: 'INTERNAL',
      cohortCode: SEED_MARKER,
      onboardedAt: new Date(),
    },
  });
}

async function main() {
  assertStagingOnly();
  console.log('🌱 Seeding T1 reusable staging test data...');
  console.log(`Database target: ${maskDatabaseUrl(DATABASE_URL) || '[DATABASE_URL unset]'}`);

  const consumerUser = await upsertUser({
    email: TEST_ACCOUNTS.consumer,
    firstName: 'Tola',
    lastName: 'Consumer',
    role: UserRole.CONSUMER,
    activeMode: PlatformMode.EVENTS,
    availableModes: [PlatformMode.EVENTS],
  });

  const hostUser = await upsertUser({
    email: TEST_ACCOUNTS.host,
    firstName: 'Hauwa',
    lastName: 'Host',
    role: UserRole.HOST,
    activeMode: PlatformMode.STAYS,
    availableModes: [PlatformMode.STAYS],
  });

  const vendorUser = await upsertUser({
    email: TEST_ACCOUNTS.vendor,
    firstName: 'Victor',
    lastName: 'Vendor',
    role: UserRole.VENDOR,
    activeMode: PlatformMode.EVENTS,
    availableModes: [PlatformMode.EVENTS, PlatformMode.STAYS, PlatformMode.EXPERIENCES],
  });

  const operatorUser = await upsertUser({
    email: TEST_ACCOUNTS.operator,
    firstName: 'Ebi',
    lastName: 'Operator',
    role: UserRole.OPERATOR,
    activeMode: PlatformMode.EXPERIENCES,
    availableModes: [PlatformMode.EXPERIENCES],
  });

  const plannerUser = await upsertUser({
    email: TEST_ACCOUNTS.planner,
    firstName: 'Ngozi',
    lastName: 'Planner',
    role: UserRole.PLANNER,
    activeMode: PlatformMode.EVENTS,
    availableModes: [PlatformMode.EVENTS],
  });

  const adminUser = await upsertUser({
    email: TEST_ACCOUNTS.admin,
    firstName: 'Staging',
    lastName: 'Admin',
    role: UserRole.ADMIN,
    activeMode: PlatformMode.EVENTS,
    availableModes: [PlatformMode.EVENTS, PlatformMode.STAYS, PlatformMode.EXPERIENCES],
  });

  const consumer = await prisma.consumer.upsert({
    where: { userId: consumerUser.id },
    update: { city: 'Lagos', state: 'Lagos' },
    create: { userId: consumerUser.id, city: 'Lagos', state: 'Lagos' },
  });

  const host = await prisma.host.upsert({
    where: { userId: hostUser.id },
    update: {
      businessName: 'T1 Coastal Stays Host',
      city: 'Lagos',
      state: 'Lagos',
      phone: '+2348000000101',
      bio: `${SEED_MARKER}: reusable host account for Stays portal verification.`,
      isVerified: true,
      verifiedAt: new Date(),
      bankCode: 'TEST',
      bankAccountNumber: '0000000000',
      bankAccountName: 'T1 Coastal Stays Host',
      paystackSubAccountCode: 'TEST_STAGING_HOST_SUBACCOUNT',
    },
    create: {
      userId: hostUser.id,
      businessName: 'T1 Coastal Stays Host',
      city: 'Lagos',
      state: 'Lagos',
      phone: '+2348000000101',
      bio: `${SEED_MARKER}: reusable host account for Stays portal verification.`,
      isVerified: true,
      verifiedAt: new Date(),
      bankCode: 'TEST',
      bankAccountNumber: '0000000000',
      bankAccountName: 'T1 Coastal Stays Host',
      paystackSubAccountCode: 'TEST_STAGING_HOST_SUBACCOUNT',
    },
  });

  const vendor = await prisma.vendor.upsert({
    where: { userId: vendorUser.id },
    update: {
      businessName: 'T1 Lens & Light Studio',
      category: VendorCategory.PHOTOGRAPHY_VIDEO,
      description: `${SEED_MARKER}: verified staging vendor for platform and booking verification.`,
      city: 'Lagos',
      state: 'Lagos',
      country: 'NG',
      address: '12 Test Market Road, Victoria Island, Lagos',
      coverImageUrl: PLACEHOLDER_IMAGES[1],
      galleryUrls: PLACEHOLDER_IMAGES,
      basePrice: '250000',
      minPrice: '150000',
      maxPrice: '650000',
      status: VendorStatus.VERIFIED,
      isActive: true,
      isFeatured: true,
      verifiedAt: new Date(),
      paystackSubAccountCode: 'TEST_STAGING_VENDOR_SUBACCOUNT',
      bankCode: 'TEST',
      bankAccountNumber: '1111111111',
      bankAccountName: 'T1 Lens and Light Studio',
      phone: '+2348000000102',
      shortBio: 'Staging photography and video vendor for regression checks.',
      serviceRadius: 50,
      isInstantBook: true,
      slug: 't1-lens-light-studio',
    },
    create: {
      userId: vendorUser.id,
      businessName: 'T1 Lens & Light Studio',
      category: VendorCategory.PHOTOGRAPHY_VIDEO,
      description: `${SEED_MARKER}: verified staging vendor for platform and booking verification.`,
      city: 'Lagos',
      state: 'Lagos',
      country: 'NG',
      address: '12 Test Market Road, Victoria Island, Lagos',
      coverImageUrl: PLACEHOLDER_IMAGES[1],
      galleryUrls: PLACEHOLDER_IMAGES,
      basePrice: '250000',
      minPrice: '150000',
      maxPrice: '650000',
      status: VendorStatus.VERIFIED,
      isActive: true,
      isFeatured: true,
      verifiedAt: new Date(),
      paystackSubAccountCode: 'TEST_STAGING_VENDOR_SUBACCOUNT',
      bankCode: 'TEST',
      bankAccountNumber: '1111111111',
      bankAccountName: 'T1 Lens and Light Studio',
      phone: '+2348000000102',
      shortBio: 'Staging photography and video vendor for regression checks.',
      serviceRadius: 50,
      isInstantBook: true,
      slug: 't1-lens-light-studio',
    },
  });

  const operator = await prisma.operator.upsert({
    where: { userId: operatorUser.id },
    update: {
      businessName: 'T1 Lagos Experience Co',
      city: 'Lagos',
      state: 'Lagos',
      phone: '+2348000000103',
      bio: `${SEED_MARKER}: reusable operator account for Experiences verification.`,
      isVerified: true,
      verifiedAt: new Date(),
      bankCode: 'TEST',
      bankAccountNumber: '2222222222',
      bankAccountName: 'T1 Lagos Experience Co',
      paystackSubAccountCode: 'TEST_STAGING_OPERATOR_SUBACCOUNT',
    },
    create: {
      userId: operatorUser.id,
      businessName: 'T1 Lagos Experience Co',
      city: 'Lagos',
      state: 'Lagos',
      phone: '+2348000000103',
      bio: `${SEED_MARKER}: reusable operator account for Experiences verification.`,
      isVerified: true,
      verifiedAt: new Date(),
      bankCode: 'TEST',
      bankAccountNumber: '2222222222',
      bankAccountName: 'T1 Lagos Experience Co',
      paystackSubAccountCode: 'TEST_STAGING_OPERATOR_SUBACCOUNT',
    },
  });

  const planner = await prisma.planner.upsert({
    where: { userId: plannerUser.id },
    update: {
      businessName: 'T1 Event Planner',
      companyName: 'T1 Event Planner',
      businessType: 'Corporate and private celebrations',
      city: 'Lagos',
      state: 'Lagos',
      website: 'https://staging.owambe.test/t1-planner',
      bio: `${SEED_MARKER}: reusable planner account for Events verification.`,
      isVerified: true,
    },
    create: {
      userId: plannerUser.id,
      businessName: 'T1 Event Planner',
      companyName: 'T1 Event Planner',
      businessType: 'Corporate and private celebrations',
      city: 'Lagos',
      state: 'Lagos',
      website: 'https://staging.owambe.test/t1-planner',
      bio: `${SEED_MARKER}: reusable planner account for Events verification.`,
      isVerified: true,
    },
  });

  const propertySpecs = [
    {
      slug: 't1-lekki-family-villa',
      name: 'T1 Lekki Family Villa',
      description: `${SEED_MARKER}: available villa with family-friendly amenities.`,
      propertyType: PropertyType.VILLA,
      city: 'Lekki',
      state: 'Lagos',
      address: '10 Test Palm Avenue, Lekki Phase 1, Lagos',
      roomName: 'Family Suite',
      roomType: RoomType.FAMILY,
      capacity: 6,
      pricePerNight: '85000',
      currency: 'NGN',
      blockedOffset: 21,
      calendarStatus: CalendarEntryStatus.AVAILABLE,
    },
    {
      slug: 't1-ikoyi-serviced-apartment',
      name: 'T1 Ikoyi Serviced Apartment',
      description: `${SEED_MARKER}: serviced apartment with one deliberately blocked date.`,
      propertyType: PropertyType.SERVICED_APARTMENT,
      city: 'Ikoyi',
      state: 'Lagos',
      address: '4 Test Bourdillon Close, Ikoyi, Lagos',
      roomName: 'Executive Apartment',
      roomType: RoomType.EXECUTIVE,
      capacity: 3,
      pricePerNight: '120000',
      currency: 'NGN',
      blockedOffset: 28,
      calendarStatus: CalendarEntryStatus.BLOCKED,
    },
    {
      slug: 't1-victoria-island-boutique-stay',
      name: 'T1 Victoria Island Boutique Stay',
      description: `${SEED_MARKER}: featured boutique stay sample for host and admin verification.`,
      propertyType: PropertyType.BOUTIQUE_HOTEL,
      city: 'Victoria Island',
      state: 'Lagos',
      address: '7 Test Akin Adesola Street, Victoria Island, Lagos',
      roomName: 'Presidential Suite',
      roomType: RoomType.PRESIDENTIAL,
      capacity: 4,
      pricePerNight: '180000',
      currency: 'NGN',
      blockedOffset: 35,
      calendarStatus: CalendarEntryStatus.MAINTENANCE,
    },
    // ── Coordinated 2-set: USD fixture property ───────────────────────────────
    {
      slug: 't1-diaspora-waterfront-suite',
      name: 'T1 Diaspora Waterfront Suite',
      description: `${SEED_MARKER}: USD-priced property for diaspora/international bilateral test fixture.`,
      propertyType: PropertyType.SERVICED_APARTMENT,
      city: 'Victoria Island',
      state: 'Lagos',
      address: '1 Test Waterfront Drive, Victoria Island, Lagos',
      roomName: 'Waterfront Studio',
      roomType: RoomType.STANDARD,
      capacity: 2,
      pricePerNight: '120',   // USD 120 per night
      currency: 'USD',
      blockedOffset: 42,
      calendarStatus: CalendarEntryStatus.AVAILABLE,
    },
  ];

  const properties = [] as Array<{ id: string; slug: string; name: string; rooms: Array<{ id: string; name: string }> }>;

  for (const [index, spec] of propertySpecs.entries()) {
    const property = await prisma.property.upsert({
      where: { slug: spec.slug },
      update: {
        hostId: host.id,
        name: spec.name,
        description: spec.description,
        propertyType: spec.propertyType,
        city: spec.city,
        state: spec.state,
        country: 'NG',
        address: spec.address,
        coverImageUrl: PLACEHOLDER_IMAGES[index % PLACEHOLDER_IMAGES.length],
        galleryUrls: PLACEHOLDER_IMAGES,
        amenities: ['Wi-Fi', 'Air conditioning', 'Generator backup', 'Security', 'Parking'],
        checkInTime: '14:00',
        checkOutTime: '11:00',
        houseRules: 'Staging test data only. Do not use for real guest-facing QA.',
        cancellationPolicy: 'Flexible test policy',
        isActive: true,
        isFeatured: index === 2,
      },
      create: {
        hostId: host.id,
        slug: spec.slug,
        name: spec.name,
        description: spec.description,
        propertyType: spec.propertyType,
        city: spec.city,
        state: spec.state,
        country: 'NG',
        address: spec.address,
        coverImageUrl: PLACEHOLDER_IMAGES[index % PLACEHOLDER_IMAGES.length],
        galleryUrls: PLACEHOLDER_IMAGES,
        amenities: ['Wi-Fi', 'Air conditioning', 'Generator backup', 'Security', 'Parking'],
        checkInTime: '14:00',
        checkOutTime: '11:00',
        houseRules: 'Staging test data only. Do not use for real guest-facing QA.',
        cancellationPolicy: 'Flexible test policy',
        isActive: true,
        isFeatured: index === 2,
      },
    });

    const existingRoom = await prisma.room.findFirst({
      where: { propertyId: property.id, name: spec.roomName },
    });

    const room = existingRoom
      ? await prisma.room.update({
          where: { id: existingRoom.id },
          data: {
            roomType: spec.roomType,
            description: `${SEED_MARKER}: reusable room attached to ${spec.name}.`,
            capacity: spec.capacity,
            bedCount: Math.max(1, Math.ceil(spec.capacity / 2)),
            bathCount: 2,
            pricePerNight: spec.pricePerNight,
            currency: spec.currency,
            amenities: ['Breakfast available', 'Workspace', 'Smart TV'],
            imageUrls: PLACEHOLDER_IMAGES,
            isActive: true,
          },
        })
      : await prisma.room.create({
          data: {
            propertyId: property.id,
            name: spec.roomName,
            roomType: spec.roomType,
            description: `${SEED_MARKER}: reusable room attached to ${spec.name}.`,
            capacity: spec.capacity,
            bedCount: Math.max(1, Math.ceil(spec.capacity / 2)),
            bathCount: 2,
            pricePerNight: spec.pricePerNight,
            currency: spec.currency,
            amenities: ['Breakfast available', 'Workspace', 'Smart TV'],
            imageUrls: PLACEHOLDER_IMAGES,
            isActive: true,
          },
        });

    await prisma.calendarEntry.upsert({
      where: { roomId_date: { roomId: room.id, date: dateOnly(spec.blockedOffset) } },
      update: {
        propertyId: property.id,
        status: spec.calendarStatus,
        rateOverride: spec.pricePerNight,
        currency: spec.currency,
        minimumStay: 1,
        maximumStay: 14,
        closedReason: spec.calendarStatus === CalendarEntryStatus.AVAILABLE ? null : `${SEED_MARKER}: mixed availability sample.`,
        createdByUserId: hostUser.id,
      },
      create: {
        propertyId: property.id,
        roomId: room.id,
        date: dateOnly(spec.blockedOffset),
        status: spec.calendarStatus,
        rateOverride: spec.pricePerNight,
        currency: spec.currency,
        minimumStay: 1,
        maximumStay: 14,
        closedReason: spec.calendarStatus === CalendarEntryStatus.AVAILABLE ? null : `${SEED_MARKER}: mixed availability sample.`,
        createdByUserId: hostUser.id,
      },
    });

    properties.push({ id: property.id, slug: property.slug, name: property.name, rooms: [{ id: room.id, name: room.name }] });
  }

  const vendorPackage = await prisma.vendorPackage.upsert({
    where: { id: (await prisma.vendorPackage.findFirst({ where: { vendorId: vendor.id, name: 'T1 Half-Day Photo & Video Coverage' }, select: { id: true } }))?.id ?? '00000000-0000-0000-0000-000000000000' },
    update: {
      description: `${SEED_MARKER}: reusable vendor package for RFQ and instant-book checks.`,
      price: '250000',
      currency: 'NGN',
      duration: '4 hours',
      includes: ['Lead photographer', 'Highlight reel', 'Edited gallery'],
      isActive: true,
    },
    create: {
      vendorId: vendor.id,
      name: 'T1 Half-Day Photo & Video Coverage',
      description: `${SEED_MARKER}: reusable vendor package for RFQ and instant-book checks.`,
      price: '250000',
      currency: 'NGN',
      duration: '4 hours',
      includes: ['Lead photographer', 'Highlight reel', 'Edited gallery'],
      isActive: true,
    },
  });

  const existingPortfolio = await prisma.portfolioItem.findFirst({ where: { vendorId: vendor.id, caption: `${SEED_MARKER}: portfolio sample` } });
  if (existingPortfolio) {
    await prisma.portfolioItem.update({
      where: { id: existingPortfolio.id },
      data: { url: PLACEHOLDER_IMAGES[0], mediaType: 'image', isMain: true, sortOrder: 1 },
    });
  } else {
    await prisma.portfolioItem.create({
      data: {
        vendorId: vendor.id,
        url: PLACEHOLDER_IMAGES[0],
        caption: `${SEED_MARKER}: portfolio sample`,
        mediaType: 'image',
        isMain: true,
        sortOrder: 1,
      },
    });
  }

  const experienceSpecs = [
    {
      slug: 't1-lagos-food-culture-walk',
      name: 'T1 Lagos Food & Culture Walk',
      type: ExperienceType.FOOD_TASTING,
      price: '45000',
      currency: 'NGN',
      duration: 180,
      maxGroupSize: 12,
    },
    {
      slug: 't1-private-afrobeats-nightlife',
      name: 'T1 Private Afrobeats Nightlife',
      type: ExperienceType.NIGHTLIFE,
      price: '95000',
      currency: 'NGN',
      duration: 240,
      maxGroupSize: 8,
    },
    // ── Coordinated 2-set: USD fixture experience ──────────────────────────────
    {
      slug: 't1-diaspora-cooking-masterclass',
      name: 'T1 Diaspora Cooking Masterclass',
      type: ExperienceType.FOOD_TASTING,
      price: '55',          // USD 55 per person
      currency: 'USD',
      duration: 150,
      maxGroupSize: 10,
    },
  ];

  const experiences = [] as Array<{ id: string; slug: string; name: string; slotId: string }>;

  for (const [index, spec] of experienceSpecs.entries()) {
    const experience = await prisma.experience.upsert({
      where: { slug: spec.slug },
      update: {
        operatorId: operator.id,
        name: spec.name,
        description: `${SEED_MARKER}: reusable experience for operator and consumer verification.`,
        experienceType: spec.type,
        city: 'Lagos',
        state: 'Lagos',
        country: 'NG',
        address: '1 Test Marina Road, Lagos',
        coverImageUrl: PLACEHOLDER_IMAGES[index],
        galleryUrls: PLACEHOLDER_IMAGES,
        durationMinutes: spec.duration,
        maxGroupSize: spec.maxGroupSize,
        minGroupSize: 1,
        pricePerPerson: spec.price,
        currency: spec.currency,
        includes: ['Guide', 'Refreshments', 'Local transport'],
        requirements: ['Comfortable shoes', 'Staging test use only'],
        languages: ['English'],
        isActive: true,
        isFeatured: index === 0,
      },
      create: {
        operatorId: operator.id,
        slug: spec.slug,
        name: spec.name,
        description: `${SEED_MARKER}: reusable experience for operator and consumer verification.`,
        experienceType: spec.type,
        city: 'Lagos',
        state: 'Lagos',
        country: 'NG',
        address: '1 Test Marina Road, Lagos',
        coverImageUrl: PLACEHOLDER_IMAGES[index % PLACEHOLDER_IMAGES.length],
        galleryUrls: PLACEHOLDER_IMAGES,
        durationMinutes: spec.duration,
        maxGroupSize: spec.maxGroupSize,
        minGroupSize: 1,
        pricePerPerson: spec.price,
        currency: spec.currency,
        includes: ['Guide', 'Refreshments', 'Local transport'],
        requirements: ['Comfortable shoes', 'Staging test use only'],
        languages: ['English'],
        isActive: true,
        isFeatured: index === 0,
      },
    });

    // Convention-C.1: use deterministic anchor dates instead of futureDate() so
    // that re-running the seed produces the same ExperienceSlot row (idempotent).
    const anchorDates = SLOT_ANCHOR_DATES[spec.slug];
    if (!anchorDates) throw new Error(`No SLOT_ANCHOR_DATES entry for experience slug: ${spec.slug}`);
    const existingSlot = await prisma.experienceSlot.findFirst({ where: { experienceId: experience.id, startTime: anchorDates.start } });
    const slot = existingSlot
      ? await prisma.experienceSlot.update({
          where: { id: existingSlot.id },
          data: { endTime: anchorDates.end, capacity: spec.maxGroupSize, bookedCount: index === 0 ? 2 : 0, isActive: true },
        })
      : await prisma.experienceSlot.create({
          data: { experienceId: experience.id, startTime: anchorDates.start, endTime: anchorDates.end, capacity: spec.maxGroupSize, bookedCount: index === 0 ? 2 : 0, isActive: true },
        });

    experiences.push({ id: experience.id, slug: experience.slug, name: experience.name, slotId: slot.id });
  }

  const [confirmedProperty, pendingProperty, cancelledProperty] = properties;
  const confirmedRoom = confirmedProperty.rooms[0];
  const pendingRoom = pendingProperty.rooms[0];
  const cancelledRoom = cancelledProperty.rooms[0];

  const stayBookings = [
    {
      reference: 'T1-STAY-CONFIRMED-001',
      propertyId: confirmedProperty.id,
      roomId: confirmedRoom.id,
      checkInDate: dateOnly(12),
      checkOutDate: dateOnly(15),
      nights: 3,
      totalAmount: '255000',
      depositAmount: '85000',
      status: StayBookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.DEPOSIT_PAID,
      confirmedAt: new Date(),
    },
    {
      reference: 'T1-STAY-PENDING-001',
      propertyId: pendingProperty.id,
      roomId: pendingRoom.id,
      checkInDate: dateOnly(18),
      checkOutDate: dateOnly(20),
      nights: 2,
      totalAmount: '240000',
      depositAmount: '80000',
      status: StayBookingStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      confirmedAt: null,
    },
    {
      reference: 'T1-STAY-CANCELLED-001',
      propertyId: cancelledProperty.id,
      roomId: cancelledRoom.id,
      checkInDate: dateOnly(24),
      checkOutDate: dateOnly(26),
      nights: 2,
      totalAmount: '360000',
      depositAmount: '120000',
      status: StayBookingStatus.CANCELLED,
      paymentStatus: PaymentStatus.REFUNDED,
      confirmedAt: null,
      cancelledAt: new Date(),
      cancellationReason: `${SEED_MARKER}: cancellation sample.`,
      cancelledBy: consumerUser.id,
    },
  ];

  for (const booking of stayBookings) {
    await prisma.stayBooking.upsert({
      where: { reference: booking.reference },
      update: {
        propertyId: booking.propertyId,
        roomId: booking.roomId,
        guestUserId: consumerUser.id,
        guestId: consumerUser.id,
        guestName: 'Tola Consumer',
        guestEmail: TEST_ACCOUNTS.consumer,
        guestPhone: '+2348000000199',
        checkInDate: booking.checkInDate,
        checkOutDate: booking.checkOutDate,
        nights: booking.nights,
        guestCount: 2,
        totalAmount: booking.totalAmount,
        depositAmount: booking.depositAmount,
        currency: 'NGN',
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        specialRequests: `${SEED_MARKER}: reusable stay booking sample.`,
        confirmedAt: booking.confirmedAt,
        cancelledAt: 'cancelledAt' in booking ? booking.cancelledAt : null,
        cancellationReason: 'cancellationReason' in booking ? booking.cancellationReason : null,
        cancelledBy: 'cancelledBy' in booking ? booking.cancelledBy : null,
      },
      create: {
        reference: booking.reference,
        propertyId: booking.propertyId,
        roomId: booking.roomId,
        guestUserId: consumerUser.id,
        guestId: consumerUser.id,
        guestName: 'Tola Consumer',
        guestEmail: TEST_ACCOUNTS.consumer,
        guestPhone: '+2348000000199',
        checkInDate: booking.checkInDate,
        checkOutDate: booking.checkOutDate,
        nights: booking.nights,
        guestCount: 2,
        totalAmount: booking.totalAmount,
        depositAmount: booking.depositAmount,
        currency: 'NGN',
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        specialRequests: `${SEED_MARKER}: reusable stay booking sample.`,
        confirmedAt: booking.confirmedAt,
        cancelledAt: 'cancelledAt' in booking ? booking.cancelledAt : null,
        cancellationReason: 'cancellationReason' in booking ? booking.cancellationReason : null,
        cancelledBy: 'cancelledBy' in booking ? booking.cancelledBy : null,
      },
    });
  }

  const vendorBooking = await prisma.booking.upsert({
    where: { reference: 'T1-VENDOR-RFQ-001' },
    update: {
      vendorId: vendor.id,
      plannerId: planner.id,
      consumerId: consumer.id,
      packageId: vendorPackage.id,
      bookingType: BookingType.RFQ,
      status: BookingStatus.PENDING,
      eventDate: futureDate(40, 18),
      eventDescription: `${SEED_MARKER}: vendor RFQ sample for downstream verification.`,
      guestCount: 120,
      totalAmount: '250000',
      depositAmount: '75000',
      commissionAmount: '25000',
      vendorAmount: '225000',
      currency: 'NGN',
      paymentStatus: PaymentStatus.PENDING,
      bookerEmail: TEST_ACCOUNTS.consumer,
      bookerName: 'Tola Consumer',
      notes: `${SEED_MARKER}: reusable vendor RFQ engagement.`,
    },
    create: {
      reference: 'T1-VENDOR-RFQ-001',
      vendorId: vendor.id,
      plannerId: planner.id,
      consumerId: consumer.id,
      packageId: vendorPackage.id,
      bookingType: BookingType.RFQ,
      status: BookingStatus.PENDING,
      eventDate: futureDate(40, 18),
      eventDescription: `${SEED_MARKER}: vendor RFQ sample for downstream verification.`,
      guestCount: 120,
      totalAmount: '250000',
      depositAmount: '75000',
      commissionAmount: '25000',
      vendorAmount: '225000',
      currency: 'NGN',
      paymentStatus: PaymentStatus.PENDING,
      bookerEmail: TEST_ACCOUNTS.consumer,
      bookerName: 'Tola Consumer',
      notes: `${SEED_MARKER}: reusable vendor RFQ engagement.`,
    },
  });

  await prisma.quote.upsert({
    where: { bookingId: vendorBooking.id },
    update: {
      vendorId: vendor.id,
      lineItems: [
        { label: 'Photography coverage', amount: 180000 },
        { label: 'Highlight video', amount: 70000 },
      ],
      totalAmount: '250000',
      validUntil: futureDate(14, 23),
      notes: `${SEED_MARKER}: reusable RFQ quote sample.`,
      status: 'SENT',
    },
    create: {
      bookingId: vendorBooking.id,
      vendorId: vendor.id,
      lineItems: [
        { label: 'Photography coverage', amount: 180000 },
        { label: 'Highlight video', amount: 70000 },
      ],
      totalAmount: '250000',
      validUntil: futureDate(14, 23),
      notes: `${SEED_MARKER}: reusable RFQ quote sample.`,
      status: 'SENT',
    },
  });

  await prisma.experienceBooking.upsert({
    where: { reference: 'T1-EXPERIENCE-CONFIRMED-001' },
    update: {
      experienceId: experiences[0].id,
      slotId: experiences[0].slotId,
      guestUserId: consumerUser.id,
      guestId: consumerUser.id,
      guestName: 'Tola Consumer',
      guestEmail: TEST_ACCOUNTS.consumer,
      guestPhone: '+2348000000199',
      guestCount: 2,
      totalAmount: '90000',
      currency: 'NGN',
      status: ExperienceBookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.DEPOSIT_PAID,
      specialRequests: `${SEED_MARKER}: reusable experience booking sample.`,
      confirmedAt: new Date(),
      participantNames: ['Tola Consumer', 'Guest Participant'],
      pickupRequested: false,
      depositAmount: '30000',
    },
    create: {
      reference: 'T1-EXPERIENCE-CONFIRMED-001',
      experienceId: experiences[0].id,
      slotId: experiences[0].slotId,
      guestUserId: consumerUser.id,
      guestId: consumerUser.id,
      guestName: 'Tola Consumer',
      guestEmail: TEST_ACCOUNTS.consumer,
      guestPhone: '+2348000000199',
      guestCount: 2,
      totalAmount: '90000',
      currency: 'NGN',
      status: ExperienceBookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.DEPOSIT_PAID,
      specialRequests: `${SEED_MARKER}: reusable experience booking sample.`,
      confirmedAt: new Date(),
      participantNames: ['Tola Consumer', 'Guest Participant'],
      pickupRequested: false,
      depositAmount: '30000',
    },
  });

  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(TEST_ACCOUNTS) } },
    select: { id: true, email: true, role: true, activeMode: true, availableModes: true, isEmailVerified: true, onboardedAt: true },
    orderBy: { email: 'asc' },
  });

  const summary = {
    marker: SEED_MARKER,
    accounts: users,
    hostId: host.id,
    vendorId: vendor.id,
    operatorId: operator.id,
    plannerId: planner.id,
    consumerId: consumer.id,
    properties,
    vendorPackageId: vendorPackage.id,
    vendorBookingReference: vendorBooking.reference,
    experiences,
    stayBookingReferences: stayBookings.map((booking) => booking.reference),
    experienceBookingReference: 'T1-EXPERIENCE-CONFIRMED-001',
  };

  console.log('✅ T1 staging test data seeded successfully.');
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error('❌ T1 staging test data seed failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
