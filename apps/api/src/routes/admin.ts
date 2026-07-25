import { Router } from 'express';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { sendEmail } from '../services/email.service';
import { logger } from '../utils/logger';

export const adminRouter = Router();
adminRouter.use(authenticate, requireRole('ADMIN'));

// ─── PLATFORM STATS ──────────────────────────────────
adminRouter.get('/platform/stats', async (req, res, next) => {
  try {
    const [
      totalUsers, totalVendors, pendingVendors, totalEvents, totalBookings, gmv,
      pendingHosts, pendingProperties, pendingOperators, pendingExperiences, disputedBookings,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.vendor.count({ where: { status: 'VERIFIED' } }),
      prisma.vendor.count({ where: { status: { in: ['PENDING', 'IN_REVIEW'] } } }),
      prisma.event.count(),
      prisma.booking.count({ where: { status: 'CONFIRMED' } }),
      prisma.booking.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { totalAmount: true, commissionAmount: true },
      }),
      prisma.host.count({ where: { isApproved: false } }),
      prisma.property.count({ where: { isApproved: false } }),
      prisma.operator.count({ where: { isApproved: false } }),
      prisma.experience.count({ where: { isApproved: false } }),
      prisma.booking.count({ where: { status: 'DISPUTED' } }),
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalVendors,
        pendingVendors,
        totalEvents,
        totalBookings,
        totalGMV: Number(gmv._sum.totalAmount || 0),
        totalCommission: Number(gmv._sum.commissionAmount || 0),
        pendingApprovals: pendingHosts + pendingProperties + pendingOperators + pendingExperiences,
        pendingHosts,
        pendingProperties,
        pendingOperators,
        pendingExperiences,
        disputedBookings,
      },
    });
  } catch (err) { next(err); }
});

// ─── VENDOR VERIFICATION ─────────────────────────────
adminRouter.get('/vendors/pending', async (req, res, next) => {
  try {
    const vendors = await prisma.vendor.findMany({
      where: { status: { in: ['PENDING', 'IN_REVIEW'] } },
      include: {
        user: { select: { email: true, firstName: true, lastName: true, createdAt: true } },
        portfolioItems: { take: 3 },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, vendors });
  } catch (err) { next(err); }
});

adminRouter.put('/vendors/:id/verify', async (req, res, next) => {
  try {
    const vendor = await prisma.vendor.update({
      where: { id: req.params.id },
      data: { status: 'VERIFIED', verifiedAt: new Date() },
      include: { user: true },
    });

    // Notify vendor
    await sendEmail({
      to: vendor.user.email,
      subject: '✅ Your Owambe profile is now live!',
      template: 'vendor-verified',
      data: {
        firstName: vendor.user.firstName,
        businessName: vendor.businessName,
        profileUrl: `${process.env.NEXT_PUBLIC_APP_URL}/vendors/${vendor.slug}`,
      },
    });

    logger.info(`Vendor verified: ${vendor.id} — ${vendor.businessName}`);
    res.json({ success: true, vendor });
  } catch (err) { next(err); }
});

adminRouter.put('/vendors/:id/reject', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const vendor = await prisma.vendor.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED', rejectionReason: reason },
      include: { user: true },
    });

    await sendEmail({
      to: vendor.user.email,
      subject: 'Owambe profile review update',
      template: 'vendor-rejected',
      data: {
        firstName: vendor.user.firstName,
        businessName: vendor.businessName,
        reason,
        resubmitUrl: `${process.env.NEXT_PUBLIC_APP_URL}/vendor/settings`,
      },
    });

    res.json({ success: true, vendor });
  } catch (err) { next(err); }
});

// ─── USER MANAGEMENT ─────────────────────────────────
adminRouter.get('/users', async (req, res, next) => {
  try {
    const { role, page = 1, limit = 50, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = {};
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { email: { contains: String(search), mode: 'insensitive' } },
        { firstName: { contains: String(search), mode: 'insensitive' } },
        { lastName: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, firstName: true, lastName: true,
          role: true, isActive: true, isEmailVerified: true,
          createdAt: true, lastLoginAt: true,
          cohortCode: true, cohortMember: true, cohortType: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ success: true, users, total, page: Number(page) });
  } catch (err) { next(err); }
});

adminRouter.put('/users/:id/suspend', async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    logger.info(`User suspended: ${user.email}`);
    res.json({ success: true, message: `User ${user.email} suspended` });
  } catch (err) { next(err); }
});

adminRouter.put('/users/:id/reinstate', async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: true },
    });
    res.json({ success: true, message: `User ${user.email} reinstated` });
  } catch (err) { next(err); }
});

// ─── BOOKINGS / DISPUTES ─────────────────────────────
adminRouter.get('/bookings', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const where: any = {};
    if (status) where.status = status;

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          vendor: { select: { businessName: true, category: true } },
          planner: { include: { user: { select: { email: true, firstName: true } } } },
          consumer: { include: { user: { select: { email: true, firstName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.booking.count({ where }),
    ]);
    res.json({ success: true, bookings, total });
  } catch (err) { next(err); }
});

adminRouter.post('/bookings/:id/refund', async (req, res, next) => {
  try {
    const { amount, reason } = req.body;
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
    });
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

    const { initiateRefund } = await import('../services/paystack.service');
    if (booking.paystackDepositRef) {
      await initiateRefund(booking.paystackDepositRef, amount);
    }

    await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        paymentStatus: amount ? 'PARTIALLY_REFUNDED' : 'REFUNDED',
        cancellationReason: reason,
      },
    });

    logger.info(`Admin refund issued: booking ${req.params.id} — ₦${amount || 'full'}`);
    res.json({ success: true, message: 'Refund initiated' });
  } catch (err) { next(err); }
});

// ─── COMMISSION MANAGEMENT ────────────────────────────
adminRouter.put('/vendors/:id/commission', async (req, res, next) => {
  try {
    const { rate } = req.body;
    const vendor = await prisma.vendor.update({
      where: { id: req.params.id },
      data: { commissionRate: rate },
    });
    res.json({ success: true, vendor });
  } catch (err) { next(err); }
});

// ─── FEATURED LISTINGS ────────────────────────────────
adminRouter.put('/vendors/:id/feature', async (req, res, next) => {
  try {
    const { days = 30 } = req.body;
    const featuredUntil = new Date();
    featuredUntil.setDate(featuredUntil.getDate() + days);

    const vendor = await prisma.vendor.update({
      where: { id: req.params.id },
      data: { isFeatured: true, featuredUntil },
    });
    res.json({ success: true, vendor });
  } catch (err) { next(err); }
});

adminRouter.put('/vendors/:id/unfeature', async (req, res, next) => {
  try {
    const vendor = await prisma.vendor.update({
      where: { id: req.params.id },
      data: { isFeatured: false, featuredUntil: null },
    });
    res.json({ success: true, vendor });
  } catch (err) { next(err); }
});

// ─── REVIEWS MODERATION ──────────────────────────────
adminRouter.get('/reviews/flagged', async (req, res, next) => {
  try {
    // In production: add a `isFlagged` field to reviews
    const reviews = await prisma.review.findMany({
      where: { rating: { lte: 2 } },
      include: {
        vendor: { select: { businessName: true } },
        booking: { select: { eventDate: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, reviews });
  } catch (err) { next(err); }
});

adminRouter.delete('/reviews/:id', async (req, res, next) => {
  try {
    await prisma.review.delete({ where: { id: req.params.id } });
    logger.info(`Review deleted by admin: ${req.params.id}`);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── CATEGORY MANAGEMENT (Phase A) ───────────────────
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Vendor Categories
adminRouter.get('/categories/vendor', async (_req, res, next) => {
  try {
    const categories = await (prisma as any).vendorCategoryLookup.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ success: true, categories });
  } catch (err) { next(err); }
});
adminRouter.post('/categories/vendor', async (req, res, next) => {
  try {
    const { name, description, icon, sortOrder } = req.body;
    const cat = await (prisma as any).vendorCategoryLookup.create({
      data: { name, slug: slugify(name), description, icon, sortOrder: sortOrder ?? 0 }
    });
    res.status(201).json({ success: true, category: cat });
  } catch (err) { next(err); }
});
adminRouter.put('/categories/vendor/:id', async (req, res, next) => {
  try {
    const { name, description, icon, sortOrder, isActive } = req.body;
    const cat = await (prisma as any).vendorCategoryLookup.update({
      where: { id: req.params.id },
      data: { name, slug: name ? slugify(name) : undefined, description, icon, sortOrder, isActive }
    });
    res.json({ success: true, category: cat });
  } catch (err) { next(err); }
});
adminRouter.delete('/categories/vendor/:id', async (req, res, next) => {
  try {
    await (prisma as any).vendorCategoryLookup.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Property Types
adminRouter.get('/categories/property', async (_req, res, next) => {
  try {
    const categories = await (prisma as any).propertyTypeLookup.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ success: true, categories });
  } catch (err) { next(err); }
});
adminRouter.post('/categories/property', async (req, res, next) => {
  try {
    const { name, description, icon, sortOrder } = req.body;
    const cat = await (prisma as any).propertyTypeLookup.create({
      data: { name, slug: slugify(name), description, icon, sortOrder: sortOrder ?? 0 }
    });
    res.status(201).json({ success: true, category: cat });
  } catch (err) { next(err); }
});
adminRouter.put('/categories/property/:id', async (req, res, next) => {
  try {
    const { name, description, icon, sortOrder, isActive } = req.body;
    const cat = await (prisma as any).propertyTypeLookup.update({
      where: { id: req.params.id },
      data: { name, slug: name ? slugify(name) : undefined, description, icon, sortOrder, isActive }
    });
    res.json({ success: true, category: cat });
  } catch (err) { next(err); }
});
adminRouter.delete('/categories/property/:id', async (req, res, next) => {
  try {
    await (prisma as any).propertyTypeLookup.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Experience Types
adminRouter.get('/categories/experience', async (_req, res, next) => {
  try {
    const categories = await (prisma as any).experienceTypeLookup.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ success: true, categories });
  } catch (err) { next(err); }
});
adminRouter.post('/categories/experience', async (req, res, next) => {
  try {
    const { name, description, icon, sortOrder } = req.body;
    const cat = await (prisma as any).experienceTypeLookup.create({
      data: { name, slug: slugify(name), description, icon, sortOrder: sortOrder ?? 0 }
    });
    res.status(201).json({ success: true, category: cat });
  } catch (err) { next(err); }
});
adminRouter.put('/categories/experience/:id', async (req, res, next) => {
  try {
    const { name, description, icon, sortOrder, isActive } = req.body;
    const cat = await (prisma as any).experienceTypeLookup.update({
      where: { id: req.params.id },
      data: { name, slug: name ? slugify(name) : undefined, description, icon, sortOrder, isActive }
    });
    res.json({ success: true, category: cat });
  } catch (err) { next(err); }
});
adminRouter.delete('/categories/experience/:id', async (req, res, next) => {
  try {
    await (prisma as any).experienceTypeLookup.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Email Templates
adminRouter.get('/templates/email', async (_req, res, next) => {
  try {
    const templates = await (prisma as any).emailTemplate.findMany({ orderBy: { key: 'asc' } });
    res.json({ success: true, templates });
  } catch (err) { next(err); }
});
adminRouter.put('/templates/email/:id', async (req, res, next) => {
  try {
    const { name, subject, bodyHtml, isActive } = req.body;
    const t = await (prisma as any).emailTemplate.update({
      where: { id: req.params.id },
      data: { name, subject, bodyHtml, isActive, version: { increment: 1 }, updatedAt: new Date() }
    });
    res.json({ success: true, template: t });
  } catch (err) { next(err); }
});

// Contract Templates
adminRouter.get('/templates/contract', async (_req, res, next) => {
  try {
    const templates = await (prisma as any).contractTemplate.findMany({ orderBy: { key: 'asc' } });
    res.json({ success: true, templates });
  } catch (err) { next(err); }
});
adminRouter.put('/templates/contract/:id', async (req, res, next) => {
  try {
    const { name, description, bodyHtml, isActive } = req.body;
    const t = await (prisma as any).contractTemplate.update({
      where: { id: req.params.id },
      data: { name, description, bodyHtml, isActive, version: { increment: 1 }, updatedAt: new Date() }
    });
    res.json({ success: true, template: t });
  } catch (err) { next(err); }
});

// ─── TEMP: Integration test cohort code setter ────────────────────────────────
// POST /api/admin/users/set-cohort-code
// Body: { email, cohortCode, cohortType?, cohortEndDate? }
// Remove after integration test is complete.
adminRouter.post('/users/set-cohort-code', async (req, res, next) => {
  try {
    const { email, cohortCode, cohortType, cohortEndDate } = req.body;
    if (!email || !cohortCode) {
      res.status(400).json({ success: false, error: 'email and cohortCode are required' });
      return;
    }
    const updated = await prisma.user.update({
      where: { email },
      data: {
        cohortCode,
        cohortMember: true,
        cohortType: (cohortType ?? 'COASTAL_CORRIDOR_HOST') as any,
        cohortStartDate: new Date(),
        cohortEndDate: cohortEndDate ? new Date(cohortEndDate) : new Date('2026-06-05T14:43:58Z'),
      },
      select: {
        id: true,
        email: true,
        cohortCode: true,
        cohortMember: true,
        cohortType: true,
        cohortStartDate: true,
        cohortEndDate: true,
      },
    });
    res.json({ success: true, user: updated });
  } catch (err) { next(err); }
});

// TEMP: POST /api/admin/users/set-role — staging test only, remove after use
// Body: { email, role, passwordHash? }
adminRouter.post('/users/set-role', async (req, res, next) => {
  try {
    const { email, role, passwordHash } = req.body;
    if (!email || !role) {
      res.status(400).json({ success: false, error: 'email and role are required' });
      return;
    }
    const updateData: any = { role };
    if (passwordHash) updateData.passwordHash = passwordHash;
    const updated = await prisma.user.update({
      where: { email },
      data: updateData,
      select: { id: true, email: true, role: true, availableModes: true, activeMode: true },
    });
    res.json({ success: true, user: updated });
  } catch (err) { next(err); }
});


// POST /api/admin/data-fix/phase-c-commission-migration — OWB-C-08 one-time migration
// Creates commission_audit_logs table and backfills existing COASTAL_CORRIDOR reservations.
// Safe to re-run: all SQL statements are idempotent.
adminRouter.post('/data-fix/phase-c-commission-migration', async (req, res, next) => {
  try {
    // Step 1: Create the commission_audit_logs table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "commission_audit_logs" (
        "id"                          UUID        NOT NULL DEFAULT gen_random_uuid(),
        "stayBookingId"               UUID        NOT NULL,
        "reservationReference"        TEXT        NOT NULL,
        "channelOrigin"               TEXT        NOT NULL,
        "totalAmount"                 DECIMAL(12,2) NOT NULL,
        "currency"                    TEXT        NOT NULL DEFAULT 'NGN',
        "cohortMember"                BOOLEAN     NOT NULL DEFAULT false,
        "cohortType"                  TEXT,
        "appliedCommissionRate"       DECIMAL(5,2) NOT NULL,
        "rateSource"                  TEXT        NOT NULL,
        "channelCommissionAmount"     DECIMAL(12,2) NOT NULL,
        "channelCommissionPercent"    DECIMAL(5,2) NOT NULL,
        "netToHost"                   DECIMAL(12,2) NOT NULL,
        "ccProvidedCommissionAmount"  DECIMAL(12,2),
        "ccProvidedCommissionPercent" DECIMAL(5,2),
        "ccProvidedNetToHost"         DECIMAL(12,2),
        "hasDiscrepancy"              BOOLEAN     NOT NULL DEFAULT false,
        "discrepancyNote"             TEXT,
        "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "commission_audit_logs_pkey" PRIMARY KEY ("id")
      )
    `);

    // Step 2: Add FK if not exists
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'commission_audit_logs_stayBookingId_fkey'
        ) THEN
          ALTER TABLE "commission_audit_logs"
            ADD CONSTRAINT "commission_audit_logs_stayBookingId_fkey"
            FOREIGN KEY ("stayBookingId") REFERENCES "stay_bookings"("id") ON DELETE CASCADE;
        END IF;
      END $$
    `);

    // Step 3: Create indexes
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "commission_audit_logs_stayBookingId_idx" ON "commission_audit_logs"("stayBookingId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "commission_audit_logs_reservationReference_idx" ON "commission_audit_logs"("reservationReference")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "commission_audit_logs_channelOrigin_idx" ON "commission_audit_logs"("channelOrigin")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "commission_audit_logs_createdAt_idx" ON "commission_audit_logs"("createdAt")`);

    // Step 4: Backfill stay_bookings with null commission fields
    const backfillUpdate = await prisma.$executeRaw`
      UPDATE "stay_bookings"
      SET
        "channelCommissionPercent" = 15.00,
        "channelCommissionAmount"  = ROUND("totalAmount" * 0.15, 2),
        "netToHost"                = ROUND("totalAmount" * 0.85, 2)
      WHERE
        "channelOrigin" = 'COASTAL_CORRIDOR'
        AND "channelCommissionAmount" IS NULL
        AND "totalAmount" IS NOT NULL
    `;

    // Step 5: Insert audit log entries for all COASTAL_CORRIDOR bookings without one
    const backfillInsert = await prisma.$executeRaw`
      INSERT INTO "commission_audit_logs" (
        "stayBookingId", "reservationReference", "channelOrigin", "totalAmount", "currency",
        "cohortMember", "cohortType", "appliedCommissionRate", "rateSource",
        "channelCommissionAmount", "channelCommissionPercent", "netToHost",
        "ccProvidedCommissionAmount", "ccProvidedCommissionPercent", "ccProvidedNetToHost",
        "hasDiscrepancy", "discrepancyNote"
      )
      SELECT
        sb."id", sb."reference", sb."channelOrigin", sb."totalAmount", sb."currency",
        false, NULL, 15.00, 'BACKFILL_STANDARD',
        ROUND(sb."totalAmount" * 0.15, 2), 15.00, ROUND(sb."totalAmount" * 0.85, 2),
        NULL, NULL, NULL, false,
        'Backfilled by OWB-C-08 migration; cohort status not available retroactively'
      FROM "stay_bookings" sb
      WHERE
        sb."channelOrigin" = 'COASTAL_CORRIDOR'
        AND sb."totalAmount" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "commission_audit_logs" cal WHERE cal."stayBookingId" = sb."id"
        )
    `;

    logger.info('[Admin] Phase C commission migration completed', { backfillUpdate, backfillInsert });
    res.json({
      success: true,
      message: 'Phase C OWB-C-08 migration completed',
      tableCreated: true,
      bookingsBackfilled: Number(backfillUpdate),
      auditLogsInserted: Number(backfillInsert),
    });
  } catch (err) { next(err); }
});

// TEMP: POST /api/admin/data-fix/cc-undefined-reference — one-time fix, remove after use
adminRouter.post('/data-fix/cc-undefined-reference', async (req, res, next) => {
  try {
    const bookings = await prisma.stayBooking.findMany({
      where: { reference: 'CC-undefined' },
    });
    if (bookings.length === 0) {
      res.json({ success: true, message: 'No CC-undefined bookings found', fixed: 0 });
      return;
    }
    const results: any[] = [];
    for (const booking of bookings) {
      const shortId = booking.id.replace(/-/g, '').substring(0, 8).toUpperCase();
      const newReference = 'CC-TEST-' + shortId;
      await prisma.stayBooking.update({
        where: { id: booking.id },
        data: { reference: newReference },
      });
      results.push({ id: booking.id, oldReference: 'CC-undefined', newReference });
    }
    logger.info('[Admin] Fixed CC-undefined booking references', { count: results.length });
    res.json({ success: true, fixed: results.length, results });
  } catch (err) { next(err); }
});

// ─── OWB-C-08: Commission Audit Log Query ─────────────────────────────────────
// GET /api/admin/commission-audit-logs
// Query params: stayBookingId?, reservationReference?, limit? (default 20), offset? (default 0)
adminRouter.get('/commission-audit-logs', async (req, res, next) => {
  try {
    const { stayBookingId, reservationReference, limit = '20', offset = '0' } = req.query as Record<string, string>;
    const limitN = Math.min(parseInt(limit, 10) || 20, 100);
    const offsetN = parseInt(offset, 10) || 0;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (stayBookingId) {
      conditions.push(`"stayBookingId" = $${paramIdx++}::uuid`);
      params.push(stayBookingId);
    }
    if (reservationReference) {
      conditions.push(`"reservationReference" = $${paramIdx++}`);
      params.push(reservationReference);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const countResult = (await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM "commission_audit_logs" ${where}`,
      ...params
    )) as [{ count: bigint }];
    const total = Number(countResult[0]?.count ?? 0);

    // Fetch rows
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT * FROM "commission_audit_logs" ${where} ORDER BY "createdAt" DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      ...params, limitN, offsetN
    )) as any[];

    // Serialise BigInt / Decimal fields to strings for JSON
    const serialised = rows.map(r => {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(r)) {
        out[k] = typeof v === 'bigint' ? v.toString() : v;
      }
      return out;
    });

    res.json({ success: true, data: { total, logs: serialised } });
  } catch (err) { next(err); }
});

// ─── Cohort code management (E1 admin surface) ──────────────────────────────────
// GET /api/admin/cohort-codes
// Returns paginated list of all cohort codes ordered by createdAt desc.
// Query params: page (default 1), limit (default 50), isActive (filter)
adminRouter.get('/cohort-codes', async (req, res, next) => {
  try {
    const { page = 1, limit = 50, isActive } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive === 'true';
    const [cohorts, total] = await Promise.all([
      prisma.cohortCode.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.cohortCode.count({ where }),
    ]);
    res.json({ success: true, cohorts, total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

// POST /api/admin/cohort-codes
// Body: { code, name?, maxRedemptions?, isActive?, expiresAt?, modes? }
adminRouter.post('/cohort-codes', async (req, res, next) => {
  try {
    const { code, name, maxRedemptions, isActive, expiresAt, modes } = req.body;
    if (!code) {
      res.status(400).json({ success: false, error: 'code is required' });
      return;
    }
    const created = await prisma.cohortCode.create({
      data: {
        code,
        name: name ?? `Test code ${code}`,
        maxRedemptions: maxRedemptions ?? null,
        isActive: isActive !== undefined ? isActive : true,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        modes: modes ?? ['STAYS'],
      },
    });
    res.status(201).json({ success: true, data: created });
  } catch (err) { next(err); }
});

// GET /api/admin/cohort-codes/:code
adminRouter.get('/cohort-codes/:code', async (req, res, next) => {
  try {
    const cohort = await prisma.cohortCode.findUnique({ where: { code: req.params.code } });
    if (!cohort) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    res.json({ success: true, data: cohort });
  } catch (err) { next(err); }
});

// ─── TEST HELPER: Force-verify a user's email (bypasses email flow for staging) ─
// POST /api/admin/users/:id/verify-email
adminRouter.post('/users/:id/verify-email', async (req, res, next) => {
  try {
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isEmailVerified: true },
      select: { id: true, email: true, isEmailVerified: true },
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ─── VENDOR-MARKETPLACE-EXPANSION-01: Tag management (admin) ─────────────────
import { mergeTag, toggleCategoryVisibility } from '../services/vendorTags.service';

/**
 * GET /api/admin/tags
 * List all tags (including retired), ordered by usageCount desc.
 * AC-8
 */
adminRouter.get('/tags', async (req, res, next) => {
  try {
    const { includeRetired = 'false', limit = 50, page = 1 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where: any = {};
    if (includeRetired !== 'true') where.isRetired = false;
    const [tags, total] = await Promise.all([
      prisma.vendorTag.findMany({
        where,
        orderBy: { usageCount: 'desc' },
        skip,
        take: Number(limit),
        select: {
          id: true, label: true, normalised: true,
          usageCount: true, isRetired: true, canonicalId: true, createdAt: true,
        },
      }),
      prisma.vendorTag.count({ where }),
    ]);
    res.json({ success: true, tags, total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

/**
 * POST /api/admin/tags/merge
 * Merge retiredTagId into canonicalTagId.
 * AC-5
 */
adminRouter.post('/tags/merge', async (req, res, next) => {
  try {
    const { retiredTagId, canonicalTagId } = req.body;
    if (!retiredTagId || !canonicalTagId) {
      return res.status(400).json({ success: false, error: 'retiredTagId and canonicalTagId are required' });
    }
    const adminUserId = (req as any).userId;
    const result = await mergeTag(retiredTagId, canonicalTagId, adminUserId);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/tags/merge-audit
 * List tag merge audit log entries.
 * AC-5
 */
adminRouter.get('/tags/merge-audit', async (req, res, next) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [entries, total] = await Promise.all([
      prisma.tagMergeAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.tagMergeAuditLog.count(),
    ]);
    res.json({ success: true, entries, total });
  } catch (err) { next(err); }
});

/**
 * PATCH /api/admin/categories/vendor/:id/visibility
 * Toggle isPublicVisible on a vendor category.
 * AC-10
 */
adminRouter.patch('/categories/vendor/:id/visibility', async (req, res, next) => {
  try {
    const { isPublicVisible } = req.body;
    if (typeof isPublicVisible !== 'boolean') {
      return res.status(400).json({ success: false, error: 'isPublicVisible must be a boolean' });
    }
    const category = await toggleCategoryVisibility(req.params.id, isPublicVisible);
    res.json({ success: true, category });
  } catch (err) { next(err); }
});


// ─── OWAMBE-INTEREST-CAPTURE-HARDENING-01 ────────────
// GET /api/admin/cohort-interest
// Returns paginated list of cohort interest submissions.
// Query params: page (default 1), limit (default 50, max 200), source (filter)
adminRouter.get('/cohort-interest', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const source = req.query.source as string | undefined;
    const skip = (page - 1) * limit;

    const where = source ? { source } : {};

    const [total, submissions] = await Promise.all([
      prisma.cohortInterestSubmission.count({ where }),
      prisma.cohortInterestSubmission.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          source: true,
          emailForwardStatus: true,
          ackEmailStatus: true,
          submittedAt: true,
        },
      }),
    ]);

    res.json({
      success: true,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      submissions,
    });
  } catch (err) { next(err); }
});

// GET /api/admin/cohort-interest/export.csv
// Returns all submissions as a CSV file.
adminRouter.get('/cohort-interest/export.csv', async (req, res, next) => {
  try {
    const source = req.query.source as string | undefined;
    const where = source ? { source } : {};

    const submissions = await prisma.cohortInterestSubmission.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        email: true,
        source: true,
        emailForwardStatus: true,
        ackEmailStatus: true,
        submittedAt: true,
      },
    });

    const header = 'id,email,source,emailForwardStatus,ackEmailStatus,submittedAt';
    const rows = submissions.map((s) =>
      [
        s.id,
        `"${s.email}"`,
        s.source,
        s.emailForwardStatus,
        s.ackEmailStatus,
        s.submittedAt.toISOString(),
      ].join(',')
    );
    const csv = [header, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="cohort-interest-submissions.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});


// ─── TEMP: AC-9 probe calibration — retrieve channel hmacSecret for staging probe ──────────────
// OWB-F1-NEW-IMPLEMENTATION-01 AC-9 probe calibration endpoint.
// Returns the hmacSecret for a given channel slug so the probe script can sign requests correctly.
// MUST be removed after probe calibration is complete.
import type { Request, Response, NextFunction } from 'express';
adminRouter.get('/temp/channel-secret/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params as { slug: string };
    const channel = await prisma.channel.findUnique({
      where: { slug },
      select: { slug: true, hmacSecret: true, signatureHeader: true, timestampHeader: true, authScheme: true },
    });
    if (!channel) {
      res.status(404).json({ error: 'CHANNEL_NOT_FOUND' });
      return;
    }
    res.json({ slug: channel.slug, hmacSecret: channel.hmacSecret, signatureHeader: channel.signatureHeader, timestampHeader: channel.timestampHeader, authScheme: channel.authScheme });
  } catch (err) { next(err); }
});

// ─── E2: APPROVAL STATE MANAGEMENT ───────────────────────────────────────────
// OWB-E2-IMPLEMENTATION-01 Rev 1: Explicit isApproved field — approve/revoke endpoints
// Founder direction (2026-06-12, reconfirmed 2026-06-15):
//   "Use an explicit isApproved field rather than relying on isActive as a proxy.
//    Approval status and activation status should remain independently represented."
// Applicable entities: hosts, properties, operators, experiences

// ─── HOST APPROVAL ───────────────────────────────────
adminRouter.get('/hosts/pending', async (_req, res, next) => {
  try {
    const hosts = await prisma.host.findMany({
      where: { isApproved: false },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, createdAt: true } },
        properties: { select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ hosts });
  } catch (err) { next(err); }
});

adminRouter.get('/hosts', async (_req, res, next) => {
  try {
    const hosts = await prisma.host.findMany({
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, createdAt: true } },
        properties: { select: { id: true, name: true, isActive: true, isApproved: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ hosts });
  } catch (err) { next(err); }
});

adminRouter.post('/hosts/:id/approve', async (req, res, next) => {
  try {
    const host = await prisma.host.update({
      where: { id: req.params.id },
      data: { isApproved: true, approvedAt: new Date() },
      include: { user: true },
    });
    await sendEmail({
      to: host.user.email,
      subject: '✅ Your Owambe host profile has been approved!',
      template: 'host-approved',
      data: {
        firstName: host.user.firstName,
        businessName: host.businessName || host.user.firstName,
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/host/dashboard`,
      },
    });
    logger.info(`Host approved: ${host.id} — ${host.businessName || host.user.email}`);
    res.json({ success: true, host });
  } catch (err) { next(err); }
});

adminRouter.post('/hosts/:id/revoke', async (req, res, next) => {
  try {
    const host = await prisma.host.update({
      where: { id: req.params.id },
      data: { isApproved: false, approvedAt: null },
      include: { user: true },
    });
    logger.info(`Host approval revoked: ${host.id} — ${host.businessName || host.user.email}`);
    res.json({ success: true, host });
  } catch (err) { next(err); }
});

// ─── PROPERTY APPROVAL ───────────────────────────────
adminRouter.get('/properties/pending', async (_req, res, next) => {
  try {
    const properties = await prisma.property.findMany({
      where: { isApproved: false },
      include: {
        host: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
        rooms: { select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ properties });
  } catch (err) { next(err); }
});

adminRouter.get('/properties', async (_req, res, next) => {
  try {
    const properties = await prisma.property.findMany({
      include: {
        host: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
        rooms: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ properties });
  } catch (err) { next(err); }
});

adminRouter.post('/properties/:id/approve', async (req, res, next) => {
  try {
    const property = await prisma.property.update({
      where: { id: req.params.id },
      data: { isApproved: true, approvedAt: new Date() },
      include: { host: { include: { user: true } } },
    });
    await sendEmail({
      to: property.host.user.email,
      subject: '✅ Your property listing has been approved on Owambe!',
      template: 'property-approved',
      data: {
        firstName: property.host.user.firstName,
        propertyName: property.name,
        listingUrl: `${process.env.NEXT_PUBLIC_APP_URL}/stays/${property.slug}`,
      },
    });
    logger.info(`Property approved: ${property.id} — ${property.name}`);
    res.json({ success: true, property });
  } catch (err) { next(err); }
});

adminRouter.post('/properties/:id/revoke', async (req, res, next) => {
  try {
    const property = await prisma.property.update({
      where: { id: req.params.id },
      data: { isApproved: false, approvedAt: null },
      include: { host: { include: { user: true } } },
    });
    logger.info(`Property approval revoked: ${property.id} — ${property.name}`);
    res.json({ success: true, property });
  } catch (err) { next(err); }
});

// ─── OPERATOR APPROVAL ───────────────────────────────
adminRouter.get('/operators/pending', async (_req, res, next) => {
  try {
    const operators = await prisma.operator.findMany({
      where: { isApproved: false },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, createdAt: true } },
        experiences: { select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ operators });
  } catch (err) { next(err); }
});

adminRouter.get('/operators', async (_req, res, next) => {
  try {
    const operators = await prisma.operator.findMany({
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, createdAt: true } },
        experiences: { select: { id: true, name: true, isActive: true, isApproved: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ operators });
  } catch (err) { next(err); }
});

adminRouter.post('/operators/:id/approve', async (req, res, next) => {
  try {
    const operator = await prisma.operator.update({
      where: { id: req.params.id },
      data: { isApproved: true, approvedAt: new Date() },
      include: { user: true },
    });
    await sendEmail({
      to: operator.user.email,
      subject: '✅ Your Owambe operator profile has been approved!',
      template: 'operator-approved',
      data: {
        firstName: operator.user.firstName,
        businessName: operator.businessName || operator.user.firstName,
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/operator/dashboard`,
      },
    });
    logger.info(`Operator approved: ${operator.id} — ${operator.businessName || operator.user.email}`);
    res.json({ success: true, operator });
  } catch (err) { next(err); }
});

adminRouter.post('/operators/:id/revoke', async (req, res, next) => {
  try {
    const operator = await prisma.operator.update({
      where: { id: req.params.id },
      data: { isApproved: false, approvedAt: null },
      include: { user: true },
    });
    logger.info(`Operator approval revoked: ${operator.id} — ${operator.businessName || operator.user.email}`);
    res.json({ success: true, operator });
  } catch (err) { next(err); }
});

// ─── EXPERIENCE APPROVAL ─────────────────────────────
adminRouter.get('/experiences/pending', async (_req, res, next) => {
  try {
    const experiences = await prisma.experience.findMany({
      where: { isApproved: false },
      include: {
        operator: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ experiences });
  } catch (err) { next(err); }
});

adminRouter.get('/experiences', async (_req, res, next) => {
  try {
    const experiences = await prisma.experience.findMany({
      include: {
        operator: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ experiences });
  } catch (err) { next(err); }
});

adminRouter.post('/experiences/:id/approve', async (req, res, next) => {
  try {
    const experience = await prisma.experience.update({
      where: { id: req.params.id },
      data: { isApproved: true, approvedAt: new Date() },
      include: { operator: { include: { user: true } } },
    });
    await sendEmail({
      to: experience.operator.user.email,
      subject: '✅ Your experience listing has been approved on Owambe!',
      template: 'experience-approved',
      data: {
        firstName: experience.operator.user.firstName,
        experienceName: experience.name,
        listingUrl: `${process.env.NEXT_PUBLIC_APP_URL}/experiences/${experience.slug}`,
      },
    });
    logger.info(`Experience approved: ${experience.id} — ${experience.name}`);
    res.json({ success: true, experience });
  } catch (err) { next(err); }
});

adminRouter.post('/experiences/:id/revoke', async (req, res, next) => {
  try {
    const experience = await prisma.experience.update({
      where: { id: req.params.id },
      data: { isApproved: false, approvedAt: null },
      include: { operator: { include: { user: true } } },
    });
    logger.info(`Experience approval revoked: ${experience.id} — ${experience.name}`);
    res.json({ success: true, experience });
  } catch (err) { next(err); }
});

// ─── E2B: ALL VENDORS (for Commission surface) ───────
adminRouter.get('/vendors', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50, search } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { businessName: { contains: String(search), mode: 'insensitive' } },
        { user: { email: { contains: String(search), mode: 'insensitive' } } },
      ];
    }
    const [vendors, total] = await Promise.all([
      prisma.vendor.findMany({
        where,
        select: {
          id: true, businessName: true, category: true, city: true,
          status: true, commissionRate: true, launchBonusActive: true,
          launchBonusExpiresAt: true, createdAt: true, verifiedAt: true,
          user: { select: { email: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.vendor.count({ where }),
    ]);
    res.json({ success: true, vendors, total });
  } catch (err) { next(err); }
});

// ─── E2B: EVENTS LISTING (for Events surface) ────────
adminRouter.get('/events', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const where: any = {};
    if (status) where.status = status;
    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          planner: { include: { user: { select: { email: true, firstName: true, lastName: true } } } },
          _count: { select: { attendees: true, ticketTypes: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.event.count({ where }),
    ]);
    res.json({ success: true, events, total });
  } catch (err) { next(err); }
});

// ─── GCO01-SMOKE: Create PAID guest booking for AC-3 smoke test ──────────────
// STAGING-ONLY: Creates a pre-confirmed PAID booking to enable claim-account
// flow testing without requiring a live Paystack checkout.
// Protected by ADMIN role. Remove before production promotion.
adminRouter.post('/gco01-smoke/paid-booking', async (req, res, next) => {
  try {
    const { guestEmail, guestName } = req.body;
    if (!guestEmail || !guestName) {
      return res.status(400).json({ success: false, error: 'guestEmail and guestName required' });
    }
    const ts = Date.now();
    const booking = await prisma.experienceBooking.create({
      data: {
        reference: `EXP-AC3-SMOKE-${ts}`,
        experienceId: 'd139f687-9b13-42f4-adc2-79eb1b5ae521',
        slotId: '2e6444e8-40ff-437d-ae0c-b5e22e6c8b7a',
        guestName,
        guestEmail,
        guestPhone: '+2348012345678',
        guestCount: 1,
        totalAmount: 5000,
        currency: 'NGN',
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        paystackRef: `EXP-AC3-SMOKE-${ts}`,
        confirmedAt: new Date(),
        guestUserId: null,
        guestId: null,
      }
    });
    res.status(201).json({ success: true, data: booking });
  } catch (err) { next(err); }
});
