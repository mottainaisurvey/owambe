// ─── experiences.ts ──────────────────────────────────
// Experiences mode: Experience management routes
//   GET    /api/experiences              — search experiences (public)
//   GET    /api/experiences/:slug        — get experience by slug (public)
//   POST   /api/experiences              — create experience (OPERATOR)
//   PUT    /api/experiences/:id          — update experience (OPERATOR)
//   POST   /api/experiences/:id/slots    — add availability slot (OPERATOR)
//   DELETE /api/experiences/:id/slots/:slotId — remove slot (OPERATOR)
//   GET    /api/experiences/:id/slots    — get available slots (public)
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { requireMode } from '../middleware/requireMode';
import { AppError } from '../utils/AppError';
import { geoSearch } from '../services/geo.service';

const router = Router();

// ─── GET /api/experiences ────────────────────────────
// Public: search experiences
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      city, experienceType, minPrice, maxPrice,
      lat, lng, radiusKm,
      date, guests,
      page = '1', limit = '20', featured
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, parseInt(limit as string));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      isActive: true,
      isApproved: true,  // E2: only surface admin-approved experiences to consumers
      ...(city && { city: { contains: city as string, mode: 'insensitive' } }),
      ...(experienceType && { experienceType: experienceType as any }),
      ...(featured === 'true' && { isFeatured: true }),
      ...(minPrice && { pricePerPerson: { gte: parseFloat(minPrice as string) } }),
      ...(maxPrice && { pricePerPerson: { lte: parseFloat(maxPrice as string) } }),
    };

    // Filter by date if provided — must have an available slot on that date
    if (date) {
      const dateStart = new Date(date as string);
      const dateEnd = new Date(dateStart);
      dateEnd.setDate(dateEnd.getDate() + 1);

      where.availableSlots = {
        some: {
          isActive: true,
          startTime: { gte: dateStart, lt: dateEnd },
          ...(guests && {
            capacity: { gt: prisma.experienceSlot.fields.bookedCount }
          })
        }
      };
    }

    let experiences = await prisma.experience.findMany({
      where,
      include: {
        operator: {
          select: { id: true, businessName: true, rating: true, isVerified: true }
        },
        availableSlots: {
          where: {
            isActive: true,
            startTime: { gte: new Date() }
          },
          orderBy: { startTime: 'asc' },
          take: 3,
        },
        _count: { select: { availableSlots: true } }
      },
      orderBy: [{ isFeatured: 'desc' }, { rating: 'desc' }],
      skip,
      take: limitNum,
    });

    // Apply geo filter if lat/lng/radius provided
    if (lat && lng && radiusKm) {
      experiences = geoSearch(
        experiences,
        parseFloat(lat as string),
        parseFloat(lng as string),
        parseFloat(radiusKm as string)
      ) as any[];
    }

    const total = await prisma.experience.count({ where });

    res.json({
      success: true,
      data: experiences,
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

// ─── GET /api/experiences/mine ──────────────────────
// OPERATOR only: list own experiences (all lifecycle states)
// NOTE: must be registered BEFORE /:slug to avoid 'mine' being treated as a slug
router.get('/mine',
  authenticate,
  requireRole('OPERATOR', 'ADMIN'),
  requireMode('EXPERIENCES'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;

      const { page = '1', limit = '20', status } = req.query;
      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(50, parseInt(limit as string));
      const skip = (pageNum - 1) * limitNum;

      // ADMIN can see all; OPERATOR sees only own
      const where: any = userRole === 'ADMIN'
        ? {}
        : { operator: { userId } };

      // Optional status filter: 'draft' | 'published' | 'archived'
      if (status === 'draft') {
        where.isActive = false;
        where.isApproved = false;
      } else if (status === 'published') {
        where.isActive = true;
      } else if (status === 'archived') {
        where.isActive = false;
      }

      const [experiences, total] = await Promise.all([
        prisma.experience.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
          include: {
            _count: { select: { experienceBookings: true, availableSlots: true } }
          }
        }),
        prisma.experience.count({ where })
      ]);

      res.json({
        success: true,
        data: experiences,
        pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/experiences/:slug ──────────────────────
// Public: get experience by slug
router.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const experience = await prisma.experience.findUnique({
      where: { slug: req.params.slug },
      include: {
        operator: {
          select: {
            id: true, businessName: true, rating: true,
            reviewCount: true, isVerified: true, bio: true
          }
        },
        availableSlots: {
          where: {
            isActive: true,
            startTime: { gte: new Date() }
          },
          orderBy: { startTime: 'asc' },
          take: 20,
        }
      }
    });

    if (!experience || !experience.isActive || !experience.isApproved) {
      throw new AppError('Experience not found', 404);  // E2: also gate on isApproved
    }

    res.json({ success: true, data: experience });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/experiences ───────────────────────────
// OPERATOR only: create a new experience
router.post('/',
  authenticate,
  requireRole('OPERATOR', 'ADMIN'),
  requireMode('EXPERIENCES'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;

      const operator = await prisma.operator.findUnique({ where: { userId } });
      if (!operator) throw new AppError('Operator profile not found. Please complete your operator profile first.', 404);

      const {
        name, description, experienceType, city, state, country,
        address, latitude, longitude, coverImageUrl, galleryUrls,
        durationMinutes, maxGroupSize, minGroupSize, pricePerPerson,
        currency, includes, requirements, languages, meetingDetails
      } = req.body;

      if (!name || !experienceType || !city || !pricePerPerson) {
        throw new AppError('name, experienceType, city, and pricePerPerson are required', 400);
      }

      // Generate slug
      const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      let slug = baseSlug;
      let counter = 1;
      while (await prisma.experience.findUnique({ where: { slug } })) {
        slug = `${baseSlug}-${counter++}`;
      }

      const experience = await prisma.experience.create({
        data: {
          operatorId: operator.id,
          name, slug, description: description || null,
          experienceType, city,
          state: state || null,
          country: country || 'NG',
          address: address || null,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          coverImageUrl: coverImageUrl || null,
          galleryUrls: galleryUrls || [],
          durationMinutes: durationMinutes ? parseInt(durationMinutes) : null,
          maxGroupSize: maxGroupSize ? parseInt(maxGroupSize) : null,
          minGroupSize: minGroupSize ? parseInt(minGroupSize) : 1,
          pricePerPerson: parseFloat(pricePerPerson),
          currency: currency || 'NGN',
          includes: includes || [],
          requirements: requirements || [],
          languages: languages || ['English'],
          meetingDetails: meetingDetails || null,
          // C1-b.0 lifecycle model: created in DRAFT state
          // isActive=false (operator-authority: not yet published)
          // isApproved=false (platform-authority: not yet approved)
          isActive: false,
          isApproved: false,
        }
      });

      res.status(201).json({ success: true, data: experience });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /api/experiences/:id ────────────────────────
// OPERATOR only: update experience
router.put('/:id',
  authenticate,
  requireRole('OPERATOR', 'ADMIN'),
  requireMode('EXPERIENCES'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;

      const experience = await prisma.experience.findUnique({
        where: { id: req.params.id },
        include: { operator: true }
      });

      if (!experience) throw new AppError('Experience not found', 404);
      if (userRole !== 'ADMIN' && experience.operator.userId !== userId) {
        throw new AppError('You do not have permission to update this experience', 403);
      }

      const updatable = [
        'name', 'description', 'city', 'state', 'country', 'address',
        'latitude', 'longitude', 'coverImageUrl', 'galleryUrls',
        'durationMinutes', 'maxGroupSize', 'minGroupSize', 'pricePerPerson',
        'currency', 'includes', 'requirements', 'languages',
        'isActive', 'isFeatured'
      ];

      const data: any = {};
      for (const key of updatable) {
        if (req.body[key] !== undefined) data[key] = req.body[key];
      }

      const updated = await prisma.experience.update({
        where: { id: req.params.id },
        data
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/experiences/:id/slots ─────────────────
// OPERATOR only: add availability slot
router.post('/:id/slots',
  authenticate,
  requireRole('OPERATOR', 'ADMIN'),
  requireMode('EXPERIENCES'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;

      const experience = await prisma.experience.findUnique({
        where: { id: req.params.id },
        include: { operator: true }
      });

      if (!experience) throw new AppError('Experience not found', 404);
      if (userRole !== 'ADMIN' && experience.operator.userId !== userId) {
        throw new AppError('You do not have permission to add slots to this experience', 403);
      }

      const { startTime, endTime, capacity } = req.body;

      if (!startTime || !endTime || !capacity) {
        throw new AppError('startTime, endTime, and capacity are required', 400);
      }

      const slot = await prisma.experienceSlot.create({
        data: {
          experienceId: experience.id,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          capacity: parseInt(capacity),
        }
      });

      res.status(201).json({ success: true, data: slot });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/experiences/:id/slots ──────────────────
// Public: get available slots for an experience
router.get('/:id/slots', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to } = req.query;

    const fromDate = from ? new Date(from as string) : new Date();
    const toDate = to ? new Date(to as string) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const slots = await prisma.experienceSlot.findMany({
      where: {
        experienceId: req.params.id,
        isActive: true,
        startTime: { gte: fromDate, lte: toDate }
      },
      orderBy: { startTime: 'asc' }
    });

    const slotsWithAvailability = slots.map(slot => ({
      ...slot,
      availableSpots: slot.capacity - slot.bookedCount,
      isSoldOut: slot.bookedCount >= slot.capacity,
    }));

    res.json({ success: true, data: slotsWithAvailability });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/experiences/:id/publish ──────────────
// C1-b.0 lifecycle: OPERATOR authority — publish (set isActive=true)
// Requires isApproved=true (platform must have approved first)
router.patch('/:id/publish',
  authenticate,
  requireRole('OPERATOR', 'ADMIN'),
  requireMode('EXPERIENCES'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;

      const experience = await prisma.experience.findUnique({
        where: { id: req.params.id },
        include: { operator: true }
      });

      if (!experience) throw new AppError('Experience not found', 404);
      if (userRole !== 'ADMIN' && experience.operator.userId !== userId) {
        throw new AppError('You do not have permission to publish this experience', 403);
      }

      // C1-b.0 authority matrix: operator can publish ONLY if platform has approved
      if (!experience.isApproved) {
        throw new AppError(
          'Experience must be approved by the platform before it can be published. Submit for review first.',
          403
        );
      }

      const updated = await prisma.experience.update({
        where: { id: req.params.id },
        data: { isActive: true }
      });

      res.json({ success: true, data: updated, message: 'Experience published successfully' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/experiences/:id/unpublish ────────────
// C1-b.0 lifecycle: OPERATOR authority — unpublish (set isActive=false)
// Operator can unpublish at any time (removes from customer visibility)
router.patch('/:id/unpublish',
  authenticate,
  requireRole('OPERATOR', 'ADMIN'),
  requireMode('EXPERIENCES'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;

      const experience = await prisma.experience.findUnique({
        where: { id: req.params.id },
        include: { operator: true }
      });

      if (!experience) throw new AppError('Experience not found', 404);
      if (userRole !== 'ADMIN' && experience.operator.userId !== userId) {
        throw new AppError('You do not have permission to unpublish this experience', 403);
      }

      const updated = await prisma.experience.update({
        where: { id: req.params.id },
        data: { isActive: false }
      });

      res.json({ success: true, data: updated, message: 'Experience unpublished successfully' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/experiences/:id/archive ──────────────
// C1-b.2 soft-delete: OPERATOR authority — archive (soft-delete, isActive=false)
// Hard deletion is NOT available per C1-b.2 mandate.
// Archive is functionally equivalent to unpublish but semantically distinct.
router.patch('/:id/archive',
  authenticate,
  requireRole('OPERATOR', 'ADMIN'),
  requireMode('EXPERIENCES'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;

      const experience = await prisma.experience.findUnique({
        where: { id: req.params.id },
        include: { operator: true }
      });

      if (!experience) throw new AppError('Experience not found', 404);
      if (userRole !== 'ADMIN' && experience.operator.userId !== userId) {
        throw new AppError('You do not have permission to archive this experience', 403);
      }

      // Prevent archiving if there are active/upcoming bookings
      const activeBookings = await prisma.experienceBooking.count({
        where: {
          experienceId: experience.id,
          status: { in: ['PENDING', 'CONFIRMED'] }
        }
      });

      if (activeBookings > 0) {
        throw new AppError(
          `Cannot archive: ${activeBookings} active booking(s) exist. Cancel or complete them first.`,
          409
        );
      }

      const updated = await prisma.experience.update({
        where: { id: req.params.id },
        data: { isActive: false }
      });

      res.json({ success: true, data: updated, message: 'Experience archived successfully' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
