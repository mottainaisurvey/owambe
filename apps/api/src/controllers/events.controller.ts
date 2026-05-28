import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database/client';
import { AppError } from '../utils/AppError';
import { generateSlug } from '../utils/slug';
import { generateQrCode } from '../utils/qrcode';
import { sendEmail } from '../services/email.service';
import { logger } from '../utils/logger';

// ─── CREATE EVENT ────────────────────────────────────
export async function createEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const planner = await prisma.planner.findUnique({ where: { userId } });
    if (!planner) throw new AppError('Planner profile not found', 404);

    const {
      name, description, type, format, startDate, endDate,
      venue, address, city, maxCapacity, coverImageUrl, isPublic
    } = req.body;

    const slug = await generateSlug(name, 'events');

    const event = await prisma.event.create({
      data: {
        plannerId: planner.id,
        name,
        slug,
        description,
        type,
        format: format || 'IN_PERSON',
        status: 'DRAFT',
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        venue,
        address,
        city,
        maxCapacity,
        coverImageUrl,
        isPublic: isPublic ?? true,
      }
    });

    logger.info(`Event created: ${event.id} by planner ${planner.id}`);
    res.status(201).json({ success: true, event });
  } catch (err) {
    next(err);
  }
}

// ─── GET ALL EVENTS (planner's) ──────────────────────
export async function getMyEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const planner = await prisma.planner.findUnique({ where: { userId } });
    if (!planner) throw new AppError('Planner profile not found', 404);

    const { status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { plannerId: planner.id };
    if (status) where.status = status;

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          ticketTypes: { select: { id: true, name: true, price: true, soldCount: true, capacity: true } },
          _count: { select: { attendees: true, speakers: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.event.count({ where })
    ]);

    // Add computed fields
    const enriched = events.map(event => ({
      ...event,
      registrationCount: event._count.attendees,
      speakerCount: event._count.speakers,
      revenue: event.ticketTypes.reduce((sum, t) => sum + Number(t.price) * t.soldCount, 0),
      fillRate: event.maxCapacity
        ? Math.round((event._count.attendees / event.maxCapacity) * 100)
        : null,
    }));

    res.json({ success: true, events: enriched, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
}

// ─── GET EVENT BY ID ─────────────────────────────────
export async function getEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const event = await prisma.event.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        ticketTypes: true,
        speakers: { orderBy: { createdAt: 'asc' } },
        sponsors: { orderBy: { tier: 'asc' } },
        _count: { select: { attendees: true, checkIns: true } }
      }
    });
    if (!event) throw new AppError('Event not found', 404);
    res.json({ success: true, event });
  } catch (err) {
    next(err);
  }
}

// ─── UPDATE EVENT ────────────────────────────────────
export async function updateEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;
    const planner = await prisma.planner.findUnique({ where: { userId } });

    const event = await prisma.event.findFirst({
      where: { id, plannerId: planner!.id }
    });
    if (!event) throw new AppError('Event not found or unauthorized', 404);

    const updated = await prisma.event.update({
      where: { id },
      data: {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      }
    });

    res.json({ success: true, event: updated });
  } catch (err) {
    next(err);
  }
}

// ─── PUBLISH EVENT ───────────────────────────────────
export async function publishEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;
    const planner = await prisma.planner.findUnique({ where: { userId } });

    const event = await prisma.event.findFirst({
      where: { id, plannerId: planner!.id },
      include: { ticketTypes: true }
    });
    if (!event) throw new AppError('Event not found', 404);
    if (event.ticketTypes.length === 0) throw new AppError('Add at least one ticket type before publishing', 400);

    const published = await prisma.event.update({
      where: { id },
      data: { status: 'PUBLISHED' }
    });

    logger.info(`Event published: ${id}`);
    res.json({ success: true, event: published, registrationUrl: `${process.env.NEXT_PUBLIC_APP_URL}/events/${event.slug}` });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE EVENT ────────────────────────────────────
export async function deleteEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;
    const planner = await prisma.planner.findUnique({ where: { userId } });

    const event = await prisma.event.findFirst({ where: { id, plannerId: planner!.id } });
    if (!event) throw new AppError('Event not found', 404);
    if (event.status === 'LIVE') throw new AppError('Cannot delete a live event', 400);

    await prisma.event.delete({ where: { id } });
    res.json({ success: true, message: 'Event deleted' });
  } catch (err) {
    next(err);
  }
}

// ─── LIST PUBLIC EVENTS ─────────────────────────────
export async function listPublicEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const { page = 1, limit = 20, city, type, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = { isPublic: true, status: { in: ['PUBLISHED', 'LIVE'] } };
    if (city) where.city = { contains: String(city), mode: 'insensitive' };
    if (type) where.type = String(type);
    if (search) where.name = { contains: String(search), mode: 'insensitive' };
    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        select: {
          id: true, name: true, slug: true, type: true, format: true, status: true,
          startDate: true, endDate: true, venue: true, city: true, coverImageUrl: true,
          maxCapacity: true,
          ticketTypes: {
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, price: true, currency: true, capacity: true, soldCount: true },
          },
          _count: { select: { attendees: true } },
        },
        orderBy: { startDate: 'asc' },
        skip,
        take: Number(limit),
      }),
      prisma.event.count({ where }),
    ]);
    const enriched = events.map(ev => ({
      ...ev,
      attendeeCount: ev._count.attendees,
      minPrice: ev.ticketTypes.length > 0 ? Math.min(...ev.ticketTypes.map(t => Number(t.price))) : 0,
      isSoldOut: ev.maxCapacity ? ev._count.attendees >= ev.maxCapacity : false,
    }));
    res.json({ success: true, events: enriched, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
}

// ─── GET PUBLIC REGISTRATION PAGE ────────────────────
export async function getPublicEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { slug } = req.params;
    const event = await prisma.event.findFirst({
      where: { slug, isPublic: true, status: { in: ['PUBLISHED', 'LIVE'] } },
      include: {
        ticketTypes: {
          where: { status: 'ACTIVE' },
          select: { id: true, name: true, description: true, price: true, currency: true, capacity: true, soldCount: true }
        },
        speakers: {
          where: { status: 'CONFIRMED' },
          select: { id: true, name: true, title: true, company: true, photoUrl: true, topic: true }
        },
        sponsors: { select: { id: true, name: true, logoUrl: true, tier: true } },
        _count: { select: { attendees: true } }
      }
    });
    if (!event) throw new AppError('Event not found', 404);

    // Compute spots remaining per ticket type
    const ticketsWithRemaining = event.ticketTypes.map(t => ({
      ...t,
      remaining: t.capacity ? t.capacity - t.soldCount : null,
      isSoldOut: t.capacity ? t.soldCount >= t.capacity : false,
    }));

    res.json({ success: true, event: { ...event, ticketTypes: ticketsWithRemaining } });
  } catch (err) {
    next(err);
  }
}

// ─── REGISTER ATTENDEE ───────────────────────────────
export async function registerAttendee(req: Request, res: Response, next: NextFunction) {
  try {
    const { slug } = req.params;
    const { firstName, lastName, email, phone, company, ticketTypeId, promoCode, paystackRef } = req.body;

    const event = await prisma.event.findFirst({
      where: { slug, status: { in: ['PUBLISHED', 'LIVE'] } }
    });
    if (!event) throw new AppError('Event not found', 404);

    const ticketType = await prisma.ticketType.findFirst({
      where: { id: ticketTypeId, eventId: event.id, status: 'ACTIVE' }
    });
    if (!ticketType) throw new AppError('Ticket type not found', 404);
    if (ticketType.capacity && ticketType.soldCount >= ticketType.capacity) {
      throw new AppError('This ticket type is sold out', 400);
    }

    // Check duplicate registration
    const existing = await prisma.attendee.findFirst({
      where: { eventId: event.id, email }
    });
    if (existing) throw new AppError('This email is already registered for this event', 409);

    // Apply promo code
    let amountPaid = Number(ticketType.price);
    if (promoCode) {
      const promo = await prisma.promoCode.findFirst({
        where: { eventId: event.id, code: promoCode.toUpperCase(), isActive: true }
      });
      if (promo) {
        if (promo.discountType === 'PERCENTAGE') {
          amountPaid = amountPaid * (1 - Number(promo.discountValue) / 100);
        } else {
          amountPaid = Math.max(0, amountPaid - Number(promo.discountValue));
        }
        await prisma.promoCode.update({
          where: { id: promo.id },
          data: { usedCount: { increment: 1 } }
        });
      }
    }

    const qrCode = generateQrCode();

    const attendee = await prisma.$transaction(async (tx) => {
      const a = await tx.attendee.create({
        data: {
          eventId: event.id,
          ticketTypeId,
          firstName,
          lastName,
          email,
          phone,
          company,
          qrCode,
          amountPaid,
          promoCode,
          paystackRef,
          status: 'REGISTERED',
        }
      });

      await tx.ticketType.update({
        where: { id: ticketTypeId },
        data: { soldCount: { increment: 1 } }
      });

      return a;
    });

    // Send confirmation email
    await sendEmail({
      to: email,
      subject: `You're registered for ${event.name}!`,
      template: 'registration-confirmation',
      data: {
        firstName,
        eventName: event.name,
        eventDate: event.startDate,
        venue: event.venue,
        ticketName: ticketType.name,
        qrCode: attendee.qrCode,
        viewUrl: `${process.env.NEXT_PUBLIC_APP_URL}/tickets/${attendee.qrCode}`,
      }
    });

    res.status(201).json({ success: true, attendee, message: 'Registration successful! Check your email for confirmation.' });
  } catch (err) {
    next(err);
  }
}
