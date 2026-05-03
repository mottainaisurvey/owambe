// ─── properties.ts ───────────────────────────────────
// Stays mode: Property and Room management routes
//   GET    /api/properties              — search properties (public)
//   GET    /api/properties/:slug        — get property by slug (public)
//   POST   /api/properties              — create property (HOST)
//   PUT    /api/properties/:id          — update property (HOST)
//   DELETE /api/properties/:id          — delete property (HOST)
//   POST   /api/properties/:id/rooms    — add room to property (HOST)
//   PUT    /api/properties/:id/rooms/:roomId  — update room (HOST)
//   DELETE /api/properties/:id/rooms/:roomId  — delete room (HOST)
//   GET    /api/properties/:id/availability   — check room availability
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { requireMode } from '../middleware/requireMode';
import { AppError } from '../utils/AppError';
import { geoSearch } from '../services/geo.service';

const router = Router();

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
// HOST only: create a new property
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

      res.status(201).json({ success: true, data: property });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /api/properties/:id ─────────────────────────
// HOST only: update property
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

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/properties/:id/rooms ──────────────────
// HOST only: add a room to a property
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

      res.status(201).json({ success: true, data: room });
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

    const bookedSet = new Set(bookedRoomIds.map(b => b.roomId));

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
        nights: Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)),
        rooms: availability,
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
