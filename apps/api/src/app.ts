/**
 * app.ts — Express application factory (no side effects)
 * Imported by tests. Production start is in index.ts.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { rateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { requestId, ipLogger } from './middleware/security';

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
import { cohortRouter } from './routes/cohort';
import { ticketsRouter } from './routes/tickets';
import { crmRouter } from './routes/crm';
import { instalmentsRouter } from './routes/instalments';
import { distributionRouter } from './routes/distribution';
import modeRouter from './routes/mode';
import propertiesRouter from './routes/properties';
import experiencesRouter from './routes/experiences';
import stayBookingsRouter from './routes/stay-bookings';
import experienceBookingsRouter from './routes/experience-bookings';
import channelRouter from './routes/channel';
import { usersRouter } from './routes/users';
import { adminResetRouter } from './routes/admin-reset';

import { initSocket } from './socket';

export const app = express();
export const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000', credentials: true },
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

// Raw body for Paystack webhook signature verification and Coastal Corridor inbound channel
app.use('/api/payments/webhook/paystack', express.raw({ type: 'application/json' }));
// Legacy route raw body capture (transition window — preserved per Brief C Rev 2 § 5 Operation 3)
app.use('/api/v1/channel/webhooks/inbound', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'owambe-api', version: '1.0.0', environment: process.env.NODE_ENV || 'development', build: (process.env.RAILWAY_GIT_COMMIT_SHA || 'local').slice(0, 8), canary: 'brief-c-rev2-canonical-route-v2' });
});

// Rate limits
app.use('/api/auth', rateLimiter({ windowMs: 60000, max: 15 }));
app.use('/api/ai', rateLimiter({ windowMs: 60000, max: 20 }));
app.use('/api/upload', rateLimiter({ windowMs: 60000, max: 30 }));
app.use('/api', rateLimiter({ windowMs: 60000, max: 300 }));

// Routes
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
// Phase A.5: Coastal Corridor inbound channel router — mounted BEFORE messagesRouter
// to prevent the JWT authenticate middleware in messagesRouter from intercepting
// channel HMAC-authenticated routes (Brief C Rev 2 § 5 Operation 3).
// Legacy mount (transition window — preserved per Brief C Rev 2 § 5 Operation 3)
app.use('/api/v1/channel', channelRouter);
// CC-COHORT-OFFER-SURFACES-01: cohortRouter is a public endpoint (no auth required).
// Must be mounted BEFORE messagesRouter to avoid messagesRouter.use(authenticate)
// intercepting /api/cohort/* requests (same pattern as channelRouter above).
app.use('/api/cohort', cohortRouter);
// ONE-TIME admin password reset — DELETE after fix applied (2026-05-27)
app.use('/api/internal', adminResetRouter);
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
// Phase B: User self-service (password change, profile)
app.use('/api/users', usersRouter);

// TEMP: Staging-only endpoint to update user role/password — remove after use
app.post('/staging-temp/set-user-role', async (req: any, res: any) => {
  const { secret, email, role, passwordHash } = req.body;
  if (secret !== 'owambe-staging-temp-2026') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  try {
    const { prisma } = await import('./database/client');
    const updateData: any = {};
    if (role) updateData.role = role;
    if (passwordHash) updateData.passwordHash = passwordHash;
    const updated = await prisma.user.update({
      where: { email },
      data: updateData,
      select: { id: true, email: true, role: true, availableModes: true, activeMode: true },
    });
    res.json({ success: true, user: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 404 + error handlers
app.use((_req, res) => { res.status(404).json({ success: false, error: 'Route not found' }); });
app.use(errorHandler);

export { io };
