import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { validateEnv } from './utils/env';
import { rateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { requestId, ipLogger, auditLog, requestTimeout } from './middleware/security';

import { authRouter } from './routes/auth';
import { eventsRouter } from './routes/events';
import { attendeesRouter } from './routes/attendees';
import { vendorsRouter } from './routes/vendors';
import { bookingsRouter } from './routes/bookings';
import { paymentsRouter } from './routes/payments';
import { speakersRouter } from './routes/speakers';
import { sponsorsRouter } from './routes/sponsors';
import { emailsRouter } from './routes/emails';
import { analyticsRouter } from './routes/analytics';
import { uploadRouter } from './routes/upload';
import { aiRouter } from './routes/ai';
import { adminRouter } from './routes/admin';
import { notificationsRouter } from './routes/notifications';
import { messagesRouter } from './routes/messages';
import { contractsRouter } from './routes/contracts';
import { tenantsRouter } from './routes/tenants';
import { promosRouter } from './routes/promos';
import { waitlistRouter } from './routes/waitlist';
import { ticketsRouter } from './routes/tickets';
import { crmRouter } from './routes/crm';
import { instalmentsRouter } from './routes/instalments';
import { distributionRouter } from './routes/distribution';
import modeRouter from './routes/mode';
import propertiesRouter from './routes/properties';
import channelRouter from './routes/channel';
import { usersRouter } from './routes/users';
import experiencesRouter from './routes/experiences';
import stayBookingsRouter from './routes/stay-bookings';
import experienceBookingsRouter from './routes/experience-bookings';
import { initQueues, startWorkers, closeQueues } from './services/queue.service';
import { initWebhookDispatcher, closeWebhookDispatcher } from './services/webhookDispatcher.service';
import { initReconciliationCron, closeReconciliationCron } from './services/reconciliation.service';

import { initSocket } from './socket';
import { logger } from './utils/logger';
import { prisma } from './database/client';

validateEnv();

export const app = express();
export const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000', credentials: true },
  transports: ['websocket', 'polling'],
});
initSocket(io);

app.set('trust proxy', 1);
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: [
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    process.env.WHITELABEL_URL || 'http://localhost:3001',
    'http://localhost:3002',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
app.use(compression());
app.use(requestId);
app.use(ipLogger);
app.use(requestTimeout(30000));
app.use('/api/payments/webhook/paystack', express.raw({ type: 'application/json' }));
// Skip express.json() for /api/v1/channel routes — those routes use express.raw() inside
// the channel router to capture the raw body for HMAC verification.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/v1/channel')) return next();
  express.json({ limit: '10mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);
app.use(auditLog);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'owambe-api', version: "1.0.0", environment: process.env.NODE_ENV || "development", build: (process.env.RAILWAY_GIT_COMMIT_SHA || "local").slice(0, 8) });
});

// Phase B: DB schema health check (staging diagnostics)
app.get('/health/db', async (_req, res) => {
  try {
    // Check if Phase B tables exist by running a simple count query
    const [stayBookingCount, calendarEntryCount] = await Promise.all([
      prisma.stayBooking.count().catch((e: Error) => ({ error: e.message })),
      prisma.calendarEntry.count().catch((e: Error) => ({ error: e.message })),
    ]);
    res.json({
      status: 'ok',
      tables: {
        stay_bookings: typeof stayBookingCount === 'number' ? { exists: true, count: stayBookingCount } : { exists: false, error: stayBookingCount },
        calendar_entries: typeof calendarEntryCount === 'number' ? { exists: true, count: calendarEntryCount } : { exists: false, error: calendarEntryCount },
      },
    });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
});


app.use('/api/auth', rateLimiter({ windowMs: 60000, max: 15 }));
app.use('/api/ai', rateLimiter({ windowMs: 60000, max: 20 }));
app.use('/api/upload', rateLimiter({ windowMs: 60000, max: 30 }));
app.use('/api', rateLimiter({ windowMs: 60000, max: 300 }));

// Phase B: Coastal Corridor inbound channel router (HMAC-signed, no JWT auth)
// MUST be mounted before messagesRouter (/api catch-all) to avoid JWT auth interception
app.use('/api/v1/channel', channelRouter);

// Phase B: User self-service routes (change password, profile)
app.use('/api/users', usersRouter);

app.use('/api/auth', authRouter);
app.use('/api/events', eventsRouter);
app.use('/api/attendees', attendeesRouter);
app.use('/api/vendors', vendorsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/speakers', speakersRouter);
app.use('/api/sponsors', sponsorsRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/ai', aiRouter);
app.use('/api/admin', adminRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api', messagesRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/tenants', tenantsRouter);
app.use('/api/promos', promosRouter);
app.use('/api/waitlist', waitlistRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/crm', crmRouter);
app.use('/api/instalments', instalmentsRouter);
app.use('/api/distribution', distributionRouter);
// Phase A: Three-mode routes
app.use('/api/mode', modeRouter);
app.use('/api/properties', propertiesRouter);
app.use('/api/experiences', experiencesRouter);
app.use('/api/stay-bookings', stayBookingsRouter);
app.use('/api/experience-bookings', experienceBookingsRouter);

app.use((_req, res) => { res.status(404).json({ success: false, error: 'Route not found' }); });
app.use(errorHandler);

const PORT = Number(process.env.API_PORT) || 4000;

async function runPhaseA5EnumMigration() {
  // Migrate CohortType enum values from program-tier model to role-type model
  // per brief Q&A v1.1 Q02. Uses DO $$ block to safely skip if already migrated.
  try {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'COASTAL_CORRIDOR'
                   AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'CohortType')) THEN
          ALTER TYPE "CohortType" RENAME VALUE 'COASTAL_CORRIDOR' TO 'COASTAL_CORRIDOR_HOST';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'COASTAL_CORRIDOR_OPERATOR'
                       AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'CohortType')) THEN
          ALTER TYPE "CohortType" ADD VALUE 'COASTAL_CORRIDOR_OPERATOR';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'BOTH'
                       AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'CohortType')) THEN
          ALTER TYPE "CohortType" ADD VALUE 'BOTH';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'USED'
                       AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'CohortCodeStatus')) THEN
          ALTER TYPE "CohortCodeStatus" ADD VALUE 'USED';
        END IF;
      END
      $$;
    `);
    logger.info('Phase A.5 enum migration: CohortType and CohortCodeStatus updated.');
  } catch (err: any) {
    logger.warn('Phase A.5 enum migration (non-fatal):', err.message);
  }
}

async function runPhaseA5Migration() {
  try {
    const usersNeedingBackfill = await prisma.user.count({ where: { onboardedAt: null } });
    if (usersNeedingBackfill === 0) {
      logger.info('Phase A.5 migration: already complete.');
      return;
    }
    logger.info(`Phase A.5 migration: backfilling ${usersNeedingBackfill} users...`);
    await prisma.user.updateMany({
      where: { onboardedAt: null },
      data: { activeMode: 'EVENTS', availableModes: ['EVENTS'], cohortMember: false, channelOrigin: 'DIRECT', preferredCurrency: 'NGN' },
    });
    await prisma.$executeRaw`UPDATE users SET "onboardedAt" = "createdAt" WHERE "onboardedAt" IS NULL`;
    logger.info(`Phase A.5 migration: complete. Backfilled ${usersNeedingBackfill} users.`);
  } catch (err: any) {
    logger.warn('Phase A.5 migration error (non-fatal):', err.message);
  }
}

async function removeProductionSeededAccounts(): Promise<void> {
  // Remove seeded and test accounts from the production database.
  // Covers all patterns surfaced during the Phase A.5 / Phase B pre-deployment audit:
  //   - planner@test.com          (original seed account)
  //   - *@owambe.test             (planner@, vendor@, consumer@, admin@owambe.test)
  //   - smoke_*@*.owambe.com      (smoke_prod_*, smoke_final_*, smoke_v2_*)
  //   - verify_*@owambe.com       (verify_test@owambe.com)
  //   - regression_*@*            (regression test accounts)
  //   - migration_check_*@*       (migration verification accounts)
  //   - *@owambe-vendor.com       (seeded vendor demo accounts)
  //   - admin@owambe.com          (seeded admin account — replaced by founder admin)
  // This function is idempotent — safe to run on every startup.
  // It performs a cascade delete: planners, vendors, and related records are removed first.
  if (process.env.NODE_ENV !== 'production') return;
  try {
    const seededUsers = await prisma.user.findMany({
      where: {
        OR: [
          { email: 'planner@test.com' },
          { email: 'admin@owambe.com' },
          { email: { endsWith: '@owambe.test' } },
          { email: { endsWith: '@owambe-vendor.com' } },
          { email: { startsWith: 'smoke_', contains: '@' } },
          { email: { startsWith: 'verify_', endsWith: '@owambe.com' } },
          { email: { startsWith: 'regression_' } },
          { email: { startsWith: 'migration_check_' } },
        ],
      },
      select: { id: true, email: true },
    });

    if (seededUsers.length === 0) {
      logger.info('Production credential cleanup: no seeded accounts found (already clean).');
      return;
    }

    const userIds = seededUsers.map((u) => u.id);
    const emails = seededUsers.map((u) => u.email);

    // Cascade delete in dependency order
    const vendorRecords = await prisma.vendor.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    const vendorIds = vendorRecords.map((v) => v.id);

    if (vendorIds.length > 0) {
      await prisma.booking.deleteMany({ where: { vendorId: { in: vendorIds } } });
      await prisma.contract.deleteMany({ where: { vendorId: { in: vendorIds } } });
      await prisma.quote.deleteMany({ where: { vendorId: { in: vendorIds } } });
      await prisma.portfolioItem.deleteMany({ where: { vendorId: { in: vendorIds } } });
      await prisma.vendorAvailability.deleteMany({ where: { vendorId: { in: vendorIds } } });
      await prisma.vendorPackage.deleteMany({ where: { vendorId: { in: vendorIds } } });
      await prisma.review.deleteMany({ where: { vendorId: { in: vendorIds } } });
    }

    await prisma.planner.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.vendor.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });

    const deleted = await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    logger.info(
      `Production credential cleanup: removed ${deleted.count} seeded account(s): ${emails.join(', ')}.`
    );
  } catch (err: any) {
    logger.warn('Production credential cleanup (non-fatal):', err.message);
  }
}

async function ensureStagingPlannerProfile(): Promise<void> {
  // Ensure the seeded planner@test.com user has a corresponding planner profile record.
  // This is idempotent — safe to run on every startup in staging/development.
  if (process.env.NODE_ENV === 'production') return;
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'planner@test.com' },
      include: { planner: true }
    });
    if (!user) return;
    if (user.planner) {
      logger.info('Staging bootstrap: planner profile already exists for planner@test.com');
      return;
    }
    await prisma.planner.create({
      data: { userId: user.id, companyName: 'AO Events Lagos', plan: 'GROWTH' }
    });
    logger.info('Staging bootstrap: created missing planner profile for planner@test.com');
  } catch (err: any) {
    logger.warn('Staging planner profile bootstrap (non-fatal):', err.message);
  }
}

async function bootstrap() {
  try {
    await prisma.$connect();
    logger.info('Database connected');
    await runPhaseA5EnumMigration();
    await runPhaseA5Migration();
    await removeProductionSeededAccounts();
    await ensureStagingPlannerProfile();
    await initQueues();
    await startWorkers();
    await initWebhookDispatcher();
    await initReconciliationCron();
    httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info(`Owambe API running on port ${PORT}`);
    });
    process.on('SIGTERM', async () => { httpServer.close(); await closeQueues(); await closeWebhookDispatcher(); await closeReconciliationCron(); await prisma.$disconnect(); process.exit(0); });
    process.on('SIGINT', async () => { await closeQueues(); await closeWebhookDispatcher(); await closeReconciliationCron(); await prisma.$disconnect(); process.exit(0); });
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') { bootstrap(); }

export { io };
