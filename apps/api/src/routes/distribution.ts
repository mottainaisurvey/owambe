import { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { body, param } from 'express-validator';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import {
  pushToEventbrite, pushToFacebook, pushToGoogle,
  generateWidgetSnippet, unpublishFromEventbrite,
  buildEventSchema, type EventPayload,
} from '../services/distribution.service';

export const distributionRouter = Router();

// ─── HELPER: load event with all required fields ──────
async function loadEvent(eventId: string, plannerId: string): Promise<EventPayload> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, plannerId },
    include: {
      ticketTypes: {
        where: { status: 'ACTIVE' },
        select: { name: true, price: true, currency: true, capacity: true },
      },
      planner: {
        include: { user: { select: { email: true } } },
      },
    },
  });

  if (!event) throw new AppError('Event not found', 404);
  if (!['PUBLISHED', 'LIVE'].includes(event.status)) {
    throw new AppError('Event must be published before distributing', 400);
  }

  return {
    id:           event.id,
    name:         event.name,
    description:  event.description || '',
    slug:         event.slug,
    startDate:    event.startDate,
    endDate:      event.endDate,
    venue:        event.venue,
    address:      event.address,
    city:         event.city,
    coverImageUrl: event.coverImageUrl,
    type:         event.type,
    maxCapacity:  event.maxCapacity,
    ticketTypes:  event.ticketTypes.map(t => ({
      name:     t.name,
      price:    Number(t.price),
      currency: t.currency,
      capacity: t.capacity,
    })),
    planner: {
      companyName: event.planner.companyName,
      user: { email: event.planner.user.email },
    },
  };
}

// ─── 1. GET distribution status for an event ──────────
distributionRouter.get('/:eventId/distributions',
  authenticate, requireRole('PLANNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const planner = await prisma.planner.findFirst({ where: { userId } });
      if (!planner) throw new AppError('Planner not found', 404);

      const event = await prisma.event.findFirst({
        where: { id: req.params.eventId, plannerId: planner.id },
        select: { id: true, name: true, slug: true, status: true, startDate: true },
      });
      if (!event) throw new AppError('Event not found', 404);

      const distributions = await prisma.eventDistribution.findMany({
        where: { eventId: event.id },
        orderBy: { createdAt: 'asc' },
      });

      // Widget snippet (always available for published events)
      const widgetSnippet = ['PUBLISHED', 'LIVE'].includes(event.status)
        ? generateWidgetSnippet({ slug: event.slug, mode: 'card' })
        : null;

      res.json({ success: true, distributions, event, widgetSnippet });
    } catch (err) { next(err); }
  }
);

// ─── 2. PUSH to a channel ─────────────────────────────
distributionRouter.post('/:eventId/distributions/push',
  authenticate, requireRole('PLANNER'),
  [body('channel').isIn(['EVENTBRITE', 'FACEBOOK_EVENTS', 'GOOGLE_EVENTS', 'WIDGET_EMBED'])],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const planner = await prisma.planner.findFirst({ where: { userId } });
      if (!planner) throw new AppError('Planner not found', 404);

      const { channel } = req.body;
      const eventPayload = await loadEvent(req.params.eventId, planner.id);

      // ─── PLAN GATE: Eventbrite + Facebook require Growth+ ───────────────
      const premiumChannels = ['EVENTBRITE', 'FACEBOOK_EVENTS'];
      if (premiumChannels.includes(channel) && planner.plan === 'STARTER') {
        throw new AppError(
          `${channel.replace('_', ' ')} distribution requires the Growth plan (₦150,000/mo). ` +
          'Google Events and Widget Embed are available on all plans.',
          403
        );
      }

      // Create or update distribution record as PENDING
      const dist = await prisma.eventDistribution.upsert({
        where: { eventId_channel: { eventId: eventPayload.id, channel } },
        create: { eventId: eventPayload.id, channel, status: 'PENDING' },
        update: { status: 'PENDING', lastError: null },
      });

      let result;
      switch (channel) {
        case 'EVENTBRITE':
          result = await pushToEventbrite(eventPayload);
          break;
        case 'FACEBOOK_EVENTS':
          result = await pushToFacebook(eventPayload);
          break;
        case 'GOOGLE_EVENTS':
          result = await pushToGoogle(eventPayload);
          break;
        case 'WIDGET_EMBED':
          // Widget is always available — just mark as published
          result = {
            success: true,
            externalId: eventPayload.slug,
            externalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventPayload.slug}`,
          };
          break;
        default:
          throw new AppError('Unsupported channel', 400);
      }

      // Update distribution record with result
      const updated = await prisma.eventDistribution.update({
        where: { id: dist.id },
        data: {
          status:      result.success ? 'PUBLISHED' : 'FAILED',
          externalId:  result.externalId  || null,
          externalUrl: result.externalUrl || null,
          lastError:   result.error       || null,
          publishedAt: result.success ? new Date() : undefined,
          lastSyncAt:  new Date(),
        },
      });

      logger.info(`Distribution push: ${channel} for event ${eventPayload.id} — ${result.success ? 'SUCCESS' : 'FAILED'}`);

      res.json({
        success: result.success,
        distribution: updated,
        error: result.error,
      });
    } catch (err) { next(err); }
  }
);

// ─── 3. UNPUBLISH from a channel ──────────────────────
distributionRouter.post('/:eventId/distributions/:distId/unpublish',
  authenticate, requireRole('PLANNER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const planner = await prisma.planner.findFirst({ where: { userId } });
      if (!planner) throw new AppError('Planner not found', 404);

      const dist = await prisma.eventDistribution.findUnique({
        where: { id: req.params.distId },
        include: { event: { select: { plannerId: true } } },
      });
      if (!dist) throw new AppError('Distribution not found', 404);
      if (dist.event.plannerId !== planner.id) throw new AppError('Access denied', 403);

      let unpubResult: { success: boolean; error?: string } = { success: true };

      if (dist.channel === 'EVENTBRITE' && dist.externalId) {
        unpubResult = await unpublishFromEventbrite(dist.externalId);
      }
      // Facebook and Google: manual — just mark as unpublished locally

      await prisma.eventDistribution.update({
        where: { id: dist.id },
        data: {
          status: unpubResult.success ? 'UNPUBLISHED' : dist.status,
          unpublishedAt: unpubResult.success ? new Date() : undefined,
          lastError: unpubResult.error || null,
        },
      });

      res.json({ success: unpubResult.success, error: unpubResult.error });
    } catch (err) { next(err); }
  }
);

// ─── 4. WIDGET snippet generator ─────────────────────
distributionRouter.post('/:eventId/distributions/widget-snippet',
  authenticate, requireRole('PLANNER'),
  [
    body('mode').optional().isIn(['card', 'full', 'button']),
    body('primaryColor').optional().matches(/^#[0-9A-Fa-f]{6}$/),
    body('accentColor').optional().matches(/^#[0-9A-Fa-f]{6}$/),
    body('width').optional().isString(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const planner = await prisma.planner.findFirst({ where: { userId } });
      if (!planner) throw new AppError('Planner not found', 404);

      const event = await prisma.event.findFirst({
        where: { id: req.params.eventId, plannerId: planner.id },
        select: { slug: true, status: true },
      });
      if (!event) throw new AppError('Event not found', 404);

      const { mode = 'card', primaryColor, accentColor, width } = req.body;

      // ─── PLAN GATE: Full inline form requires Growth+ ───────────────────
      if (mode === 'full' && planner.plan === 'STARTER') {
        throw new AppError(
          'The full inline registration widget requires the Growth plan (₦150,000/mo). ' +
          'Card and button modes are available on all plans.',
          403
        );
      }

      const result = generateWidgetSnippet({
        slug: event.slug,
        mode,
        primaryColor,
        accentColor,
        width,
      });

      // Ensure WIDGET_EMBED distribution record exists
      await prisma.eventDistribution.upsert({
        where: { eventId_channel: { eventId: req.params.eventId, channel: 'WIDGET_EMBED' } },
        create: {
          eventId: req.params.eventId,
          channel: 'WIDGET_EMBED',
          status: 'PUBLISHED',
          externalId: event.slug,
          publishedAt: new Date(),
        },
        update: {},
      });

      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  }
);

// ─── 5. TRACK widget click (called by widget iframe) ──
// Public, no auth
distributionRouter.post('/:eventId/distributions/track',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { channel = 'WIDGET_EMBED', referrer } = req.body;
      await prisma.eventDistribution.updateMany({
        where: { eventId: req.params.eventId, channel },
        data: { clickCount: { increment: 1 } },
      });
      res.json({ success: true });
    } catch { res.json({ success: false }); }
  }
);

// ─── 6. GET Google schema for an event (public) ───────
distributionRouter.get('/:slug/schema',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const event = await prisma.event.findFirst({
        where: { slug: req.params.slug, isPublic: true },
        include: {
          ticketTypes: { where: { status: 'ACTIVE' }, select: { name: true, price: true, currency: true, capacity: true } },
          planner: { include: { user: { select: { email: true } } } },
        },
      });
      if (!event) throw new AppError('Event not found', 404);

      const payload: EventPayload = {
        id: event.id, name: event.name, description: event.description || '',
        slug: event.slug, startDate: event.startDate, endDate: event.endDate,
        venue: event.venue, address: event.address, city: event.city,
        coverImageUrl: event.coverImageUrl, type: event.type,
        maxCapacity: event.maxCapacity,
        ticketTypes: event.ticketTypes.map(t => ({
          name: t.name, price: Number(t.price), currency: t.currency, capacity: t.capacity,
        })),
        planner: { companyName: event.planner.companyName, user: { email: event.planner.user.email } },
      };

      res.json(buildEventSchema(payload));
    } catch (err) { next(err); }
  }
);
