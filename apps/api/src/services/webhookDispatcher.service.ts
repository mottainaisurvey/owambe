// ─── webhookDispatcher.service.ts ────────────────────────────────────────────
// OWB-WAVE-4-01: Outbound webhook dispatcher for Owambe→CC event notifications.
//
// Architecture:
//   - BullMQ queue  "owambe:webhook-dispatch"  (Redis-backed, falls back to
//     synchronous HTTP if Redis is unavailable)
//   - Worker retries: 5 attempts, exponential backoff starting at 2 s
//   - Each job carries unsigned event metadata; the worker generates a fresh
//     timestamp and signature immediately before each HTTP POST so that
//     signatures are never stale under queue delay.
//   - Signing: HMAC-SHA256 over `${timestamp}.${bodyString}` using
//     OWAMBE_WEBHOOK_OUTBOUND_SECRET (same scheme CC uses for inbound).
//
// OWB-WAVE-4-01-FIX (timestamp staleness):
//   BEFORE: timestamp + signature generated at enqueue time (dispatchWebhookEvent),
//           stored in job.data, sent verbatim by worker.  Under queue delay the
//           timestamp could be minutes or hours old when the POST fires.
//   AFTER:  timestamp + signature generated at dispatch time (executeDelivery),
//           immediately before the HTTP POST.  The signed bytes are identical to
//           the bytes put on the wire (approach (b) from the CC verification ask).
//
// Scope boundary of the fix:
//   Moves from enqueue to dispatch:
//     - timestamp generation
//     - signature generation
//   Stays at enqueue (stable across retries):
//     - idempotency key generation
//     - event-id generation
//     - body field construction (unsigned fields stored in job.data)
//   Worker generates at dispatch:
//     - fresh timestamp
//     - fresh signature (against the bytes actually sent)
//   Worker reads from job.data verbatim:
//     - idempotencyKey  → x-idempotency-key header
//     - eventId         → x-owambe-event-id header
//     - eventType, data → used to reconstruct the body
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

/**
 * Job data stored in BullMQ.
 *
 * OWB-WAVE-4-01-FIX: `timestamp` and `signature` are NOT stored here.
 * They are generated fresh at dispatch time (executeDelivery) immediately
 * before the HTTP POST, so they are never stale under queue delay.
 *
 * `idempotencyKey` and `eventId` ARE stored here — they must be stable
 * across retry attempts so CC's inbound side can deduplicate correctly.
 */
interface WebhookJobData {
  eventId: string;
  eventType: WebhookEventType;
  targetUrl: string;
  /** Unsigned event body fields; worker reconstructs the JSON body at dispatch time */
  eventTimestamp: string;   // ISO-8601 wall-clock time of the event (stable, for body content)
  data: Record<string, unknown>;
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
  const { eventId, eventType, targetUrl, eventTimestamp, data, idempotencyKey, attemptNumber } = job;

  // ── OWB-WAVE-4-01-FIX: generate timestamp and signature at dispatch time ──
  //
  // 1. Reconstruct the body object from the unsigned fields stored in job.data.
  // 2. Serialise to a single string (bodyString).
  // 3. Generate a fresh unix-epoch timestamp string at this exact moment.
  // 4. Compute the HMAC signature over `${freshTimestamp}.${bodyString}`.
  // 5. Send bodyString as the HTTP body and freshTimestamp/signature as headers.
  //
  // The same bodyString is both signed and sent — no re-serialisation between
  // sign and send (approach (b) from the CC verification ask).  Signature
  // validity is therefore independent of JSON key ordering across runs.
  const bodyObj = {
    event_type: eventType,
    event_id: eventId,
    timestamp: eventTimestamp,
    data,
  };
  const bodyString = JSON.stringify(bodyObj);
  const freshTimestamp = String(Math.floor(Date.now() / 1000));
  const signature = signPayload(freshTimestamp, bodyString);
  // ── end fix ───────────────────────────────────────────────────────────────

  const startMs = Date.now();
  let httpStatus: number | null = null;
  let responseBody: string | null = null;
  let deliveryStatus: 'DELIVERED' | 'FAILED' = 'FAILED';
  let errorMessage: string | null = null;

  try {
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const url = new URL(targetUrl);
      const transport = url.protocol === 'https:' ? https : http;
      const bodyBuf = Buffer.from(bodyString, 'utf8');
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': bodyBuf.length,
          'x-owambe-signature': signature,
          'x-owambe-timestamp': freshTimestamp,
          'x-owambe-event-id': eventId,       // enqueue-time stable
          'x-idempotency-key': idempotencyKey, // enqueue-time stable
        },
        timeout: 10000,
      };
      const req = transport.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: responseData }));
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
            requestBody: bodyString.slice(0, 5000),
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
 * OWB-WAVE-4-01-FIX: timestamp and signature are no longer generated here.
 * Only the stable, retry-invariant fields are stored in job.data:
 *   - eventId         (enqueue-time, stable across retries)
 *   - idempotencyKey  (enqueue-time, stable across retries)
 *   - eventTimestamp  (wall-clock ISO string for the body's `timestamp` field)
 *   - data            (unsigned event payload)
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

  // Enqueue-time stable fields
  const eventId = `owb-evt-${crypto.randomBytes(8).toString('hex')}`;
  const idempotencyKey = payload.idempotencyKey ?? eventId;
  const targetUrl = payload.targetUrl ?? DEFAULT_CC_WEBHOOK_URL;
  // eventTimestamp is the wall-clock time of the event for the body content field;
  // it is distinct from the signing timestamp which is generated fresh at dispatch.
  const eventTimestamp = new Date().toISOString();

  const jobData: WebhookJobData = {
    eventId,
    eventType: payload.eventType,
    targetUrl,
    eventTimestamp,
    data: payload.data,
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
