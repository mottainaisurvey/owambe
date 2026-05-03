import { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { body, param } from 'express-validator';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { AppError } from '../utils/AppError';

export const ticketsRouter = Router();
ticketsRouter.use(authenticate, requireRole('PLANNER'));

// ─── LIST ticket types for an event ──────────────────
ticketsRouter.get('/event/:eventId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketTypes = await prisma.ticketType.findMany({
      where: { eventId: req.params.eventId },
      include: {
        _count: { select: { attendees: true } },
      },
      orderBy: { price: 'asc' },
    });
    const result = ticketTypes.map(t => ({
      ...t,
      sold: t._count.attendees,
      remaining: t.capacity ? t.capacity - t._count.attendees : null,
    }));
    res.json({ success: true, ticketTypes: result });
  } catch (err) { next(err); }
});

// ─── CREATE ticket type ───────────────────────────────
ticketsRouter.post('/event/:eventId',
  [
    body('name').trim().notEmpty().isLength({ max: 100 }),
    body('price').isNumeric({ no_symbols: false }),
    body('capacity').optional().isInt({ min: 1 }),
    body('description').optional().trim(),
    body('salesEndDate').optional().isISO8601(),
    body('minPerOrder').optional().isInt({ min: 1 }),
    body('maxPerOrder').optional().isInt({ min: 1 }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, price, capacity, description, salesEndDate, minPerOrder, maxPerOrder, benefits } = req.body;
      const ticketType = await prisma.ticketType.create({
        data: {
          eventId: req.params.eventId,
          name,
          price: parseFloat(price),
          capacity: capacity ? parseInt(capacity) : null,
          currency: 'NGN',
          status: 'ACTIVE',
          description,
          salesEndDate: salesEndDate ? new Date(salesEndDate) : null,
          minPerOrder: minPerOrder ? parseInt(minPerOrder) : 1,
          maxPerOrder: maxPerOrder ? parseInt(maxPerOrder) : 10,
          benefits: benefits || [],
        },
      });
      res.status(201).json({ success: true, ticketType });
    } catch (err) { next(err); }
  }
);

// ─── UPDATE ticket type ───────────────────────────────
ticketsRouter.put('/:id',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, price, capacity, status, description, salesEndDate, benefits } = req.body;
      const ticketType = await prisma.ticketType.update({
        where: { id: req.params.id },
        data: {
          ...(name && { name }),
          ...(price !== undefined && { price: parseFloat(price) }),
          ...(capacity !== undefined && { capacity: capacity ? parseInt(capacity) : null }),
          ...(status && { status }),
          ...(description !== undefined && { description }),
          ...(salesEndDate !== undefined && { salesEndDate: salesEndDate ? new Date(salesEndDate) : null }),
          ...(benefits && { benefits }),
        },
      });
      res.json({ success: true, ticketType });
    } catch (err) { next(err); }
  }
);

// ─── DELETE ticket type (only if no sales) ────────────
ticketsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sold = await prisma.attendee.count({ where: { ticketTypeId: req.params.id } });
    if (sold > 0) throw new AppError(`Cannot delete — ${sold} attendees registered with this ticket`, 400);
    await prisma.ticketType.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── PAUSE / RESUME sales ─────────────────────────────
ticketsRouter.patch('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    if (!['ACTIVE', 'PAUSED', 'SOLD_OUT'].includes(status)) {
      throw new AppError('Invalid status', 400);
    }
    const ticketType = await prisma.ticketType.update({
      where: { id: req.params.id },
      data: { status },
    });
    res.json({ success: true, ticketType });
  } catch (err) { next(err); }
});
