import { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { body, param } from 'express-validator';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { AppError } from '../utils/AppError';
import { cacheSet, cacheDel, cacheGet } from '../services/cache.service';
import { logger } from '../utils/logger';

export const tenantsRouter = Router();

// ─── RESOLVE TENANT (public — called by whitelabel app) ──
// GET /api/tenants/resolve?subdomain=techfest
// GET /api/tenants/resolve?domain=events.techlagos.com
tenantsRouter.get('/resolve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { subdomain, domain } = req.query as Record<string, string>;
    if (!subdomain && !domain) {
      throw new AppError('Provide subdomain or domain query param', 400);
    }

    const cacheKey = subdomain ? `tenant:sub:${subdomain}` : `tenant:domain:${domain}`;
    const cached = await cacheGet<any>(cacheKey);
    if (cached) return res.json({ success: true, tenant: cached });

    const tenant = await prisma.tenant.findFirst({
      where: subdomain ? { subdomain, isActive: true } : { customDomain: domain, isActive: true },
      include: {
        planner: {
          select: {
            id: true,
            companyName: true,
            plan: true,
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    if (!tenant) throw new AppError('Tenant not found', 404);
    if (tenant.planner.plan !== 'SCALE') throw new AppError('White-label requires Scale plan', 403);

    await cacheSet(cacheKey, tenant, 300); // 5-min cache
    res.json({ success: true, tenant });
  } catch (err) { next(err); }
});

// ─── GET my tenant ─────────────────────────────────────
tenantsRouter.get('/me', authenticate, requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const planner = await prisma.planner.findFirst({ where: { userId } });
    if (!planner) throw new AppError('Planner not found', 404);

    const tenant = await prisma.tenant.findFirst({
      where: { plannerId: planner.id },
      include: { planner: { select: { plan: true } } },
    });

    res.json({ success: true, tenant });
  } catch (err) { next(err); }
});

// ─── CREATE tenant (Scale plan only) ──────────────────
tenantsRouter.post('/',
  authenticate, requireRole('PLANNER'),
  [
    body('subdomain').trim().toLowerCase()
      .matches(/^[a-z0-9-]{3,30}$/).withMessage('Subdomain must be 3-30 lowercase letters, numbers or hyphens'),
    body('name').trim().notEmpty().isLength({ max: 100 }),
    body('tagline').optional().trim().isLength({ max: 200 }),
    body('primaryColor').optional().matches(/^#[0-9A-Fa-f]{6}$/),
    body('accentColor').optional().matches(/^#[0-9A-Fa-f]{6}$/),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const planner = await prisma.planner.findFirst({ where: { userId } });
      if (!planner) throw new AppError('Planner not found', 404);
      if (planner.plan !== 'SCALE') throw new AppError('White-label portals require the Scale plan (₦450K/mo)', 403);

      const existing = await prisma.tenant.findFirst({ where: { plannerId: planner.id } });
      if (existing) throw new AppError('You already have a white-label portal. Update it instead.', 409);

      const RESERVED = ['www', 'api', 'app', 'admin', 'mail', 'ftp', 'static', 'owambe', 'dashboard'];
      if (RESERVED.includes(req.body.subdomain)) {
        throw new AppError('That subdomain is reserved', 400);
      }

      const tenant = await prisma.tenant.create({
        data: {
          plannerId: planner.id,
          subdomain: req.body.subdomain,
          name: req.body.name,
          tagline: req.body.tagline,
          logoUrl: req.body.logoUrl,
          primaryColor: req.body.primaryColor || '#2D6A4F',
          accentColor: req.body.accentColor || '#E76F2A',
          bgColor: req.body.bgColor || '#FDFAF4',
          fontFamily: req.body.fontFamily || 'Inter',
          metaTitle: req.body.metaTitle || req.body.name,
          metaDescription: req.body.metaDescription || req.body.tagline,
          socialLinks: req.body.socialLinks || {},
          footerText: req.body.footerText,
          allowPublicReg: req.body.allowPublicReg !== false,
          requireApproval: req.body.requireApproval || false,
        },
      });

      logger.info(`Tenant created: ${tenant.subdomain}.owambe.com (planner: ${planner.id})`);
      res.status(201).json({ success: true, tenant });
    } catch (err) { next(err); }
  }
);

// ─── UPDATE branding ───────────────────────────────────
tenantsRouter.put('/me', authenticate, requireRole('PLANNER'),
  [
    body('primaryColor').optional().matches(/^#[0-9A-Fa-f]{6}$/),
    body('accentColor').optional().matches(/^#[0-9A-Fa-f]{6}$/),
    body('subdomain').optional().trim().toLowerCase()
      .matches(/^[a-z0-9-]{3,30}$/),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const planner = await prisma.planner.findFirst({ where: { userId } });
      if (!planner) throw new AppError('Planner not found', 404);

      const existing = await prisma.tenant.findFirst({ where: { plannerId: planner.id } });
      if (!existing) throw new AppError('No portal found. Create one first.', 404);

      const {
        name, tagline, logoUrl, faviconUrl,
        primaryColor, accentColor, bgColor, fontFamily,
        footerText, socialLinks, metaTitle, metaDescription, metaImage,
        allowPublicReg, requireApproval, customCss, customDomain,
      } = req.body;

      const tenant = await prisma.tenant.update({
        where: { id: existing.id },
        data: {
          ...(name && { name }),
          ...(tagline !== undefined && { tagline }),
          ...(logoUrl !== undefined && { logoUrl }),
          ...(faviconUrl !== undefined && { faviconUrl }),
          ...(primaryColor && { primaryColor }),
          ...(accentColor && { accentColor }),
          ...(bgColor && { bgColor }),
          ...(fontFamily && { fontFamily }),
          ...(footerText !== undefined && { footerText }),
          ...(socialLinks && { socialLinks }),
          ...(metaTitle !== undefined && { metaTitle }),
          ...(metaDescription !== undefined && { metaDescription }),
          ...(metaImage !== undefined && { metaImage }),
          ...(allowPublicReg !== undefined && { allowPublicReg }),
          ...(requireApproval !== undefined && { requireApproval }),
          ...(customCss !== undefined && { customCss }),
          ...(customDomain !== undefined && { customDomain }),
        },
      });

      // Invalidate cache
      await Promise.all([
        cacheDel(`tenant:sub:${existing.subdomain}`),
        existing.customDomain ? cacheDel(`tenant:domain:${existing.customDomain}`) : Promise.resolve(),
      ]);

      logger.info(`Tenant updated: ${tenant.subdomain}`);
      res.json({ success: true, tenant });
    } catch (err) { next(err); }
  }
);

// ─── GET events for a tenant (public) ─────────────────
tenantsRouter.get('/:subdomain/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { subdomain } = req.params;
    const { search, limit = 20, page = 1 } = req.query;

    const tenant = await prisma.tenant.findUnique({ where: { subdomain } });
    if (!tenant || !tenant.isActive) throw new AppError('Portal not found', 404);

    const skip = (Number(page) - 1) * Number(limit);
    const where: any = {
      planner: { id: tenant.plannerId },
      status: { in: ['PUBLISHED', 'LIVE'] },
    };
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } },
        { city: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        select: {
          id: true, name: true, slug: true, description: true,
          startDate: true, endDate: true, venue: true, city: true,
          coverImageUrl: true, type: true, status: true,
          maxCapacity: true,
          ticketTypes: { where: { status: 'ACTIVE' }, select: { price: true, name: true } },
          _count: { select: { attendees: true } },
        },
        orderBy: { startDate: 'asc' },
        skip,
        take: Number(limit),
      }),
      prisma.event.count({ where }),
    ]);

    res.json({ success: true, events, total, page: Number(page) });
  } catch (err) { next(err); }
});

// ─── ADMIN: list all tenants ────────────────────────────
tenantsRouter.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.role !== 'ADMIN') throw new AppError('Admin only', 403);

    const tenants = await prisma.tenant.findMany({
      include: {
        planner: {
          select: {
            plan: true,
            companyName: true,
            user: { select: { email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, tenants, total: tenants.length });
  } catch (err) { next(err); }
});

// ─── TOGGLE active state (admin) ────────────────────────
tenantsRouter.patch('/:id/toggle', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.role !== 'ADMIN') throw new AppError('Admin only', 403);

    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) throw new AppError('Tenant not found', 404);

    const updated = await prisma.tenant.update({
      where: { id: req.params.id },
      data: { isActive: !tenant.isActive },
    });
    await cacheDel(`tenant:sub:${tenant.subdomain}`);
    res.json({ success: true, tenant: updated });
  } catch (err) { next(err); }
});
