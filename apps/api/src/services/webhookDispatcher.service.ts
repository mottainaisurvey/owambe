// ─── webhookDispatcher.service.ts ────────────────────────────────────────────
// OWB-WAVE-4-01: Outbound webhook dispatcher for Owambe→channel event notifications.
// Brief D Rev 2: Generalised to channel-driven dispatch pattern.
//
// Architecture:
//   - BullMQ queue  "owambe:webhook-dispatch"  (Redis-backed, falls back to
//     synchronous HTTP if Redis is unavailable)
//   - Worker retries: 5 attempts, exponential backoff starting at 2 s
//   - Each job carries unsigned event metadata; the worker generates a fresh
//     timestamp and signature immediately before each HTTP POST so that
//     signatures are never stale under queue delay.
//   - Signing: HMAC-SHA256 over `${timestamp}.${bodyString}` using
//     channel.hmacSecret (per-channel, from channel registry).
//
// OWB-WAVE-4-01-FIX (timestamp staleness):
//   BEFORE: timestamp + signature generated at enqueue time (dispatchWebhookEvent),
//           stored in job.data, sent verbatim by worker.  Under queue delay the
//           timestamp could be minutes or hours old when the POST fires.
//   AFTER:  timestamp + signature generated at dispatch time (executeDelivery),
//           immediately before the HTTP POST.  The signed bytes are identical to
//           the bytes put on the wire (approach (b) from the CC verification ask).
//
// Brief D Rev 2 — Channel-driven dispatch:
//   - dispatchWebhookEvent enqueues one job per capable ACTIVE channel
//   - Capability dispatch: Pattern α (supportsStays / supportsExperiences /
//     supportsEvents / supportsVendors flags)
//   - Per-channel circuit breaker: 20 consecutive failures → OPEN (120-second
//     timeout before HALF_OPEN probe attempt)
//   - Declarative header emission: channel.signatureHeader + channel.timestampHeader
//   - Spec-canonical event naming: reservation.guest_checked_in / _out
//   - Booking event family: booking.created / booking.cancelled / booking.refunded
//     gated by OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED env var (option iii staged enable)
//
// Supported event types (post-Brief-D):
//   reservation.status_changed
//   reservation.cancelled
//   reservation.guest_checked_in    ← spec-canonical (was reservation.checked_in)
//   reservation.guest_checked_out   ← spec-canonical (was reservation.checked_out)
//   reservation.no_show
//   booking.created                 ← booking family (gated by env var)
//   booking.cancelled               ← booking family (gated by env var)
//   booking.refunded                ← booking family (gated by env var)
//
// Usage:
//   import { dispatchWebhookEvent } from './webhookDispatcher.service';
//   dispatchWebhookEvent({ eventType: 'reservation.guest_checked_in', data: { ... } });
//
// Environment variables:
//   OWAMBE_WEBHOOK_OUTBOUND_SECRET  — Legacy HMAC signing secret (fallback for
//                                     channels without hmacSecret in DB)
//   CC_WEBHOOK_INBOUND_URL          — CC's inbound webhook endpoint (legacy fallback
//                                     destination for coastal-corridor channel)
//   REDIS_URL                       — BullMQ backing store (optional; falls back to sync)
//   OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED — Set to 'true' to enable booking event
//                                     family dispatch (option iii staged enable)

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import { logger } from '../utils/logger';
import { prisma } from '../database/client';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Reservation event family (spec-canonical naming post-Brief-D) */
export type ReservationEventType =
  | 'reservation.status_changed'
  | 'reservation.cancelled'
  | 'reservation.guest_checked_in'
  | 'reservation.guest_checked_out'
  | 'reservation.no_show';

/** Booking event family (gated by OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED) */
export type BookingEventType =
  | 'booking.created'
  | 'booking.cancelled'
  | 'booking.refunded';

export type WebhookEventType = ReservationEventType | BookingEventType;

/** Event family classification */
export type EventFamily = 'reservation' | 'booking';

export interface WebhookDispatchPayload {
  eventType: WebhookEventType;
  data: Record<string, unknown>;
  /** Optional: override the target URL (defaults to channel.destinationUrl) */
  targetUrl?: string;
  /** Optional: idempotency key for deduplication on receiver's side */
  idempotencyKey?: string;
  /**
   * Optional: restrict dispatch to a specific channel slug.
   * If omitted, dispatcher dispatches to ALL capable ACTIVE channels.
   */
  channelSlug?: string;
}

/**
 * Job data stored in BullMQ — one job per channel per event.
 *
 * OWB-WAVE-4-01-FIX: `timestamp` and `signature` are NOT stored here.
 * They are generated fresh at dispatch time (executeDelivery) immediately
 * before the HTTP POST, so they are never stale under queue delay.
 *
 * `idempotencyKey` and `eventId` ARE stored here — they must be stable
 * across retry attempts so the receiver can deduplicate correctly.
 */
interface WebhookJobData {
  eventId: string;
  eventType: WebhookEventType;
  channelSlug: string;
  targetUrl: string;
  /** Per-channel auth config — resolved at enqueue time from channel record */
  signatureHeader: string;
  timestampHeader: string;
  hmacSecret: string;
  /** Unsigned event body fields; worker reconstructs the JSON body at dispatch time */
  eventTimestamp: string;   // ISO-8601 wall-clock time of the event (stable, for body content)
  data: Record<string, unknown>;
  idempotencyKey: string;
  attemptNumber: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const WEBHOOK_DISPATCH_QUEUE_NAME = 'owambe:webhook-dispatch';

/** Legacy fallback secret for channels without hmacSecret in DB */
const LEGACY_OUTBOUND_SECRET = process.env.OWAMBE_WEBHOOK_OUTBOUND_SECRET ?? '';

/** Legacy fallback destination URL for coastal-corridor channel */
const LEGACY_CC_WEBHOOK_URL =
  process.env.CC_WEBHOOK_INBOUND_URL ??
  'https://coastal-corridor-staging.vercel.app/api/v1/channel/webhooks/inbound';

/** Booking event family enable flag (option iii staged enable) */
const BOOKING_EVENTS_ENABLED =
  process.env.OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED === 'true';

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

const CIRCUIT_BREAKER_THRESHOLD = 20;       // consecutive failures before OPEN
const CIRCUIT_BREAKER_TIMEOUT_MS = 120_000; // 120 seconds before HALF_OPEN probe

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerState {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
}

/** Per-channel circuit breaker state (in-memory; resets on process restart) */
const _circuitBreakers = new Map<string, CircuitBreakerState>();

function getCircuitBreaker(channelSlug: string): CircuitBreakerState {
  if (!_circuitBreakers.has(channelSlug)) {
    _circuitBreakers.set(channelSlug, {
      state: 'CLOSED',
      consecutiveFailures: 0,
      openedAt: null,
    });
  }
  return _circuitBreakers.get(channelSlug)!;
}

function recordCircuitSuccess(channelSlug: string): void {
  const cb = getCircuitBreaker(channelSlug);
  if (cb.state !== 'CLOSED' || cb.consecutiveFailures > 0) {
    logger.info('[WebhookDispatcher] Circuit breaker reset to CLOSED', { channelSlug });
  }
  cb.state = 'CLOSED';
  cb.consecutiveFailures = 0;
  cb.openedAt = null;
}

function recordCircuitFailure(channelSlug: string): void {
  const cb = getCircuitBreaker(channelSlug);
  cb.consecutiveFailures += 1;
  if (cb.state === 'CLOSED' && cb.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    cb.state = 'OPEN';
    cb.openedAt = Date.now();
    logger.error('[WebhookDispatcher] Circuit breaker OPEN', {
      channelSlug,
      consecutiveFailures: cb.consecutiveFailures,
    });
  }
}

/**
 * Returns true if the circuit allows dispatch to proceed.
 * CLOSED → allow; OPEN → check timeout → HALF_OPEN probe or block; HALF_OPEN → allow probe.
 */
function circuitAllowsDispatch(channelSlug: string): boolean {
  const cb = getCircuitBreaker(channelSlug);
  if (cb.state === 'CLOSED') return true;
  if (cb.state === 'HALF_OPEN') return true; // allow one probe attempt
  // OPEN — check if timeout has elapsed
  if (cb.openedAt !== null && Date.now() - cb.openedAt >= CIRCUIT_BREAKER_TIMEOUT_MS) {
    cb.state = 'HALF_OPEN';
    logger.info('[WebhookDispatcher] Circuit breaker → HALF_OPEN (probe attempt)', { channelSlug });
    return true;
  }
  return false;
}

// ─── Event Family Classification ──────────────────────────────────────────────

function getEventFamily(eventType: WebhookEventType): EventFamily {
  if (eventType.startsWith('booking.')) return 'booking';
  return 'reservation';
}

/**
 * Returns true if the channel's capability flags indicate it should receive
 * this event type (Pattern α capability dispatch).
 */
function channelSupportsEvent(
  channel: { supportsStays: boolean; supportsExperiences: boolean; supportsEvents: boolean; supportsVendors: boolean },
  eventType: WebhookEventType,
): boolean {
  const family = getEventFamily(eventType);
  if (family === 'booking') {
    // Booking events: route to channels supporting stays OR experiences
    return channel.supportsStays || channel.supportsExperiences;
  }
  // Reservation events: route to channels supporting stays
  return channel.supportsStays;
}

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

function signPayload(secret: string, timestamp: string, bodyString: string): string {
  const msg = `${timestamp}.${bodyString}`;
  return crypto.createHmac('sha256', secret).update(msg).digest('hex');
}

// ─── Delivery Execution ───────────────────────────────────────────────────────

async function executeDelivery(job: WebhookJobData): Promise<void> {
  const {
    eventId, eventType, channelSlug, targetUrl,
    signatureHeader, timestampHeader, hmacSecret,
    eventTimestamp, data, idempotencyKey, attemptNumber,
  } = job;

  // Check circuit breaker before attempting delivery
  if (!circuitAllowsDispatch(channelSlug)) {
    logger.warn('[WebhookDispatcher] Circuit breaker OPEN — skipping delivery', {
      channelSlug, eventId, eventType,
    });
    return; // Do not throw — skip this delivery without triggering BullMQ retry
  }

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
  const signature = signPayload(hmacSecret, freshTimestamp, bodyString);
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

      // Brief D Rev 2 AC-D10: declarative header emission from channel record
      // signatureHeader + timestampHeader read from channel registry (not hardcoded)
      const headers: Record<string, string | number> = {
        'Content-Type': 'application/json',
        'Content-Length': bodyBuf.length,
        [signatureHeader]: signature,
        [timestampHeader]: freshTimestamp,
        'x-owambe-event-id': eventId,       // enqueue-time stable
        'x-idempotency-key': idempotencyKey, // enqueue-time stable
      };

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers,
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
      recordCircuitSuccess(channelSlug);
      logger.info('[WebhookDispatcher] Delivered', {
        eventId, eventType, channelSlug, httpStatus, attemptNumber,
      });
    } else {
      errorMessage = `HTTP ${result.status}: ${responseBody?.slice(0, 200)}`;
      logger.warn('[WebhookDispatcher] Non-2xx response', {
        eventId, eventType, channelSlug, httpStatus, attemptNumber,
      });
      throw new Error(errorMessage); // triggers BullMQ retry
    }
  } catch (err: any) {
    if (!errorMessage) {
      errorMessage = err.message ?? String(err);
    }
    recordCircuitFailure(channelSlug);
    logger.error('[WebhookDispatcher] Delivery failed', {
      eventId, eventType, channelSlug, attemptNumber,
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
            channelSlug,
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
          eventId, channelSlug,
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
 * Enqueue (or synchronously fire) an outbound webhook event to all capable
 * ACTIVE channels in the channel registry.
 *
 * Brief D Rev 2 — Channel-driven dispatch:
 *   - Queries channel registry for ACTIVE channels
 *   - Filters by capability flags (Pattern α: supportsStays / supportsExperiences)
 *   - Dispatches one job per capable channel
 *   - Per-channel circuit breaker gates dispatch (20 consecutive failures → OPEN)
 *   - Booking events gated by OWAMBE_OUTBOUND_BOOKING_EVENTS_ENABLED env var
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
  const { eventType, data, idempotencyKey: payloadIdempotencyKey, channelSlug: targetChannelSlug } = payload;

  // Booking event family gate (option iii staged enable)
  if (getEventFamily(eventType) === 'booking' && !BOOKING_EVENTS_ENABLED) {
    logger.debug('[WebhookDispatcher] Booking events disabled — skipping dispatch', { eventType });
    return;
  }

  // Query channel registry for capable ACTIVE channels
  let channels: Array<{
    id: string;
    slug: string;
    state: string;
    supportsStays: boolean;
    supportsExperiences: boolean;
    supportsEvents: boolean;
    supportsVendors: boolean;
    destinationUrl: string | null;
    signatureHeader: string;
    timestampHeader: string;
    hmacSecret: string | null;
  }>;

  try {
    channels = await (prisma as any).channel.findMany({
      where: {
        state: 'ACTIVE',
        ...(targetChannelSlug ? { slug: targetChannelSlug } : {}),
      },
      select: {
        id: true,
        slug: true,
        state: true,
        supportsStays: true,
        supportsExperiences: true,
        supportsEvents: true,
        supportsVendors: true,
        destinationUrl: true,
        signatureHeader: true,
        timestampHeader: true,
        hmacSecret: true,
      },
    });
  } catch (err: any) {
    logger.error('[WebhookDispatcher] Failed to query channel registry — skipping dispatch', {
      eventType,
      error: err.message,
    });
    return;
  }

  // Filter by capability (Pattern α)
  const capableChannels = channels.filter((ch) => channelSupportsEvent(ch, eventType));

  if (capableChannels.length === 0) {
    logger.debug('[WebhookDispatcher] No capable ACTIVE channels for event', { eventType });
    return;
  }

  // Enqueue-time stable fields (shared across all channel jobs for this event)
  const baseEventId = `owb-evt-${crypto.randomBytes(8).toString('hex')}`;
  const eventTimestamp = new Date().toISOString();

  // Dispatch one job per capable channel
  for (const channel of capableChannels) {
    // Per-channel circuit breaker check
    if (!circuitAllowsDispatch(channel.slug)) {
      logger.warn('[WebhookDispatcher] Circuit breaker OPEN — skipping channel', {
        channelSlug: channel.slug, eventType,
      });
      continue;
    }

    // Resolve per-channel destination URL
    const targetUrl = payload.targetUrl
      ?? channel.destinationUrl
      ?? (channel.slug === 'coastal-corridor' ? LEGACY_CC_WEBHOOK_URL : null);

    if (!targetUrl) {
      logger.warn('[WebhookDispatcher] No destination URL for channel — skipping', {
        channelSlug: channel.slug, eventType,
      });
      continue;
    }

    // Resolve per-channel HMAC secret
    const hmacSecret = channel.hmacSecret ?? LEGACY_OUTBOUND_SECRET;
    if (!hmacSecret) {
      logger.warn('[WebhookDispatcher] No HMAC secret for channel — skipping', {
        channelSlug: channel.slug, eventType,
      });
      continue;
    }

    // Per-channel event ID (suffix with channel slug for multi-channel deduplication)
    const eventId = capableChannels.length === 1
      ? baseEventId
      : `${baseEventId}-${channel.slug}`;
    const idempotencyKey = payloadIdempotencyKey
      ? `${payloadIdempotencyKey}-${channel.slug}`
      : eventId;

    const jobData: WebhookJobData = {
      eventId,
      eventType,
      channelSlug: channel.slug,
      targetUrl,
      signatureHeader: channel.signatureHeader,
      timestampHeader: channel.timestampHeader,
      hmacSecret,
      eventTimestamp,
      data,
      idempotencyKey,
      attemptNumber: 1,
    };

    if (_redisAvailable && _dispatchQueue) {
      await _dispatchQueue.add('dispatch-webhook', jobData);
      logger.debug('[WebhookDispatcher] Job enqueued', {
        eventId, eventType, channelSlug: channel.slug,
      });
    } else {
      // Synchronous fallback (no retry)
      logger.info('[WebhookDispatcher] Synchronous dispatch (no Redis)', {
        eventId, eventType, channelSlug: channel.slug,
      });
      try {
        await executeDelivery(jobData);
      } catch {
        // Swallow — synchronous fallback does not propagate delivery failures to caller
      }
    }
  }
}

// ─── Circuit Breaker Inspection (for health checks / tests) ──────────────────

export function getCircuitBreakerState(channelSlug: string): CircuitBreakerState {
  return getCircuitBreaker(channelSlug);
}

export function resetCircuitBreaker(channelSlug: string): void {
  _circuitBreakers.delete(channelSlug);
  logger.info('[WebhookDispatcher] Circuit breaker manually reset', { channelSlug });
}

// ─── Queue Health ─────────────────────────────────────────────────────────────

export async function getWebhookDispatcherHealth() {
  if (!_redisAvailable || !_dispatchQueue) {
    return { status: 'degraded', message: 'Redis unavailable — synchronous fallback active' };
  }
  const counts = await _dispatchQueue.getJobCounts();
  return { status: 'healthy', queue: counts };
}
