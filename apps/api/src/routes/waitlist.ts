import { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { body } from 'express-validator';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { AppError } from '../utils/AppError';
import { sendEmail } from '../services/email.service';
import { logger } from '../utils/logger';

export const waitlistRouter = Router();

// ─── JOIN WAITLIST (public) ───────────────────────────
waitlistRouter.post('/join', [
  body('eventId').isUUID(),
  body('ticketTypeId').isUUID(),
  body('email').isEmail().normalizeEmail(),
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty(),
], validate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventId, ticketTypeId, email, firstName, lastName, phone } = req.body;

    const existing = await prisma.waitlist.findFirst({ where: { eventId, email } });
    if (existing) throw new AppError('You are already on the waitlist for this event', 409);

    const position = await prisma.waitlist.count({ where: { eventId } }) + 1;

    const entry = await prisma.waitlist.create({
      data: { eventId, ticketTypeId, email, firstName, lastName, phone },
    });

    res.status(201).json({ success: true, entry, position });
  } catch (err) { next(err); }
});

// ─── LIST waitlist for an event (planner only) ────────
waitlistRouter.get('/event/:eventId', authenticate, requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const waitlist = await prisma.waitlist.findMany({
      where: { eventId: req.params.eventId },
      include: { ticketType: { select: { name: true, price: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, waitlist });
  } catch (err) { next(err); }
});

// ─── NOTIFY next N people ─────────────────────────────
waitlistRouter.post('/notify/:eventId', authenticate, requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { count = 3 } = req.body;

    const toNotify = await prisma.waitlist.findMany({
      where: {
        eventId: req.params.eventId,
        notifiedAt: null,
      },
      include: {
        event: { select: { name: true, slug: true } },
        ticketType: { select: { name: true, price: true } },
      },
      take: Number(count),
      orderBy: { createdAt: 'asc' },
    });

    if (toNotify.length === 0) {
      return res.json({ success: true, notified: 0, message: 'No unnotified entries on waitlist' });
    }

    const holdsUntil = new Date();
    holdsUntil.setHours(holdsUntil.getHours() + 24);

    await Promise.all(
      toNotify.map(async (entry) => {
        await sendEmail({
          to: entry.email,
          subject: `🎫 A spot just opened at ${entry.event.name}!`,
          template: 'custom-campaign',
          data: {
            firstName: entry.firstName,
            body: `Great news! A spot has opened up at ${entry.event.name}.\n\n` +
              `Your ticket type: ${entry.ticketType.name}\n` +
              `Reserve your spot within 24 hours:\n` +
              `${process.env.NEXT_PUBLIC_APP_URL}/events/${entry.event.slug}?promo=WAITLIST\n\n` +
              `This spot expires at ${holdsUntil.toLocaleString('en-NG')}.`,
          },
        });

        await prisma.waitlist.update({
          where: { id: entry.id },
          data: { notifiedAt: new Date(), expiresAt: holdsUntil },
        });
      })
    );

    logger.info(`Waitlist: notified ${toNotify.length} entries for event ${req.params.eventId}`);
    res.json({ success: true, notified: toNotify.length });
  } catch (err) { next(err); }
});

// ─── REMOVE from waitlist ─────────────────────────────
waitlistRouter.delete('/:id', authenticate, requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.waitlist.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});
