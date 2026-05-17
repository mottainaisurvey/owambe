/**
 * ─── Per-Channel-Partner Rate Limiter ─────────────────────────────────────
 *
 * OWB-WAVE-4-04: Implements per-channel-partner rate limiting for the
 * Coastal Corridor inbound channel routes, separate from the global
 * 300 req/min backstop in app.ts.
 *
 * Rate limits per contract Section (reservation endpoints 60/min,
 * availability endpoints 100/min, webhook endpoints 120/min,
 * reconciliation endpoints 10/hr — each per-channel-partner):
 *
 *   RESERVATION  : POST/PATCH /stays/reservations*, /experiences/bookings*  → 60/min
 *   AVAILABILITY : GET /stays/availability*, /experiences/availability*     → 100/min
 *   WEBHOOK      : POST /webhooks/inbound                                   → 120/min
 *   RECONCILIATION: GET /reconciliation/*                                   → 10/hr
 *
 * Partner identity is derived from the first 16 hex chars of the
 * x-cc-signature header (the HMAC signature prefix), which is unique
 * per shared secret. Falls back to the request IP if the header is absent.
 *
 * Response headers per contract:
 *   X-RateLimit-Limit     — ceiling for this window
 *   X-RateLimit-Remaining — requests remaining
 *   X-RateLimit-Reset     — Unix epoch when window resets
 *   Retry-After           — seconds until retry (on 429 only)
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { getRedisClient } from '../services/cache.service';

// ─── Endpoint category definitions ────────────────────────────────────────

type EndpointCategory = 'RESERVATION' | 'AVAILABILITY' | 'WEBHOOK' | 'RECONCILIATION';

interface RateLimitConfig {
  max: number;
  windowSec: number; // window in seconds
}

const RATE_LIMIT_CONFIG: Record<EndpointCategory, RateLimitConfig> = {
  RESERVATION:     { max: 60,  windowSec: 60 },
  AVAILABILITY:    { max: 100, windowSec: 60 },
  WEBHOOK:         { max: 120, windowSec: 60 },
  RECONCILIATION:  { max: 10,  windowSec: 3600 },
};

/**
 * Classify a channel route path into an endpoint category.
 * Returns null if the path does not match any known category
 * (should not happen since this middleware is only mounted on /api/v1/channel).
 */
function classifyPath(path: string): EndpointCategory | null {
  if (path.includes('/webhooks/')) return 'WEBHOOK';
  if (path.includes('/reconciliation/')) return 'RECONCILIATION';
  if (path.includes('/availability')) return 'AVAILABILITY';
  if (
    path.includes('/stays/reservations') ||
    path.includes('/experiences/bookings')
  ) return 'RESERVATION';
  // Default: treat unknown channel paths as RESERVATION (tightest limit)
  return 'RESERVATION';
}

/**
 * Derive a stable partner identity key from the request.
 *
 * Currently Owambe has a single channel partner (Coastal Corridor). The
 * shared-secret architecture means all authenticated CC requests carry the
 * same secret, so the stable discriminator is the constant string
 * 'coastal-corridor'. A future multi-partner architecture would introduce
 * a stable x-channel-partner-id header or a secret-hash lookup table.
 *
 * Falls back to the request IP for unauthenticated requests (should not
 * reach this middleware in production since HMAC verification runs first).
 */
function partnerKey(req: Request): string {
  // All requests that pass HMAC verification are from Coastal Corridor.
  // Use a constant key so the rate limit counter accumulates correctly.
  const sig = req.headers['x-cc-signature'] as string | undefined;
  if (sig) {
    return 'cc:coastal-corridor';
  }
  return `ip:${req.ip ?? 'unknown'}`;
}

// ─── Redis-backed counter helpers ─────────────────────────────────────────

/**
 * Increment the rate limit counter for a given key and window.
 * Returns { count, ttlSec } where ttlSec is the remaining TTL of the window.
 * Falls back gracefully if Redis is unavailable (returns count=0 → no limit).
 */
async function incrementCounter(
  key: string,
  windowSec: number,
): Promise<{ count: number; ttlSec: number }> {
  try {
    const redis = await getRedisClient();
    if (!redis) return { count: 0, ttlSec: windowSec };

    const redisKey = `channel-rl:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSec);
    }
    const ttlSec = await redis.ttl(redisKey);
    return { count, ttlSec: ttlSec > 0 ? ttlSec : windowSec };
  } catch (err) {
    logger.warn('[ChannelRateLimit] Redis error — skipping rate limit', { err });
    return { count: 0, ttlSec: windowSec };
  }
}

// ─── Middleware factory ────────────────────────────────────────────────────

/**
 * Returns an Express middleware that enforces per-channel-partner rate limits
 * on inbound channel routes.
 */
export function channelRateLimiter() {
  return async function channelRateLimiterMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const category = classifyPath(req.path);
    if (!category) {
      next();
      return;
    }

    const config = RATE_LIMIT_CONFIG[category];
    const partner = partnerKey(req);
    const windowKey = `${category}:${partner}`;

    const { count, ttlSec } = await incrementCounter(windowKey, config.windowSec);

    const remaining = Math.max(0, config.max - count);
    const resetEpoch = Math.floor(Date.now() / 1000) + ttlSec;

    // Set X-RateLimit-* headers on every response
    res.setHeader('X-RateLimit-Limit', config.max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetEpoch);

    if (count > config.max) {
      res.setHeader('Retry-After', ttlSec);
      logger.warn('[ChannelRateLimit] Rate limit exceeded', {
        category,
        partner,
        count,
        max: config.max,
        path: req.path,
        method: req.method,
      });
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Limit: ${config.max} per ${config.windowSec}s per channel partner.`,
        retryAfter: ttlSec,
      });
      return;
    }

    next();
  };
}
