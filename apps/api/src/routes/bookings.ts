import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { prisma } from '../database/client';
import { AppError } from '../utils/AppError';
import {
  createInstantBooking, createRfqBooking, getMyBookings,
  confirmBooking, cancelBooking, submitQuote,
} from '../controllers/bookings.controller';

export const bookingsRouter = Router();
bookingsRouter.use(authenticate);

bookingsRouter.get('/', getMyBookings);

bookingsRouter.get('/:id', async (req, res, next) => {
  try {
    const userId = (req as any).userId;
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, OR: [{ planner: { userId } }, { consumer: { userId } }, { vendor: { userId } }] },
      include: {
        vendor: { select: { id: true, businessName: true, category: true, city: true, slug: true, phone: true, address: true } },
        planner: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        consumer: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        messages: { orderBy: { createdAt: 'asc' } },
        quote: true,
      },
    });
    if (!booking) throw new AppError('Booking not found', 404);
    res.json({ success: true, booking });
  } catch (err) { next(err); }
});

bookingsRouter.post('/instant', [body('vendorId').isUUID(), body('eventDate').isISO8601(), body('totalAmount').isNumeric(), body('eventDescription').notEmpty()], validate, createInstantBooking);
bookingsRouter.post('/rfq', [body('vendorId').isUUID(), body('eventDate').isISO8601(), body('eventDescription').notEmpty()], validate, createRfqBooking);
bookingsRouter.post('/:id/confirm', confirmBooking);
bookingsRouter.post('/:id/cancel', [body('reason').optional().trim()], validate, cancelBooking);
bookingsRouter.post('/:id/quote', [body('lineItems').isArray(), body('totalAmount').isNumeric(), body('validUntil').isISO8601()], validate, submitQuote);
