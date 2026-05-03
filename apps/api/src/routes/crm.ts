import { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { body } from 'express-validator';
import { prisma } from '../database/client';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import {
  SalesforceAdapter,
  HubSpotAdapter,
  DEFAULT_ATTENDEE_FIELD_MAP_SF,
  DEFAULT_ATTENDEE_FIELD_MAP_HS,
  bookingToDeal,
  attendeeToContact,
} from '../services/crm.service';

export const crmRouter = Router();

const SF_CLIENT_ID     = process.env.SF_CLIENT_ID     || '';
const SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET || '';
const HS_CLIENT_ID     = process.env.HS_CLIENT_ID     || '';
const HS_CLIENT_SECRET = process.env.HS_CLIENT_SECRET || '';
const APP_URL          = process.env.NEXT_PUBLIC_APP_URL || 'https://owambe.com';

// ─── HELPER: get authenticated planner ────────────────
async function getPlanner(userId: string) {
  const planner = await prisma.planner.findFirst({ where: { userId } });
  if (!planner) throw new AppError('Planner not found', 404);
  if (planner.plan !== 'SCALE') {
    throw new AppError('CRM integration requires the Scale plan (₦450K/mo)', 403);
  }
  return planner;
}

// ─── HELPER: get + refresh connection ─────────────────
async function getActiveConnection(connectionId: string) {
  const conn = await prisma.crmConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new AppError('CRM connection not found', 404);
  if (!conn.isActive) throw new AppError('CRM connection is disabled', 400);

  // Auto-refresh token if expired
  if (conn.tokenExpiresAt && conn.tokenExpiresAt < new Date()) {
    if (!conn.refreshToken) throw new AppError('Token expired and no refresh token. Reconnect.', 401);

    let refreshed: any;
    if (conn.provider === 'SALESFORCE') {
      refreshed = await SalesforceAdapter.refreshToken(conn.refreshToken, SF_CLIENT_ID, SF_CLIENT_SECRET);
    } else {
      refreshed = await HubSpotAdapter.refreshToken(conn.refreshToken, HS_CLIENT_ID, HS_CLIENT_SECRET);
    }

    const updated = await prisma.crmConnection.update({
      where: { id: conn.id },
      data: {
        accessToken: refreshed.accessToken,
        ...(refreshed.refreshToken && { refreshToken: refreshed.refreshToken }),
        tokenExpiresAt: refreshed.expiresAt,
        ...(refreshed.instanceUrl && { instanceUrl: refreshed.instanceUrl }),
      },
    });
    return updated;
  }

  return conn;
}

// ─── 1. LIST CONNECTIONS ─────────────────────────────
crmRouter.get('/', authenticate, requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const planner = await getPlanner((req as any).userId);
    const connections = await prisma.crmConnection.findMany({
      where: { plannerId: planner.id },
      select: {
        id: true, provider: true, isActive: true,
        syncDirection: true, syncAttendees: true, syncBookings: true,
        syncContacts: true, autoSyncEnabled: true, syncIntervalHours: true,
        attendeeFieldMap: true, bookingFieldMap: true,
        crmContactOwnerId: true, crmPipelineId: true,
        lastSyncAt: true, lastSyncStatus: true, lastSyncError: true,
        totalSynced: true, totalErrors: true, createdAt: true,
        instanceUrl: true, portalId: true,
        // Never expose tokens
      },
    });
    res.json({ success: true, connections });
  } catch (err) { next(err); }
});

// ─── 2. GET OAUTH URL ─────────────────────────────────
crmRouter.get('/oauth/:provider/url', authenticate, requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const planner = await getPlanner((req as any).userId);
    const { provider } = req.params;
    const redirectUri = `${APP_URL}/api/crm/oauth/${provider}/callback`;

    if (provider === 'SALESFORCE') {
      if (!SF_CLIENT_ID) throw new AppError('Salesforce OAuth not configured', 503);
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: SF_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: 'api refresh_token',
        state: planner.id,
      });
      const url = `https://login.salesforce.com/services/oauth2/authorize?${params}`;
      res.json({ success: true, url });
    } else if (provider === 'HUBSPOT') {
      if (!HS_CLIENT_ID) throw new AppError('HubSpot OAuth not configured', 503);
      const url = HubSpotAdapter.getAuthUrl(HS_CLIENT_ID, redirectUri);
      res.json({ success: true, url });
    } else {
      throw new AppError('Unsupported CRM provider', 400);
    }
  } catch (err) { next(err); }
});

// ─── 3. OAUTH CALLBACK (handles redirect from CRM) ────
crmRouter.get('/oauth/:provider/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider } = req.params;
    const { code, state: plannerId, error } = req.query as Record<string, string>;

    if (error) {
      return res.redirect(`${APP_URL}/dashboard/crm?error=${encodeURIComponent(error)}`);
    }
    if (!code || !plannerId) throw new AppError('Missing code or state', 400);

    const redirectUri = `${APP_URL}/api/crm/oauth/${provider}/callback`;
    let connectionData: any;

    if (provider === 'SALESFORCE') {
      const tokens = await SalesforceAdapter.exchangeCode(code, redirectUri, SF_CLIENT_ID, SF_CLIENT_SECRET);
      connectionData = {
        plannerId,
        provider: 'SALESFORCE',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        instanceUrl: tokens.instanceUrl,
        attendeeFieldMap: DEFAULT_ATTENDEE_FIELD_MAP_SF,
        bookingFieldMap: {},
      };
    } else if (provider === 'HUBSPOT') {
      const tokens = await HubSpotAdapter.exchangeCode(code, redirectUri, HS_CLIENT_ID, HS_CLIENT_SECRET);
      connectionData = {
        plannerId,
        provider: 'HUBSPOT',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        portalId: tokens.portalId,
        attendeeFieldMap: DEFAULT_ATTENDEE_FIELD_MAP_HS,
        bookingFieldMap: {},
      };
    } else {
      throw new AppError('Unsupported provider', 400);
    }

    // Upsert connection
    await prisma.crmConnection.upsert({
      where: { plannerId_provider: { plannerId, provider: provider.toUpperCase() as any } },
      create: connectionData,
      update: {
        accessToken: connectionData.accessToken,
        refreshToken: connectionData.refreshToken,
        tokenExpiresAt: connectionData.tokenExpiresAt,
        instanceUrl: connectionData.instanceUrl,
        portalId: connectionData.portalId,
        isActive: true,
      },
    });

    logger.info(`CRM connected: ${provider} for planner ${plannerId}`);
    res.redirect(`${APP_URL}/dashboard/crm?connected=${provider}`);
  } catch (err) { next(err); }
});

// ─── 4. MANUAL CONNECT (with API key / token) ─────────
crmRouter.post('/connect',
  authenticate, requireRole('PLANNER'),
  [
    body('provider').isIn(['SALESFORCE', 'HUBSPOT']),
    body('accessToken').notEmpty(),
    body('instanceUrl').optional(),
    body('portalId').optional(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const planner = await getPlanner((req as any).userId);
      const { provider, accessToken, refreshToken, instanceUrl, portalId } = req.body;

      // Test the connection
      let testResult: any;
      if (provider === 'SALESFORCE') {
        if (!instanceUrl) throw new AppError('instanceUrl required for Salesforce', 400);
        const adapter = new SalesforceAdapter(instanceUrl, accessToken);
        testResult = await adapter.testConnection();
      } else {
        const adapter = new HubSpotAdapter(accessToken);
        testResult = await adapter.testConnection();
      }

      const conn = await prisma.crmConnection.upsert({
        where: { plannerId_provider: { plannerId: planner.id, provider } },
        create: {
          plannerId: planner.id,
          provider,
          accessToken,
          refreshToken: refreshToken || null,
          instanceUrl: instanceUrl || null,
          portalId: portalId || testResult.portalId || null,
          isActive: true,
          attendeeFieldMap: provider === 'SALESFORCE' ? DEFAULT_ATTENDEE_FIELD_MAP_SF : DEFAULT_ATTENDEE_FIELD_MAP_HS,
        },
        update: {
          accessToken,
          refreshToken: refreshToken || null,
          instanceUrl: instanceUrl || null,
          isActive: true,
          lastSyncStatus: 'IDLE',
          lastSyncError: null,
        },
      });

      logger.info(`CRM connected manually: ${provider} (planner ${planner.id})`);
      res.status(201).json({
        success: true,
        connection: { id: conn.id, provider, isActive: true },
        crmInfo: testResult,
      });
    } catch (err) { next(err); }
  }
);

// ─── 5. UPDATE SETTINGS ───────────────────────────────
crmRouter.put('/:connectionId', authenticate, requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await getPlanner((req as any).userId);
    const {
      syncDirection, syncAttendees, syncBookings, syncContacts,
      autoSyncEnabled, syncIntervalHours, attendeeFieldMap, bookingFieldMap,
      crmContactOwnerId, crmPipelineId, isActive,
    } = req.body;

    const updated = await prisma.crmConnection.update({
      where: { id: req.params.connectionId },
      data: {
        ...(syncDirection !== undefined && { syncDirection }),
        ...(syncAttendees !== undefined && { syncAttendees }),
        ...(syncBookings !== undefined && { syncBookings }),
        ...(syncContacts !== undefined && { syncContacts }),
        ...(autoSyncEnabled !== undefined && { autoSyncEnabled }),
        ...(syncIntervalHours !== undefined && { syncIntervalHours: Number(syncIntervalHours) }),
        ...(attendeeFieldMap !== undefined && { attendeeFieldMap }),
        ...(bookingFieldMap !== undefined && { bookingFieldMap }),
        ...(crmContactOwnerId !== undefined && { crmContactOwnerId }),
        ...(crmPipelineId !== undefined && { crmPipelineId }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json({ success: true, connection: updated });
  } catch (err) { next(err); }
});

// ─── 6. DISCONNECT ────────────────────────────────────
crmRouter.delete('/:connectionId', authenticate, requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await getPlanner((req as any).userId);
    await prisma.crmConnection.delete({ where: { id: req.params.connectionId } });
    res.json({ success: true, message: 'CRM connection removed' });
  } catch (err) { next(err); }
});

// ─── 7. SYNC LOGS ─────────────────────────────────────
crmRouter.get('/:connectionId/logs', authenticate, requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await getPlanner((req as any).userId);
    const { limit = 50, page = 1 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      prisma.crmSyncLog.findMany({
        where: { connectionId: req.params.connectionId },
        orderBy: { syncedAt: 'desc' },
        take: Number(limit),
        skip,
      }),
      prisma.crmSyncLog.count({ where: { connectionId: req.params.connectionId } }),
    ]);

    res.json({ success: true, logs, total });
  } catch (err) { next(err); }
});

// ─── 8. MANUAL SYNC ───────────────────────────────────
crmRouter.post('/:connectionId/sync', authenticate, requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const planner = await getPlanner((req as any).userId);
    const conn = await getActiveConnection(req.params.connectionId);

    // Verify this connection belongs to the planner
    if (conn.plannerId !== planner.id) throw new AppError('Access denied', 403);

    // Mark as syncing
    await prisma.crmConnection.update({
      where: { id: conn.id },
      data: { lastSyncStatus: 'SYNCING' },
    });

    // Run sync async (don't block response)
    runSync(conn, planner).catch(err => logger.error('Sync error:', err));

    res.json({ success: true, message: 'Sync started. Check logs for progress.' });
  } catch (err) { next(err); }
});

// ─── 9. GET CRM METADATA (pipelines, stages) ──────────
crmRouter.get('/:connectionId/metadata', authenticate, requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await getPlanner((req as any).userId);
    const conn = await getActiveConnection(req.params.connectionId);

    let metadata: any = {};
    if (conn.provider === 'HUBSPOT') {
      const adapter = new HubSpotAdapter(conn.accessToken);
      metadata.pipelines = await adapter.getPipelines();
    } else if (conn.provider === 'SALESFORCE') {
      const adapter = new SalesforceAdapter(conn.instanceUrl!, conn.accessToken);
      metadata.opportunityStages = await adapter.getOpportunityStages();
    }

    res.json({ success: true, metadata });
  } catch (err) { next(err); }
});

// ─── 10. TEST CONNECTION ─────────────────────────────
crmRouter.post('/:connectionId/test', authenticate, requireRole('PLANNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await getPlanner((req as any).userId);
    const conn = await getActiveConnection(req.params.connectionId);

    let info: any;
    if (conn.provider === 'SALESFORCE') {
      const adapter = new SalesforceAdapter(conn.instanceUrl!, conn.accessToken);
      info = await adapter.testConnection();
    } else {
      const adapter = new HubSpotAdapter(conn.accessToken);
      info = await adapter.testConnection();
    }

    res.json({ success: true, connected: true, info });
  } catch (err) {
    res.json({ success: false, connected: false, error: (err as any).message });
  }
});

// ─── SYNC ENGINE ─────────────────────────────────────
async function runSync(conn: any, planner: any) {
  const startedAt = new Date();
  let synced = 0;
  let errors = 0;
  const logs: any[] = [];

  try {
    // Build adapter
    const sfAdapter = conn.provider === 'SALESFORCE'
      ? new SalesforceAdapter(conn.instanceUrl, conn.accessToken) : null;
    const hsAdapter = conn.provider === 'HUBSPOT'
      ? new HubSpotAdapter(conn.accessToken) : null;

    const fieldMap = (conn.attendeeFieldMap as Record<string, string>) || {};

    // ── SYNC ATTENDEES → CONTACTS ─────────────────────
    if (conn.syncAttendees || conn.syncContacts) {
      const attendees = await prisma.attendee.findMany({
        where: {
          event: { plannerId: planner.id },
          // Only sync recent (last 90 days or since last sync)
          registeredAt: { gte: conn.lastSyncAt || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
        include: {
          event: { select: { name: true } },
          ticketType: { select: { name: true } },
        },
        take: 200,
      });

      for (const attendee of attendees) {
        const contact = attendeeToContact(attendee, attendee.event.name);
        let result;

        if (sfAdapter) {
          result = await sfAdapter.upsertContact(contact, fieldMap);
        } else if (hsAdapter) {
          result = await hsAdapter.upsertContact(contact, fieldMap);
        }

        if (result) {
          if (result.success) synced++;
          else errors++;

          logs.push({
            connectionId: conn.id,
            entityType: 'attendee',
            entityId: attendee.id,
            crmId: result.crmId,
            direction: 'PUSH',
            status: result.success ? 'SUCCESS' : 'FAILED',
            errorMessage: result.error,
            durationMs: result.durationMs,
          });
        }
      }
    }

    // ── SYNC BOOKINGS → DEALS ─────────────────────────
    if (conn.syncBookings) {
      const bookings = await prisma.booking.findMany({
        where: {
          plannerId: planner.id,
          updatedAt: { gte: conn.lastSyncAt || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
        include: {
          vendor: { select: { businessName: true } },
          planner: { include: { user: { select: { email: true, firstName: true, lastName: true } } } },
        },
        take: 100,
      });

      for (const booking of bookings) {
        const deal = bookingToDeal(booking, `${planner.user?.firstName} ${planner.user?.lastName}`);
        let result;

        if (sfAdapter) {
          result = await sfAdapter.upsertOpportunity(deal);
        } else if (hsAdapter) {
          result = await hsAdapter.upsertDeal(deal, undefined, conn.crmPipelineId || undefined);
        }

        if (result) {
          if (result.success) synced++;
          else errors++;

          logs.push({
            connectionId: conn.id,
            entityType: 'booking',
            entityId: booking.id,
            crmId: result.crmId,
            direction: 'PUSH',
            status: result.success ? 'SUCCESS' : 'FAILED',
            errorMessage: result.error,
            durationMs: result.durationMs,
          });
        }
      }
    }

    // ── PULL: CRM → Owambe (contacts updated in CRM) ──
    if ((conn.syncDirection === 'PULL' || conn.syncDirection === 'BIDIRECTIONAL') && conn.lastSyncAt) {
      let updatedContacts: any[] = [];

      if (sfAdapter) {
        updatedContacts = await sfAdapter.getUpdatedContacts(conn.lastSyncAt);
      } else if (hsAdapter) {
        updatedContacts = await hsAdapter.getUpdatedContacts(conn.lastSyncAt);
      }

      for (const crmContact of updatedContacts) {
        const email = crmContact.Email || crmContact.properties?.email?.value;
        const owambeId = crmContact.Owambe_Attendee_ID__c || crmContact.properties?.owambe_attendee_id?.value;

        if (!email || !owambeId) continue;

        // Update attendee record if phone/company changed in CRM
        const phone = crmContact.Phone || crmContact.properties?.phone?.value;
        if (phone) {
          await prisma.attendee.updateMany({
            where: { id: owambeId },
            data: { phone },
          }).catch(() => {}); // Ignore if not found
        }

        synced++;
        logs.push({
          connectionId: conn.id,
          entityType: 'contact',
          entityId: owambeId || email,
          direction: 'PULL',
          status: 'SUCCESS',
          durationMs: 0,
        });
      }
    }

    // Batch write sync logs
    if (logs.length > 0) {
      await prisma.crmSyncLog.createMany({ data: logs });
    }

    // Update connection status
    await prisma.crmConnection.update({
      where: { id: conn.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: errors === 0 ? 'SUCCESS' : synced > 0 ? 'PARTIAL' : 'FAILED',
        lastSyncError: errors > 0 ? `${errors} errors during sync` : null,
        totalSynced: { increment: synced },
        totalErrors: { increment: errors },
      },
    });

    const duration = Date.now() - startedAt.getTime();
    logger.info(`CRM sync complete: ${conn.provider} — ${synced} synced, ${errors} errors, ${duration}ms`);
  } catch (err: any) {
    await prisma.crmConnection.update({
      where: { id: conn.id },
      data: {
        lastSyncStatus: 'FAILED',
        lastSyncError: err.message,
        totalErrors: { increment: 1 },
      },
    });
    logger.error(`CRM sync failed: ${conn.provider}`, err);
  }
}
