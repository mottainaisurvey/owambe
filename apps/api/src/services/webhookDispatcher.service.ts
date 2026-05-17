// ─── webhookDispatcher.service.ts ────────────────────────────────────────────
// OWB-WAVE-4-01: Outbound webhook dispatcher for Owambe→CC event notifications.
//
// Architecture:
//   - BullMQ queue  "owambe:webhook-dispatch"  (Redis-backed, falls back to
//     synchronous HTTP if Redis is unavailable)
//   - Worker retries: 5 attempts, exponential backoff starting at 2 s
//   - Each job carries a fully-formed signed HTTP payload; the worker fires
//     the POST and records delivery status in the WebhookDeliveryLog table.
//   - Signing: HMAC-SHA256 over `${timestamp}.${bodyString}` using
//     OWAMBE_WEBHOOK_OUTBOUND_SECRET (same scheme CC uses for inbound).
//
// Supported event types (OWB-WAVE-4-01):
//   reservation.status_changed
//   reservation.cancelled
//   reservation.checked_in
//   reservation.checked_out
//   reservation.no_show
//
// Usage:
//   import { dispatchWebhookEvent } from './webhookDispatcher.service';
//   dispatchWebhookEvent({ eventType: 'reservation.status_changed', data: { ... } });
//
// Environment variables:
//   OWAMBE_WEBHOOK_OUTBOUND_SECRET  — HMAC signing secret (required for dispatch)
//   CC_WEBHOOK_INBOUND_URL          — CC's inbound webhook endpoint
//   REDIS_URL                       — BullMQ backing store (optional; falls back to sync)

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import { logger } from '../utils/logger';
import { prisma } from '../database/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WebhookEventType =
  | 'reservation.status_changed'
  | 'reservation.cancelled'
  | 'reservation.checked_in'
  | 'reservation.checked_out'
  | 'reservation.no_show';

export interface WebhookDispatchPayload {
  eventType: WebhookEventType;
  data: Record<string, unknown>;
  /** Optional: override the target URL (defaults to CC_WEBHOOK_INBOUND_URL) */
  targetUrl?: string;
  /** Optional: idempotency key for deduplication on CC's side */
  idempotencyKey?: string;
}

interface WebhookJobData {
  eventId: string;
  eventType: WebhookEventType;
  targetUrl: string;
  body: string;           // pre-serialised JSON string
  timestamp: string;      // unix epoch string used in signature
  signature: string;      // HMAC-SHA256 hex
  idempotencyKey: string;
  attemptNumber: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const WEBHOOK_DISPATCH_QUEUE_NAME = 'owambe:webhook-dispatch';

const DEFAULT_CC_WEBHOOK_URL =
  process.env.CC_WEBHOOK_INBOUND_URL ??
  'https://coastal-corridor-staging.vercel.app/api/v1/channel/webhooks/inbound';

const OUTBOUND_SECRET = process.env.OWAMBE_WEBHOOK_OUTBOUND_SECRET ?? '';

// ─── Redis Connection ─────────────────────────────────────────────────────────

function createRedisConnection(): IORedis {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const url = new URL(redisUrl);
  return new IORedis({
    host: url.hostname,
    port: parseInt(url.port || '6379'),
    password: url.password || undefined,
    username: url.username || undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
}

// ─── Singleton State ──────────────────────────────────────────────────────────

let _dispatchQueue: Queue<WebhookJobData> | null = null;
let _dispatchWorker: Worker<WebhookJobData> | null = null;
let _redisAvailable = false;

// ─── Signing ──────────────────────────────────────────────────────────────────

function signPayload(timestamp: string, bodyString: string): string {
  const msg = `${timestamp}.${bodyString}`;
  return crypto.createHmac('sha256', OUTBOUND_SECRET).update(msg).digest('hex');
}

// ─── Delivery Execution ───────────────────────────────────────────────────────

async function executeDelivery(job: WebhookJobData): Promise<void> {
  const { eventId, eventType, targetUrl, body, timestamp, signature, idempotencyKey, attemptNumber } = job;

  const startMs = Date.now();
  let httpStatus: number | null = null;
  let responseBody: string | null = null;
  let deliveryStatus: 'DELIVERED' | 'FAILED' = 'FAILED';
  let errorMessage: string | null = null;

  try {
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const url = new URL(targetUrl);
      const transport = url.protocol === 'https:' ? https : http;
      const bodyBuf = Buffer.from(body, 'utf8');
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': bodyBuf.length,
          'x-owambe-signature': signature,
          'x-owambe-timestamp': timestamp,
          'x-owambe-event-id': eventId,
          'x-idempotency-key': idempotencyKey,
        },
        timeout: 10000,
      };
      const req = transport.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
      req.write(bodyBuf);
      req.end();
    });

    httpStatus = result.status;
    responseBody = result.body;

    if (result.status >= 200 && result.status < 300) {
      deliveryStatus = 'DELIVERED';
      logger.info('[WebhookDispatcher] Delivered', { eventId, eventType, httpStatus, attemptNumber });
    } else {
      errorMessage = `HTTP ${result.status}: ${responseBody?.slice(0, 200)}`;
      logger.warn('[WebhookDispatcher] Non-2xx response', { eventId, eventType, httpStatus, attemptNumber });
      throw new Error(errorMessage); // triggers BullMQ retry
    }
  } catch (err: any) {
    if (!errorMessage) {
      errorMessage = err.message ?? String(err);
    }
    logger.error('[WebhookDispatcher] Delivery failed', {
      eventId, eventType, attemptNumber,
      error: errorMessage?.slice(0, 300),
    });
    throw err; // re-throw so BullMQ retries
  } finally {
    // Persist delivery log (fire-and-forget — do not block retry logic)
    const durationMs = Date.now() - startMs;
    setImmediate(async () => {
      try {
        await (prisma as any).webhookDeliveryLog.upsert({
          where: { eventId },
          update: {
            httpStatus,
            responseBody: responseBody?.slice(0, 1000) ?? null,
            deliveryStatus,
            errorMessage: errorMessage?.slice(0, 500) ?? null,
            attemptCount: attemptNumber,
            durationMs,
            lastAttemptAt: new Date(),
          },
          create: {
            eventId,
            eventType,
            targetUrl,
            requestBody: body.slice(0, 5000),
            httpStatus,
            responseBody: responseBody?.slice(0, 1000) ?? null,
            deliveryStatus,
            errorMessage: errorMessage?.slice(0, 500) ?? null,
            attemptCount: attemptNumber,
            durationMs,
            lastAttemptAt: new Date(),
          },
        });
      } catch (logErr) {
        // Log persistence is non-fatal
        logger.warn('[WebhookDispatcher] Failed to persist delivery log', {
          eventId,
          error: logErr instanceof Error ? logErr.message : String(logErr),
        });
      }
    });
  }
}

// ─── Queue Initialisation ─────────────────────────────────────────────────────

export async function initWebhookDispatcher(): Promise<void> {
  if (!process.env.REDIS_URL) {
    logger.warn('[WebhookDispatcher] REDIS_URL not set — webhook dispatch will run synchronously (no retry)');
    return;
  }

  try {
    const testConn = createRedisConnection();
    await testConn.connect();
    await testConn.ping();
    await testConn.quit();
    _redisAvailable = true;

    _dispatchQueue = new Queue<WebhookJobData>(WEBHOOK_DISPATCH_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 1000 },
      },
    });

    _dispatchWorker = new Worker<WebhookJobData>(
      WEBHOOK_DISPATCH_QUEUE_NAME,
      async (job: Job<WebhookJobData>) => {
        await executeDelivery({ ...job.data, attemptNumber: (job.attemptsMade ?? 0) + 1 });
      },
      {
        connection: createRedisConnection(),
        concurrency: 10,
      }
    );

    _dispatchWorker.on('failed', (job, err) => {
      logger.error(`[WebhookDispatcher] Job ${job?.id} permanently failed: ${err.message}`);
    });

    logger.info('[WebhookDispatcher] BullMQ queue and worker initialised');
  } catch (err: any) {
    _redisAvailable = false;
    logger.warn(`[WebhookDispatcher] Redis unavailable (${err.message}) — falling back to synchronous dispatch`);
  }
}

export async function closeWebhookDispatcher(): Promise<void> {
  try {
    if (_dispatchWorker) await _dispatchWorker.close();
    if (_dispatchQueue) await _dispatchQueue.close();
    logger.info('[WebhookDispatcher] Queue and worker closed gracefully');
  } catch (err) {
    logger.error('[WebhookDispatcher] Error closing dispatcher:', err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enqueue (or synchronously fire) an outbound webhook event to CC.
 * This is the only function callers should use.
 *
 * @param payload  Event type + data bag + optional overrides
 */
export async function dispatchWebhookEvent(payload: WebhookDispatchPayload): Promise<void> {
  if (!OUTBOUND_SECRET) {
    logger.warn('[WebhookDispatcher] OWAMBE_WEBHOOK_OUTBOUND_SECRET not set — skipping dispatch', {
      eventType: payload.eventType,
    });
    return;
  }

  const eventId = `owb-evt-${crypto.randomBytes(8).toString('hex')}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const targetUrl = payload.targetUrl ?? DEFAULT_CC_WEBHOOK_URL;
  const idempotencyKey = payload.idempotencyKey ?? eventId;

  const bodyObj = {
    event_type: payload.eventType,
    event_id: eventId,
    timestamp: new Date(parseInt(timestamp) * 1000).toISOString(),
    data: payload.data,
  };
  const bodyString = JSON.stringify(bodyObj);
  const signature = signPayload(timestamp, bodyString);

  const jobData: WebhookJobData = {
    eventId,
    eventType: payload.eventType,
    targetUrl,
    body: bodyString,
    timestamp,
    signature,
    idempotencyKey,
    attemptNumber: 1,
  };

  if (_redisAvailable && _dispatchQueue) {
    await _dispatchQueue.add('dispatch-webhook', jobData);
    logger.debug('[WebhookDispatcher] Job enqueued', { eventId, eventType: payload.eventType });
  } else {
    // Synchronous fallback (no retry)
    logger.info('[WebhookDispatcher] Synchronous dispatch (no Redis)', {
      eventId,
      eventType: payload.eventType,
    });
    try {
      await executeDelivery(jobData);
    } catch {
      // Swallow — synchronous fallback does not propagate delivery failures to caller
    }
  }
}

// ─── Queue Health ─────────────────────────────────────────────────────────────

export async function getWebhookDispatcherHealth() {
  if (!_redisAvailable || !_dispatchQueue) {
    return { status: 'degraded', message: 'Redis unavailable — synchronous fallback active' };
  }
  const counts = await _dispatchQueue.getJobCounts();
  return { status: 'healthy', queue: counts };
}
