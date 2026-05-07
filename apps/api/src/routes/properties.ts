// ─── properties.ts ───────────────────────────────────
// Stays mode: Property and Room management routes
//   GET    /api/properties              — search properties (public)
//   GET    /api/properties/:slug        — get property by slug (public)
//   GET    /api/properties/host         — list host's own properties (HOST)
//   POST   /api/properties              — create property (HOST) + CC push
//   PUT    /api/properties/:id          — update property (HOST) + CC sync
//   DELETE /api/properties/:id          — deactivate property (HOST) + CC deactivate
//   POST   /api/properties/:id/rooms    — add room to property (HOST)
//   PUT    /api/properties/:id/rooms/:roomId  — update room (HOST)
//   DELETE /api/properties/:id/rooms/:roomId  — delete room (HOST)
//   GET    /api/properties/:id/availability   — check room availability
//   GET    /api/properties/:propertyId/calendar — get calendar entries for a date range (HOST)
//   PUT    /api/properties/:propertyId/calendar — upsert calendar entries (HOST) + CC availability push
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { requireMode } from '../middleware/requireMode';
import { AppError } from '../utils/AppError';
import { geoSearch } from '../services/geo.service';
import { CoastalCorridorAdapter } from '../services/channels/adapters/coastal-corridor.adapter';
import type {
  CCPropertyRegistration,
  CCRoom,
  CCAvailabilityUpdate,
  CCAvailabilityEntry,
} from '../services/channels/adapters/coastal-corridor.adapter';
import { logger } from '../utils/logger';

const router = Router();
const ccAdapter = new CoastalCorridorAdapter();

// ─── Helpers ─────────────────────────────────────────

/**
 * Map Owambe PropertyType to Coastal Corridor property type string.
 */
function mapPropertyType(pt: string): CCPropertyRegistration['property_type'] {
  const map: Record<string, CCPropertyRegistration['property_type']> = {
    HOTEL: 'HOTEL',
    GUESTHOUSE: 'GUESTHOUSE',
    VILLA: 'BEACH_HOUSE',
    APARTMENT: 'SERVICED_APARTMENT',
    RESORT: 'RESORT',
    LODGE: 'HERITAGE',
    BOUTIQUE_HOTEL: 'HOTEL',
    SERVICED_APARTMENT: 'SERVICED_APARTMENT',
  };
  return map[pt] ?? 'OTHER';
}

/**
 * Map Owambe RoomType to Coastal Corridor room type string.
 */
function mapRoomType(rt: string): CCRoom['room_type'] {
  const map: Record<string, CCRoom['room_type']> = {
    STANDARD: 'STANDARD',
    DELUXE: 'DELUXE',
    SUITE: 'SUITE',
    EXECUTIVE: 'STANDARD',
    FAMILY: 'FAMILY',
    TWIN: 'STANDARD',
    SINGLE: 'STANDARD',
    PRESIDENTIAL: 'SUITE',
  };
  return map[rt] ?? 'OTHER';
}

/**
 * Build a CCPropertyRegistration payload from a Prisma property + host + rooms.
 */
function buildCCPropertyPayload(
  property: any,
  host: any,
  rooms: any[],
): CCPropertyRegistration {
  return {
    // Identity
    owambe_property_id: property.id,
    host_owambe_user_id: host.userId,
    host_user_id: host.userId,
    // Cohort
    cohort_member: host.user?.cohortMember ?? false,
    cohort_type: (host.user?.cohortType as CCPropertyRegistration['cohort_type']) ?? null,
    // Include cohort_code only when present — CC uses it for host auto-creation
    ...(host.user?.cohortCode ? { cohort_code: host.user.cohortCode } : {}),
    // Property details
    name: property.name,
    description: property.description ?? undefined,
    property_type: mapPropertyType(property.propertyType),
    // Flat address fields (CC's actual API shape)
    address_line1: property.address ?? property.name,
    city: property.city,
    state: property.state ?? property.city,
    country: property.country ?? 'NG',
    // Flat location fields
    latitude: property.latitude ? parseFloat(property.latitude.toString()) : 6.5244,
    longitude: property.longitude ? parseFloat(property.longitude.toString()) : 3.3792,
    // Extras
    amenities: property.amenities ?? [],
    photos: property.coverImageUrl
      ? [{ url: property.coverImageUrl, isPrimary: true }]
      : [],
    policies: {
      checkInTime: property.checkInTime ?? undefined,
      checkOutTime: property.checkOutTime ?? undefined,
      cancellationPolicy: 'MODERATE',
      houseRules: property.houseRules ? [property.houseRules] : [],
    },
    rooms: rooms.map(r => ({
      owambe_room_id: r.id,
      name: r.name,
      room_type: mapRoomType(r.roomType),
      capacity: r.capacity ?? 2,
      base_rate: parseFloat(r.pricePerNight.toString()),
      base_currency: (r.currency ?? 'NGN') as CCRoom['base_currency'],
    })),
    status: property.isActive ? 'ACTIVE' : 'INACTIVE',
  };
}

/**
 * Push property registration to Coastal Corridor and store the CC property ID.
 * Fire-and-forget with error logging — never blocks the host response.
 */
async function pushPropertyToCC(propertyId: string): Promise<void> {
  if (!ccAdapter.isConfigured()) {
    logger.info('[Properties] CC adapter not configured — skipping push', { propertyId });
    return;
  }

  try {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        host: { include: { user: true } },
        rooms: { where: { isActive: true } },
      },
    });

    if (!property || !property.host) return;

    const payload = buildCCPropertyPayload(property, property.host, property.rooms);
    const result = await ccAdapter.registerProperty(payload);
    // CC returns 'id' as the property identifier (not 'coastalCorridorPropertyId')
    const ccPropertyId = result.id ?? result.coastalCorridorPropertyId;

    await prisma.property.update({
      where: { id: propertyId },
      data: {
        coastalCorridorPropertyId: ccPropertyId,
        coastalCorridorListingUrl: result.listingUrl ?? null,
        coastalCorridorSyncedAt: new Date(),
      },
    });

    logger.info('[Properties] CC property push successful', {
      propertyId,
      ccPropertyId,
      alreadyExisted: result.alreadyExisted,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[Properties] CC property push failed', { propertyId, error: msg });
  }
}

// ─── GET /api/properties ─────────────────────────────
// Public: search properties with optional geo filter
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      city, propertyType, minPrice, maxPrice,
      lat, lng, radiusKm,
      checkIn, checkOut, guests,
      page = '1', limit = '20', featured
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, parseInt(limit as string));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      isActive: true,
      ...(city && { city: { contains: city as string, mode: 'insensitive' } }),
      ...(propertyType && { propertyType: propertyType as any }),
      ...(featured === 'true' && { isFeatured: true }),
    };

    // Price filter on rooms
    if (minPrice || maxPrice) {
      where.rooms = {
        some: {
          isActive: true,
          pricePerNight: {
            ...(minPrice && { gte: parseFloat(minPrice as string) }),
            ...(maxPrice && { lte: parseFloat(maxPrice as string) }),
          }
        }
      };
    }

    let properties = await prisma.property.findMany({
      where,
      include: {
        host: { select: { id: true, businessName: true, rating: true, isVerified: true } },
        rooms: {
          where: { isActive: true },
          select: {
            id: true, name: true, roomType: true,
            pricePerNight: true, currency: true, capacity: true
          },
          orderBy: { pricePerNight: 'asc' }
        },
        _count: { select: { rooms: true } }
      },
      orderBy: [{ isFeatured: 'desc' }, { rating: 'desc' }],
      skip,
      take: limitNum,
    });

    // Apply geo filter if lat/lng/radius provided
    if (lat && lng && radiusKm) {
      properties = geoSearch(
        properties,
        parseFloat(lat as string),
        parseFloat(lng as string),
        parseFloat(radiusKm as string)
      ) as any[];
    }

    const total = await prisma.property.count({ where });

    res.json({
      success: true,
      data: properties,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/properties/host ─────────────────────────
// HOST only: list own properties with CC sync status
router.get('/host',
  authenticate,
  requireRole('HOST', 'ADMIN'),
  requireMode('STAYS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const host = await prisma.host.findUnique({ where: { userId } });
      if (!host) throw new AppError('Host profile not found', 404);

      const properties = await prisma.property.findMany({
        where: { hostId: host.id },
        include: {
          rooms: {
            where: { isActive: true },
            select: {
              id: true, name: true, roomType: true,
              pricePerNight: true, currency: true, capacity: true,
              coastalCorridorRoomId: true,
            },
            orderBy: { pricePerNight: 'asc' }
          },
          _count: { select: { rooms: true, stayBookings: true } }
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ success: true, data: properties });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/properties/calendar-entries ────────────
// HOST only: flat calendar entries query by roomId + date range
// NOTE: Must be defined before /:slug to avoid route shadowing
router.get('/calendar-entries',
  authenticate,
  requireRole('HOST', 'ADMIN'),
  requireMode('STAYS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { roomId, start, end } = req.query;
      if (!roomId) throw new AppError('roomId is required', 400);
      const entries = await prisma.calendarEntry.findMany({
        where: {
          roomId: roomId as string,
          ...(start && end && {
            date: { gte: new Date(start as string), lte: new Date(end as string) },
          }),
        },
        orderBy: { date: 'asc' },
      });
      res.json({ success: true, data: entries });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/properties/:slug ───────────────────────
// Public: get property by slug
router.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const property = await prisma.property.findUnique({
      where: { slug: req.params.slug },
      include: {
        host: {
          select: {
            id: true, businessName: true, rating: true,
            reviewCount: true, isVerified: true, bio: true
          }
        },
        rooms: {
          where: { isActive: true },
          orderBy: { pricePerNight: 'asc' }
        },
      }
    });

    if (!property || !property.isActive) {
      throw new AppError('Property not found', 404);
    }

    res.json({ success: true, data: property });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/properties ────────────────────────────
// HOST only: create a new property + async CC push
router.post('/',
  authenticate,
  requireRole('HOST', 'ADMIN'),
  requireMode('STAYS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;

      const host = await prisma.host.findUnique({ where: { userId } });
      if (!host) throw new AppError('Host profile not found. Please complete your host profile first.', 404);

      const {
        name, description, propertyType, city, state, country,
        address, latitude, longitude, coverImageUrl, galleryUrls,
        amenities, checkInTime, checkOutTime, houseRules, cancellationPolicy
      } = req.body;

      if (!name || !propertyType || !city) {
        throw new AppError('name, propertyType, and city are required', 400);
      }

      // Generate slug from name
      const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      let slug = baseSlug;
      let counter = 1;
      while (await prisma.property.findUnique({ where: { slug } })) {
        slug = `${baseSlug}-${counter++}`;
      }

      const property = await prisma.property.create({
        data: {
          hostId: host.id,
          name, slug, description, propertyType, city,
          state: state || null,
          country: country || 'NG',
          address: address || null,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          coverImageUrl: coverImageUrl || null,
          galleryUrls: galleryUrls || [],
          amenities: amenities || [],
          checkInTime: checkInTime || null,
          checkOutTime: checkOutTime || null,
          houseRules: houseRules || null,
          cancellationPolicy: cancellationPolicy || null,
        }
      });

      // Fire-and-forget: push to Coastal Corridor after rooms are added
      // (CC registration is deferred to first room add, or can be triggered manually)
      // For immediate push: setImmediate(() => pushPropertyToCC(property.id));

      res.status(201).json({ success: true, data: property });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /api/properties/:id ─────────────────────────
// HOST only: update property + async CC sync
router.put('/:id',
  authenticate,
  requireRole('HOST', 'ADMIN'),
  requireMode('STAYS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;

      const property = await prisma.property.findUnique({
        where: { id: req.params.id },
        include: { host: true }
      });

      if (!property) throw new AppError('Property not found', 404);
      if (userRole !== 'ADMIN' && property.host.userId !== userId) {
        throw new AppError('You do not have permission to update this property', 403);
      }

      const updatable = [
        'name', 'description', 'city', 'state', 'country', 'address',
        'latitude', 'longitude', 'coverImageUrl', 'galleryUrls', 'amenities',
        'checkInTime', 'checkOutTime', 'houseRules', 'cancellationPolicy',
        'isActive', 'isFeatured'
      ];

      const data: any = {};
      for (const key of updatable) {
        if (req.body[key] !== undefined) data[key] = req.body[key];
      }

      const updated = await prisma.property.update({
        where: { id: req.params.id },
        data
      });

      // If property has a CC ID, push update asynchronously
      if (updated.coastalCorridorPropertyId && ccAdapter.isConfigured()) {
        setImmediate(async () => {
          try {
            await ccAdapter.updateProperty(updated.coastalCorridorPropertyId!, {
              name: updated.name,
              description: updated.description ?? undefined,
              amenities: updated.amenities,
              status: updated.isActive ? 'ACTIVE' : 'INACTIVE',
            });
            await prisma.property.update({
              where: { id: updated.id },
              data: { coastalCorridorSyncedAt: new Date() },
            });
            logger.info('[Properties] CC property update synced', { propertyId: updated.id });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error('[Properties] CC property update failed', { propertyId: updated.id, error: msg });
          }
        });
      }

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/properties/:id/rooms ──────────────────
// HOST only: add a room to a property + trigger CC push if first room
router.post('/:id/rooms',
  authenticate,
  requireRole('HOST', 'ADMIN'),
  requireMode('STAYS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;

      const property = await prisma.property.findUnique({
        where: { id: req.params.id },
        include: { host: true }
      });

      if (!property) throw new AppError('Property not found', 404);
      if (userRole !== 'ADMIN' && property.host.userId !== userId) {
        throw new AppError('You do not have permission to add rooms to this property', 403);
      }

      const {
        name, roomType, description, capacity, bedCount, bathCount,
        pricePerNight, currency, amenities, imageUrls
      } = req.body;

      if (!name || !roomType || !pricePerNight) {
        throw new AppError('name, roomType, and pricePerNight are required', 400);
      }

      const room = await prisma.room.create({
        data: {
          propertyId: property.id,
          name, roomType, description: description || null,
          capacity: capacity || 2,
          bedCount: bedCount || 1,
          bathCount: bathCount || 1,
          pricePerNight: parseFloat(pricePerNight),
          currency: currency || 'NGN',
          amenities: amenities || [],
          imageUrls: imageUrls || [],
        }
      });

      // After adding a room, push the full property to CC (idempotent — fire-and-forget)
      setImmediate(() => pushPropertyToCC(property.id));

      res.status(201).json({ success: true, data: room });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /api/properties/:id/rooms/:roomId ────────────
// HOST only: update a room
router.put('/:id/rooms/:roomId',
  authenticate,
  requireRole('HOST', 'ADMIN'),
  requireMode('STAYS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;

      const property = await prisma.property.findUnique({
        where: { id: req.params.id },
        include: { host: true }
      });

      if (!property) throw new AppError('Property not found', 404);
      if (userRole !== 'ADMIN' && property.host.userId !== userId) {
        throw new AppError('You do not have permission to update rooms for this property', 403);
      }

      const room = await prisma.room.findFirst({
        where: { id: req.params.roomId, propertyId: req.params.id }
      });
      if (!room) throw new AppError('Room not found', 404);

      const updatable = [
        'name', 'description', 'capacity', 'bedCount', 'bathCount',
        'pricePerNight', 'currency', 'amenities', 'imageUrls', 'isActive'
      ];

      const data: any = {};
      for (const key of updatable) {
        if (req.body[key] !== undefined) data[key] = req.body[key];
      }

      const updated = await prisma.room.update({
        where: { id: req.params.roomId },
        data
      });

      // Re-push property to CC to update room rates
      setImmediate(() => pushPropertyToCC(property.id));

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /api/properties/:id/rooms/:roomId ─────────
// HOST only: deactivate a room
router.delete('/:id/rooms/:roomId',
  authenticate,
  requireRole('HOST', 'ADMIN'),
  requireMode('STAYS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;

      const property = await prisma.property.findUnique({
        where: { id: req.params.id },
        include: { host: true }
      });

      if (!property) throw new AppError('Property not found', 404);
      if (userRole !== 'ADMIN' && property.host.userId !== userId) {
        throw new AppError('You do not have permission to delete rooms for this property', 403);
      }

      await prisma.room.update({
        where: { id: req.params.roomId },
        data: { isActive: false }
      });

      res.json({ success: true, message: 'Room deactivated' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /api/properties/:id ──────────────────────
// HOST only: deactivate property + CC deactivate
router.delete('/:id',
  authenticate,
  requireRole('HOST', 'ADMIN'),
  requireMode('STAYS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;

      const property = await prisma.property.findUnique({
        where: { id: req.params.id },
        include: { host: true }
      });

      if (!property) throw new AppError('Property not found', 404);
      if (userRole !== 'ADMIN' && property.host.userId !== userId) {
        throw new AppError('You do not have permission to delete this property', 403);
      }

      const updated = await prisma.property.update({
        where: { id: req.params.id },
        data: { isActive: false }
      });

      // Deactivate on CC if registered
      if (updated.coastalCorridorPropertyId && ccAdapter.isConfigured()) {
        setImmediate(async () => {
          try {
            await ccAdapter.deactivateProperty(updated.coastalCorridorPropertyId!);
            logger.info('[Properties] CC property deactivated', { propertyId: updated.id });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error('[Properties] CC deactivate failed', { propertyId: updated.id, error: msg });
          }
        });
      }

      res.json({ success: true, message: 'Property deactivated' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/properties/:id/availability ────────────
// Public: check room availability for date range
router.get('/:id/availability', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { checkIn, checkOut } = req.query;

    if (!checkIn || !checkOut) {
      throw new AppError('checkIn and checkOut dates are required', 400);
    }

    const checkInDate = new Date(checkIn as string);
    const checkOutDate = new Date(checkOut as string);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      throw new AppError('Invalid date format', 400);
    }

    if (checkOutDate <= checkInDate) {
      throw new AppError('checkOut must be after checkIn', 400);
    }

    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
      include: { rooms: { where: { isActive: true } } }
    });

    if (!property) throw new AppError('Property not found', 404);

    // Find rooms that are already booked for the requested period
    const bookedRoomIds = await prisma.stayBooking.findMany({
      where: {
        propertyId: req.params.id,
        status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        OR: [
          { checkInDate: { lt: checkOutDate }, checkOutDate: { gt: checkInDate } }
        ]
      },
      select: { roomId: true }
    });

    // Also check calendar entries for BLOCKED/MAINTENANCE dates
    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
    const dateRange: Date[] = [];
    for (let i = 0; i < nights; i++) {
      const d = new Date(checkInDate);
      d.setDate(d.getDate() + i);
      dateRange.push(d);
    }

    const blockedEntries = await prisma.calendarEntry.findMany({
      where: {
        propertyId: req.params.id,
        date: { gte: checkInDate, lt: checkOutDate },
        status: { in: ['BLOCKED', 'MAINTENANCE', 'BOOKED'] },
      },
      select: { roomId: true }
    });

    const bookedSet = new Set([
      ...bookedRoomIds.map(b => b.roomId),
      ...blockedEntries.map(e => e.roomId),
    ]);

    const availability = property.rooms.map(room => ({
      ...room,
      isAvailable: !bookedSet.has(room.id),
    }));

    res.json({
      success: true,
      data: {
        propertyId: property.id,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        nights,
        rooms: availability,
      }
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/properties/:propertyId/calendar ────────
// HOST only: get calendar entries for a room/property date range
router.get('/:propertyId/calendar',
  authenticate,
  requireRole('HOST', 'ADMIN'),
  requireMode('STAYS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;
      const { roomId, startDate, endDate } = req.query;

      const property = await prisma.property.findUnique({
        where: { id: req.params.propertyId },
        include: { host: true }
      });

      if (!property) throw new AppError('Property not found', 404);
      if (userRole !== 'ADMIN' && property.host.userId !== userId) {
        throw new AppError('Access denied', 403);
      }

      const start = startDate ? new Date(startDate as string) : new Date();
      const end = endDate ? new Date(endDate as string) : new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);

      const entries = await prisma.calendarEntry.findMany({
        where: {
          propertyId: req.params.propertyId,
          ...(roomId && { roomId: roomId as string }),
          date: { gte: start, lte: end },
        },
        orderBy: [{ roomId: 'asc' }, { date: 'asc' }],
      });

      // Also get bookings in this range to overlay
      const bookings = await prisma.stayBooking.findMany({
        where: {
          propertyId: req.params.propertyId,
          status: { in: ['CONFIRMED', 'CHECKED_IN', 'PENDING'] },
          OR: [{ checkInDate: { lt: end }, checkOutDate: { gt: start } }],
        },
        select: {
          id: true, reference: true, roomId: true,
          checkInDate: true, checkOutDate: true,
          guestName: true, status: true, channelOrigin: true,
          totalAmount: true, currency: true,
        },
      });

      res.json({
        success: true,
        data: {
          propertyId: property.id,
          startDate: start,
          endDate: end,
          calendarEntries: entries,
          bookings,
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /api/properties/:propertyId/calendar ────────
// HOST only: upsert calendar entries (block dates, set pricing) + CC availability push
router.put('/:propertyId/calendar',
  authenticate,
  requireRole('HOST', 'ADMIN'),
  requireMode('STAYS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;

      const property = await prisma.property.findUnique({
        where: { id: req.params.propertyId },
        include: { host: true }
      });

      if (!property) throw new AppError('Property not found', 404);
      if (userRole !== 'ADMIN' && property.host.userId !== userId) {
        throw new AppError('Access denied', 403);
      }

      const { entries } = req.body as {
        entries: Array<{
          roomId: string;
          date: string;
          status?: string;
          rateOverride?: number;
          currency?: string;
          minimumStay?: number;
          maximumStay?: number;
          closedReason?: string;
        }>;
      };

      if (!Array.isArray(entries) || entries.length === 0) {
        throw new AppError('entries array is required', 400);
      }

      // Upsert each entry
      const upserted = await Promise.all(
        entries.map(e =>
          prisma.calendarEntry.upsert({
            where: { roomId_date: { roomId: e.roomId, date: new Date(e.date) } },
            create: {
              propertyId: req.params.propertyId,
              roomId: e.roomId,
              date: new Date(e.date),
              status: (e.status as any) ?? 'AVAILABLE',
              rateOverride: e.rateOverride ?? null,
              currency: e.currency ?? null,
              minimumStay: e.minimumStay ?? null,
              maximumStay: e.maximumStay ?? null,
              closedReason: e.closedReason ?? null,
              ccSyncStatus: 'PENDING',
              createdByUserId: userId,
            },
            update: {
              status: (e.status as any) ?? 'AVAILABLE',
              rateOverride: e.rateOverride ?? null,
              currency: e.currency ?? null,
              minimumStay: e.minimumStay ?? null,
              maximumStay: e.maximumStay ?? null,
              closedReason: e.closedReason ?? null,
              ccSyncStatus: 'PENDING',
            },
          })
        )
      );

      // Push availability updates to CC asynchronously
      if (property.coastalCorridorPropertyId && ccAdapter.isConfigured()) {
        setImmediate(async () => {
          try {
            // Group entries by roomId
            const byRoom = new Map<string, typeof entries>();
            for (const e of entries) {
              if (!byRoom.has(e.roomId)) byRoom.set(e.roomId, []);
              byRoom.get(e.roomId)!.push(e);
            }

            for (const [roomId, roomEntries] of byRoom) {
              const room = await prisma.room.findUnique({ where: { id: roomId } });
              if (!room) continue;

              const dates = roomEntries.map(e => new Date(e.date)).sort((a, b) => a.getTime() - b.getTime());
              const startDate = dates[0].toISOString().split('T')[0];
              const endDate = dates[dates.length - 1].toISOString().split('T')[0];

              const ccEntries: CCAvailabilityEntry[] = roomEntries.map(e => ({
                date: new Date(e.date).toISOString().split('T')[0],
                available: !e.status || e.status === 'AVAILABLE',
                rate: e.rateOverride ?? parseFloat(room.pricePerNight.toString()),
                currency: (e.currency ?? room.currency ?? 'NGN') as CCAvailabilityEntry['currency'],
                minimumStay: e.minimumStay ?? undefined,
                maximumStay: e.maximumStay ?? undefined,
                closedReason: e.closedReason ?? undefined,
              }));

              const update: CCAvailabilityUpdate = {
                owambeRoomId: roomId,
                startDate,
                endDate,
                entries: ccEntries,
              };

              await ccAdapter.updateAvailability(property.coastalCorridorPropertyId!, update);

              // Mark entries as synced
              await prisma.calendarEntry.updateMany({
                where: {
                  roomId,
                  date: { gte: dates[0], lte: dates[dates.length - 1] },
                },
                data: { ccSyncStatus: 'SYNCED', ccSyncedAt: new Date() },
              });
            }

            logger.info('[Properties] CC availability push complete', {
              propertyId: req.params.propertyId,
              entryCount: entries.length,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error('[Properties] CC availability push failed', {
              propertyId: req.params.propertyId,
              error: msg,
            });
            // Mark entries as failed
            await prisma.calendarEntry.updateMany({
              where: {
                propertyId: req.params.propertyId,
                ccSyncStatus: 'PENDING',
              },
              data: { ccSyncStatus: 'FAILED' },
            });
          }
        });
      }

      res.json({
        success: true,
        data: {
          upserted: upserted.length,
          ccSyncQueued: !!(property.coastalCorridorPropertyId && ccAdapter.isConfigured()),
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/properties/:id/push-to-cc ─────────────
// HOST only: manually trigger CC registration push
router.post('/:id/push-to-cc',
  authenticate,
  requireRole('HOST', 'ADMIN'),
  requireMode('STAYS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;

      const property = await prisma.property.findUnique({
        where: { id: req.params.id },
        include: { host: true }
      });

      if (!property) throw new AppError('Property not found', 404);
      if (userRole !== 'ADMIN' && property.host.userId !== userId) {
        throw new AppError('Access denied', 403);
      }

      if (!ccAdapter.isConfigured()) {
        throw new AppError('Coastal Corridor integration is not configured', 503);
      }

      await pushPropertyToCC(property.id);

      const updated = await prisma.property.findUnique({ where: { id: property.id } });

      res.json({
        success: true,
        data: {
          propertyId: property.id,
          coastalCorridorPropertyId: updated?.coastalCorridorPropertyId,
          coastalCorridorListingUrl: updated?.coastalCorridorListingUrl,
          coastalCorridorSyncedAt: updated?.coastalCorridorSyncedAt,
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/properties/host/bookings ──────────────
// HOST only: list all bookings across host's properties
router.get('/host/bookings',
  authenticate,
  requireRole('HOST', 'ADMIN'),
  requireMode('STAYS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const { roomId, status, page = '1', limit = '50' } = req.query;

      const host = await prisma.host.findUnique({ where: { userId } });
      if (!host) throw new AppError('Host profile not found', 404);

      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(100, parseInt(limit as string));

      const where: any = {
        property: { hostId: host.id },
        ...(roomId && { roomId: roomId as string }),
        ...(status && status !== 'ALL' && { status: status as any }),
      };

      const [bookings, total] = await Promise.all([
        prisma.stayBooking.findMany({
          where,
          include: {
            room: { select: { id: true, name: true, roomType: true } },
            property: { select: { id: true, name: true, city: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        prisma.stayBooking.count({ where }),
      ]);

      res.json({
        success: true,
        data: bookings,
        pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/properties/host/dashboard-stats ────────
// HOST only: summary stats for the Stays dashboard landing page
router.get('/host/dashboard-stats',
  authenticate,
  requireRole('HOST', 'ADMIN'),
  requireMode('STAYS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const host = await prisma.host.findUnique({ where: { userId } });
      if (!host) throw new AppError('Host profile not found', 404);

      const propertyIds = await prisma.property
        .findMany({ where: { hostId: host.id }, select: { id: true } })
        .then(ps => ps.map(p => p.id));

      const [
        totalProperties,
        totalRooms,
        confirmedBookings,
        checkedInBookings,
        pendingBookings,
        coastalCorridorSyncedProperties,
        revenueAgg,
        recentBookings,
      ] = await Promise.all([
        prisma.property.count({ where: { hostId: host.id } }),
        prisma.room.count({ where: { propertyId: { in: propertyIds }, isActive: true } }),
        prisma.stayBooking.count({ where: { propertyId: { in: propertyIds }, status: 'CONFIRMED' } }),
        prisma.stayBooking.count({ where: { propertyId: { in: propertyIds }, status: 'CHECKED_IN' } }),
        prisma.stayBooking.count({ where: { propertyId: { in: propertyIds }, status: 'PENDING' } }),
        prisma.property.count({ where: { hostId: host.id, coastalCorridorPropertyId: { not: null } } }),
        prisma.stayBooking.aggregate({
          where: { propertyId: { in: propertyIds }, status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] } },
          _sum: { netToHost: true, totalAmount: true },
        }),
        prisma.stayBooking.findMany({
          where: { propertyId: { in: propertyIds } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true, reference: true, guestName: true,
            checkInDate: true, checkOutDate: true, status: true, channelOrigin: true,
            property: { select: { name: true } },
          },
        }),
      ]);

      const totalNetRevenue = parseFloat(
        (revenueAgg._sum.netToHost ?? revenueAgg._sum.totalAmount ?? 0).toString()
      );

      res.json({
        success: true,
        data: {
          totalProperties,
          totalRooms,
          confirmedBookings,
          checkedInBookings,
          pendingBookings,
          coastalCorridorSyncedProperties,
          totalNetRevenue,
          currency: 'NGN',
          recentBookings: recentBookings.map(b => ({
            ...b,
            propertyName: b.property.name,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/properties/calendar-entries ────────────
// HOST only: flat calendar entries query by roomId + date range
router.get('/calendar-entries',
  authenticate,
  requireRole('HOST', 'ADMIN'),
  requireMode('STAYS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { roomId, start, end } = req.query;
      if (!roomId) throw new AppError('roomId is required', 400);

      const entries = await prisma.calendarEntry.findMany({
        where: {
          roomId: roomId as string,
          ...(start && end && {
            date: { gte: new Date(start as string), lte: new Date(end as string) },
          }),
        },
        orderBy: { date: 'asc' },
      });

      res.json({ success: true, data: entries });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/properties/calendar-entries ───────────
// HOST only: create a single calendar entry
router.post('/calendar-entries',
  authenticate,
  requireRole('HOST', 'ADMIN'),
  requireMode('STAYS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const { roomId, date, isBlocked, blockReason, overridePrice, minimumNights, notes } = req.body;
      if (!roomId || !date) throw new AppError('roomId and date are required', 400);

      // Verify host owns the room
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: { property: { include: { host: true } } },
      });
      if (!room) throw new AppError('Room not found', 404);
      if (room.property.host.userId !== userId) throw new AppError('Access denied', 403);

      const entry = await prisma.calendarEntry.upsert({
        where: { roomId_date: { roomId, date: new Date(date) } },
        create: {
          propertyId: room.propertyId,
          roomId,
          date: new Date(date),
          status: isBlocked ? 'BLOCKED' : 'AVAILABLE',
          closedReason: blockReason ?? null,
          rateOverride: overridePrice ?? null,
          minimumStay: minimumNights ?? null,
          ccSyncStatus: 'PENDING',
          createdByUserId: userId,
        },
        update: {
          status: isBlocked ? 'BLOCKED' : 'AVAILABLE',
          closedReason: blockReason ?? null,
          rateOverride: overridePrice ?? null,
          minimumStay: minimumNights ?? null,
          ccSyncStatus: 'PENDING',
        },
      });

      // Push availability update to CC asynchronously
      if (room.property.coastalCorridorPropertyId && ccAdapter.isConfigured()) {
        setImmediate(async () => {
          try {
            const update: CCAvailabilityUpdate = {
              owambeRoomId: roomId,
              startDate: new Date(date).toISOString().split('T')[0],
              endDate: new Date(date).toISOString().split('T')[0],
              entries: [{
                date: new Date(date).toISOString().split('T')[0],
                available: !isBlocked,
                rate: overridePrice ?? parseFloat(room.pricePerNight.toString()),
                currency: (room.currency ?? 'NGN') as CCAvailabilityEntry['currency'],
                minimumStay: minimumNights ?? undefined,
                closedReason: blockReason ?? undefined,
              }],
            };
            await ccAdapter.updateAvailability(room.property.coastalCorridorPropertyId!, update);
            await prisma.calendarEntry.update({
              where: { id: entry.id },
              data: { ccSyncStatus: 'SYNCED', ccSyncedAt: new Date() },
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error('[Properties] CC calendar entry sync failed', { roomId, date, error: msg });
            await prisma.calendarEntry.update({
              where: { id: entry.id },
              data: { ccSyncStatus: 'FAILED' },
            }).catch(() => {});
          }
        });
      }

      res.status(201).json({ success: true, data: entry });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /api/properties/calendar-entries/:id ────────
// HOST only: update a calendar entry by id
router.put('/calendar-entries/:id',
  authenticate,
  requireRole('HOST', 'ADMIN'),
  requireMode('STAYS'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const { isBlocked, blockReason, overridePrice, minimumNights, notes } = req.body;

      const existing = await prisma.calendarEntry.findUnique({
        where: { id: req.params.id },
        include: { room: { include: { property: { include: { host: true } } } } },
      });
      if (!existing) throw new AppError('Calendar entry not found', 404);
      if (existing.room.property.host.userId !== userId) throw new AppError('Access denied', 403);

      const updated = await prisma.calendarEntry.update({
        where: { id: req.params.id },
        data: {
          status: isBlocked ? 'BLOCKED' : 'AVAILABLE',
          closedReason: blockReason ?? null,
          rateOverride: overridePrice ?? null,
          minimumStay: minimumNights ?? null,
          ccSyncStatus: 'PENDING',
        },
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

