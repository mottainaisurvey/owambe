// C2: Experience Slot Scheduling Routes
// OWB-C2-EXPERIENCES-SLOT-SCHEDULING-01
//
// Design: stored-rule-with-materialised-instances (Option B per design-decisions doc)
// All recurrence expansion uses the 'rrule' library (trigger-4 flagged dependency).
// UTC storage; timezone metadata on parent slot row.
//
// Route summary:
//   POST   /api/experience-slots/:experienceId          — create one-off or recurring slot (OPERATOR)
//   GET    /api/experience-slots/:experienceId          — list operator's own slots (OPERATOR)
//   PATCH  /api/experience-slots/:slotId                — edit single instance (OPERATOR)
//   DELETE /api/experience-slots/:slotId                — cancel single instance (OPERATOR)
//   PATCH  /api/experience-slots/:slotId/cancel-series  — cancel remaining series (OPERATOR)
//   PATCH  /api/experience-slots/:slotId/edit-series    — rule-level mutation going forward (OPERATOR)

import { Router, Request, Response, NextFunction } from 'express';
import { RRule, RRuleSet, rrulestr } from 'rrule';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { requireMode } from '../middleware/requireMode';
import { AppError } from '../utils/AppError';

const router = Router();

// ─── HELPER: own-experience ownership check ───────────
async function assertOwnExperience(
  experienceId: string,
  userId: string,
  userRole: string
): Promise<void> {
  const experience = await prisma.experience.findUnique({
    where: { id: experienceId },
    include: { operator: true }
  });
  if (!experience) throw new AppError('Experience not found', 404);
  if (userRole !== 'ADMIN' && experience.operator.userId !== userId) {
    throw new AppError('You do not have permission to manage slots for this experience', 403);
  }
}

// ─── HELPER: own-slot ownership check ────────────────
async function assertOwnSlot(
  slotId: string,
  userId: string,
  userRole: string
): Promise<{ slot: any; experience: any }> {
  const slot = await prisma.experienceSlot.findUnique({
    where: { id: slotId },
    include: { experience: { include: { operator: true } } }
  });
  if (!slot) throw new AppError('Slot not found', 404);
  if (userRole !== 'ADMIN' && slot.experience.operator.userId !== userId) {
    throw new AppError('You do not have permission to manage this slot', 403);
  }
  return { slot, experience: slot.experience };
}

// ─── HELPER: expand RRULE to UTC DateTime array ───────
// Expands a recurrence rule anchored at dtstart (UTC) up to COUNT or UNTIL bound.
// Returns array of { startTime, endTime } UTC Date pairs.
// Throws if rule is open-ended (no COUNT, no UNTIL) — enforced per C2 invariant.
function expandRRule(
  rruleString: string,
  dtstart: Date,
  durationMs: number
): Array<{ startTime: Date; endTime: Date }> {
  let rule: RRule;
  try {
    rule = rrulestr(rruleString, { dtstart }) as RRule;
  } catch (e) {
    throw new AppError('Invalid RRULE string', 400);
  }

  // Enforce COUNT or UNTIL bound — open-ended series not supported (C2 invariant)
  const options = rule.options;
  if (!options.count && !options.until) {
    throw new AppError(
      'Recurring series must have a COUNT or UNTIL bound. Open-ended series are not supported.',
      400
    );
  }

  // Safety cap: prevent excessively large materialisations
  const MAX_INSTANCES = 365;
  const occurrences = rule.all();
  if (occurrences.length > MAX_INSTANCES) {
    throw new AppError(
      `Recurring series would produce ${occurrences.length} instances. Maximum is ${MAX_INSTANCES}.`,
      400
    );
  }
  if (occurrences.length === 0) {
    // COUNT=0 or UNTIL in the past — zero instances, no error (per AC-4 edge case)
    return [];
  }

  return occurrences.map(start => ({
    startTime: start,
    endTime: new Date(start.getTime() + durationMs),
  }));
}

// ─── POST /api/experience-slots/:experienceId ─────────
// OPERATOR only: create one-off or recurring slot
// Body: { startTime, endTime, capacity, rruleString?, timezone? }
// For recurring: rruleString is required; timezone is required.
// startTime/endTime define the first occurrence and the duration.
router.post('/:experienceId',
  authenticate,
  requireRole('OPERATOR', 'ADMIN'),
  requireMode('EXPERIENCES'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;
      const { experienceId } = req.params;

      await assertOwnExperience(experienceId, userId, userRole);

      const { startTime, endTime, capacity, rruleString, timezone } = req.body;

      if (!startTime || !endTime || !capacity) {
        throw new AppError('startTime, endTime, and capacity are required', 400);
      }

      const startDt = new Date(startTime);
      const endDt = new Date(endTime);
      const capacityInt = parseInt(capacity);

      if (isNaN(startDt.getTime()) || isNaN(endDt.getTime())) {
        throw new AppError('startTime and endTime must be valid ISO date strings', 400);
      }
      if (endDt <= startDt) {
        throw new AppError('endTime must be after startTime', 400);
      }
      if (isNaN(capacityInt) || capacityInt < 1) {
        throw new AppError('capacity must be a positive integer', 400);
      }

      if (!rruleString) {
        // One-off slot
        const slot = await prisma.experienceSlot.create({
          data: {
            experienceId,
            startTime: startDt,
            endTime: endDt,
            capacity: capacityInt,
          }
        });
        return res.status(201).json({ success: true, data: slot, type: 'one-off' });
      }

      // Recurring slot — requires timezone
      if (!timezone) {
        throw new AppError('timezone is required for recurring slots (e.g. "Africa/Lagos")', 400);
      }

      const durationMs = endDt.getTime() - startDt.getTime();
      const instances = expandRRule(rruleString, startDt, durationMs);

      if (instances.length === 0) {
        return res.status(201).json({
          success: true,
          data: [],
          type: 'recurring',
          message: 'Recurrence rule produced zero instances (COUNT=0 or UNTIL in the past).'
        });
      }

      // Create parent slot row (stores the rule; no direct bookings)
      const parentSlot = await prisma.experienceSlot.create({
        data: {
          experienceId,
          startTime: instances[0].startTime,
          endTime: instances[0].endTime,
          capacity: capacityInt,
          rruleString,
          timezone,
          // isActive: true (parent row is active; individual instances can be cancelled)
        }
      });

      // Create child instance rows
      const childData = instances.map(inst => ({
        experienceId,
        startTime: inst.startTime,
        endTime: inst.endTime,
        capacity: capacityInt,
        parentSlotId: parentSlot.id,
        timezone,
      }));

      await prisma.experienceSlot.createMany({ data: childData });

      const children = await prisma.experienceSlot.findMany({
        where: { parentSlotId: parentSlot.id },
        orderBy: { startTime: 'asc' }
      });

      return res.status(201).json({
        success: true,
        data: { parent: parentSlot, instances: children },
        type: 'recurring',
        instanceCount: children.length,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/experience-slots/:experienceId ──────────
// OPERATOR only: list own slots (all instances, including parent rows)
// Query: from?, to?, includeParents? (default false — returns instances only)
router.get('/:experienceId',
  authenticate,
  requireRole('OPERATOR', 'ADMIN'),
  requireMode('EXPERIENCES'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;
      const { experienceId } = req.params;

      await assertOwnExperience(experienceId, userId, userRole);

      const { from, to } = req.query;
      const fromDate = from ? new Date(from as string) : new Date();
      const toDate = to ? new Date(to as string) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      // Return child instance rows (parentSlotId IS NOT NULL) and one-off slots (parentSlotId IS NULL, rruleString IS NULL)
      // Exclude parent rule rows (parentSlotId IS NULL, rruleString IS NOT NULL) from the default view
      const slots = await prisma.experienceSlot.findMany({
        where: {
          experienceId,
          isActive: true,
          startTime: { gte: fromDate, lte: toDate },
          OR: [
            { parentSlotId: { not: null } },   // child instance rows
            { rruleString: null },              // one-off slots (no rule)
          ]
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
  }
);

// ─── PATCH /api/experience-slots/:slotId ─────────────
// OPERATOR only: edit a single slot instance (startTime, endTime, capacity)
// Does not affect the parent rule or other instances.
router.patch('/:slotId',
  authenticate,
  requireRole('OPERATOR', 'ADMIN'),
  requireMode('EXPERIENCES'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;
      const { slotId } = req.params;

      const { slot } = await assertOwnSlot(slotId, userId, userRole);

      // Prevent editing a parent rule row directly — must use /edit-series
      if (slot.rruleString && !slot.parentSlotId) {
        throw new AppError(
          'Cannot edit a recurring series parent row directly. Use /edit-series to modify the series going forward.',
          400
        );
      }

      const { startTime, endTime, capacity } = req.body;
      const updateData: any = {};

      if (startTime) updateData.startTime = new Date(startTime);
      if (endTime) updateData.endTime = new Date(endTime);
      if (capacity !== undefined) {
        const cap = parseInt(capacity);
        if (isNaN(cap) || cap < 1) throw new AppError('capacity must be a positive integer', 400);
        // Capacity cannot be reduced below bookedCount
        if (cap < slot.bookedCount) {
          throw new AppError(
            `Cannot reduce capacity below current bookings (${slot.bookedCount} booked)`,
            409
          );
        }
        updateData.capacity = cap;
      }

      if (Object.keys(updateData).length === 0) {
        throw new AppError('No updatable fields provided (startTime, endTime, capacity)', 400);
      }

      const updated = await prisma.experienceSlot.update({
        where: { id: slotId },
        data: updateData,
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /api/experience-slots/:slotId ────────────
// OPERATOR only: cancel a single slot instance (set isActive=false)
// Slots with existing bookings cannot be cancelled (C3 will enforce; at C2 scope, bookedCount=0 always)
router.delete('/:slotId',
  authenticate,
  requireRole('OPERATOR', 'ADMIN'),
  requireMode('EXPERIENCES'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;
      const { slotId } = req.params;

      const { slot } = await assertOwnSlot(slotId, userId, userRole);

      // Prevent cancelling a parent rule row — must use /cancel-series
      if (slot.rruleString && !slot.parentSlotId) {
        throw new AppError(
          'Cannot cancel a recurring series parent row directly. Use /cancel-series to cancel remaining instances.',
          400
        );
      }

      if (slot.bookedCount > 0) {
        throw new AppError(
          `Cannot cancel slot: ${slot.bookedCount} booking(s) exist. Cancel bookings first.`,
          409
        );
      }

      await prisma.experienceSlot.update({
        where: { id: slotId },
        data: { isActive: false }
      });

      res.json({ success: true, message: 'Slot cancelled successfully' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/experience-slots/:slotId/cancel-series ─
// OPERATOR only: cancel all remaining (future, zero-booking) instances of a series
// slotId must be a parent slot row (rruleString IS NOT NULL, parentSlotId IS NULL)
// Instances with existing bookings are preserved (booking-identity preservation invariant)
router.patch('/:slotId/cancel-series',
  authenticate,
  requireRole('OPERATOR', 'ADMIN'),
  requireMode('EXPERIENCES'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;
      const { slotId } = req.params;

      const { slot } = await assertOwnSlot(slotId, userId, userRole);

      // Must be a parent slot row
      if (!slot.rruleString || slot.parentSlotId) {
        throw new AppError(
          'cancel-series requires a recurring series parent slot ID.',
          400
        );
      }

      const now = new Date();

      // Cancel all future zero-booking child instances
      const result = await prisma.experienceSlot.updateMany({
        where: {
          parentSlotId: slotId,
          isActive: true,
          startTime: { gt: now },
          bookedCount: 0,
        },
        data: { isActive: false }
      });

      // Also deactivate the parent rule row
      await prisma.experienceSlot.update({
        where: { id: slotId },
        data: { isActive: false }
      });

      res.json({
        success: true,
        message: `Series cancelled. ${result.count} future instance(s) cancelled.`,
        cancelledCount: result.count,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/experience-slots/:slotId/edit-series ──
// OPERATOR only: rule-level mutation going forward
// slotId must be a parent slot row.
// Deletes future zero-booking instances and re-materialises from new rule.
// Instances with bookings are preserved (booking-identity preservation invariant).
// Body: { rruleString, startTime, endTime, capacity?, timezone? }
router.patch('/:slotId/edit-series',
  authenticate,
  requireRole('OPERATOR', 'ADMIN'),
  requireMode('EXPERIENCES'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      const userRole = (req as any).userRole;
      const { slotId } = req.params;

      const { slot } = await assertOwnSlot(slotId, userId, userRole);

      // Must be a parent slot row
      if (!slot.rruleString || slot.parentSlotId) {
        throw new AppError(
          'edit-series requires a recurring series parent slot ID.',
          400
        );
      }

      const { rruleString: newRruleString, startTime, endTime, capacity, timezone } = req.body;

      if (!newRruleString || !startTime || !endTime) {
        throw new AppError('rruleString, startTime, and endTime are required for edit-series', 400);
      }

      const startDt = new Date(startTime);
      const endDt = new Date(endTime);
      const durationMs = endDt.getTime() - startDt.getTime();
      const newTimezone = timezone || slot.timezone || 'Africa/Lagos';
      const newCapacity = capacity !== undefined ? parseInt(capacity) : slot.capacity;

      if (durationMs <= 0) throw new AppError('endTime must be after startTime', 400);

      const now = new Date();

      // Delete future zero-booking child instances (booking-identity preservation)
      await prisma.experienceSlot.deleteMany({
        where: {
          parentSlotId: slotId,
          startTime: { gt: now },
          bookedCount: 0,
        }
      });

      // Expand new rule from startTime
      const instances = expandRRule(newRruleString, startDt, durationMs);

      // Filter to future instances only (don't re-create past ones)
      const futureInstances = instances.filter(inst => inst.startTime > now);

      // Update parent row with new rule
      await prisma.experienceSlot.update({
        where: { id: slotId },
        data: {
          rruleString: newRruleString,
          startTime: startDt,
          endTime: endDt,
          capacity: newCapacity,
          timezone: newTimezone,
          isActive: true,
        }
      });

      // Create new future child instances
      if (futureInstances.length > 0) {
        await prisma.experienceSlot.createMany({
          data: futureInstances.map(inst => ({
            experienceId: slot.experienceId,
            startTime: inst.startTime,
            endTime: inst.endTime,
            capacity: newCapacity,
            parentSlotId: slotId,
            timezone: newTimezone,
          }))
        });
      }

      const newChildren = await prisma.experienceSlot.findMany({
        where: { parentSlotId: slotId, isActive: true },
        orderBy: { startTime: 'asc' }
      });

      res.json({
        success: true,
        message: `Series updated. ${futureInstances.length} future instance(s) re-materialised.`,
        data: { parentSlotId: slotId, instances: newChildren },
        instanceCount: newChildren.length,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
