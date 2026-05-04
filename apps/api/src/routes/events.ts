import { Router } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import {
  createEvent, getMyEvents, getEvent, updateEvent,
  publishEvent, deleteEvent, getPublicEvent, registerAttendee,
} from '../controllers/events.controller';

export const eventsRouter = Router();

// ─── PUBLIC ──────────────────────────────────────────
eventsRouter.get('/public/:slug', getPublicEvent);
eventsRouter.post('/public/:slug/register',
  [
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('ticketTypeId').isUUID(),
  ],
  validate,
  registerAttendee
);

// ─── PLANNER (authenticated) ─────────────────────────
eventsRouter.use(authenticate);
eventsRouter.use(requireRole(['PLANNER', 'ADMIN']));

eventsRouter.post('/',
  [
    body('name').trim().notEmpty().isLength({ max: 200 }),
    body('type').notEmpty(),
    body('startDate').isISO8601(),
  ],
  validate,
  createEvent
);

eventsRouter.get('/', getMyEvents);
eventsRouter.get('/:id', getEvent);

eventsRouter.put('/:id',
  [param('id').isUUID()],
  validate,
  updateEvent
);

eventsRouter.post('/:id/publish',
  [param('id').isUUID()],
  validate,
  publishEvent
);

eventsRouter.delete('/:id',
  [param('id').isUUID()],
  validate,
  deleteEvent
);
