/**
 * ─── Channel Auth Middleware (Brief C Rev 2) ──────────────────────────────
 *
 * Generalised HMAC auth middleware factory operating against the channel
 * registry (Brief A Rev 2 + Amendment-01 + Amendment-02 schema state).
 *
 * Replaces CC-specific `verifyCoastalCorridorSignature` named function with
 * channel-driven factory pattern `verifyChannelSignature()` per Brief C Rev 2
 * § 5 Operation 1.
 *
 * Key design decisions (per bilateral concurrence):
 *   - Mechanism α (route-based lookup): channelSlug from req.params.channelSlug
 *   - PascalCase storage convention (C-P5): channel record stores 'X-Signature'
 *     + 'X-Timestamp'; middleware applies .toLowerCase() at read-time per HTTP
 *     spec lowering
 *   - Transition window fallback (C-P2 Path (a)): hardcoded legacy headers
 *     x-cc-signature + x-cc-timestamp accepted transiently with deprecation
 *     warning log; no schema extension for transient-state-only fields
 *   - Logger prefix [ChannelAuth] per § 2.8 for auth-tier middleware
 *   - Channel state gating per § 2.6 (ACTIVE / PAUSED / DEPRECATED)
 *   - NULL hmacSecret rejects + alerts per § 2.5
 *
 * getChannelBySlug is exported for consumption by channelRateLimiter.ts
 * (shared channel-lookup mechanism per § 2.7).
 *
 * HMAC verification: HMAC-SHA256, timestamp.body format (UTF-8), hex encoding,
 * 300-second replay window, crypto.timingSafeEqual timing-safe comparison.
 * Identical to verifyInboundSignature in coastal-corridor.adapter.ts.
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';

// ─── Channel lookup ────────────────────────────────────────────────────────

/**
 * Look up a channel record by slug from the channel registry.
 *
 * Pattern α (greenfield implementation per Brief C Rev 2 § 3): direct Prisma
 * client lookup. Returns null if the channel does not exist.
 *
 * Exported for shared consumption by channelRateLimiter.ts per § 2.7.
 */
export async function getChannelBySlug(slug: string) {
  return prisma.channel.findUnique({ where: { slug } });
}

// ─── HMAC verification helper ──────────────────────────────────────────────

/**
 * Verify an inbound HMAC-SHA256 signature.
 *
 * Signature format: HMAC-SHA256(timestamp + "." + rawBody) as raw hex, no prefix.
 * Replay window: 300 seconds (5 minutes).
 * Comparison: crypto.timingSafeEqual to prevent timing attacks.
 *
 * Returns true if the signature is valid and within the replay window.
 */
function verifyHmacSignature(
  rawBody: string,
  signature: string,
  secret: string,
  timestamp: string,
): boolean {
  // Enforce 5-minute replay window
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > 300) {
    return false;
  }

  const message = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(message, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    // Buffer.from throws if lengths differ — treat as invalid
    return false;
  }
}

// ─── Auth middleware factory ───────────────────────────────────────────────

/**
 * Returns an Express middleware that verifies the inbound HMAC signature
 * per the channel registry record for the channel identified by
 * req.params.channelSlug (Mechanism α route-based lookup).
 *
 * Transition window fallback (C-P2 Path (a)):
 *   If canonical headers (channel.signatureHeader + channel.timestampHeader)
 *   are absent, falls back to hardcoded legacy headers x-cc-signature +
 *   x-cc-timestamp with deprecation warning log. Applies only to Coastal
 *   Corridor (only existing channel with legacy state). Future channels
 *   onboard directly against canonical pattern.
 *
 * Legacy route fallback:
 *   If req.params.channelSlug is absent (legacy route /api/v1/channel/...),
 *   defaults to 'coastal-corridor' per transition window backward compatibility.
 *
 * Usage:
 *   router.use(verifyChannelSignature());
 */
export function verifyChannelSignature() {
  return async function verifyChannelSignatureMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const requestId = req.headers['x-request-id'] as string | undefined;

    // ── Step 1: Resolve channelSlug via Mechanism α or legacy route fallback ──
    const channelSlug: string = (req.params.channelSlug as string | undefined) ?? 'coastal-corridor';

    // ── Step 2: Look up channel record ────────────────────────────────────────
    const channel = await getChannelBySlug(channelSlug);

    if (!channel) {
      logger.warn('[ChannelAuth] Channel not found', { channelSlug, path: req.path, requestId });
      res.status(401).json({ error: 'CHANNEL_NOT_FOUND', message: 'Unknown channel' });
      return;
    }

    // ── Step 3: Channel state gating (§ 2.6) ─────────────────────────────────
    if (channel.state === 'PAUSED') {
      logger.warn('[ChannelAuth] Channel is PAUSED — rejecting inbound request', {
        channelSlug,
        path: req.path,
        requestId,
      });
      res.status(503).json({
        error: 'CHANNEL_PAUSED',
        message: 'This channel is temporarily paused. Please retry later.',
      });
      return;
    }

    if (channel.state === 'DECOMMISSIONED') {
      logger.warn('[ChannelAuth] Channel is DECOMMISSIONED — rejecting inbound request', {
        channelSlug,
        path: req.path,
        requestId,
      });
      res.status(410).json({
        error: 'CHANNEL_DECOMMISSIONED',
        message: 'This channel has been decommissioned. Please contact support.',
      });
      return;
    }

    if (channel.state !== 'ACTIVE') {
      logger.warn('[ChannelAuth] Channel is not ACTIVE', {
        channelSlug,
        state: channel.state,
        path: req.path,
        requestId,
      });
      res.status(401).json({ error: 'CHANNEL_INACTIVE', message: 'Channel is not active' });
      return;
    }

    // ── Step 4: NULL hmacSecret guard (§ 2.5) ────────────────────────────────
    if (!channel.hmacSecret) {
      logger.warn('[ChannelAuth] HMAC secret unconfigured', { channelSlug, path: req.path, requestId });
      res.status(401).json({
        error: 'HMAC_SECRET_UNCONFIGURED',
        message: 'Channel HMAC secret is not configured',
      });
      return;
    }

    // ── Step 5: Try canonical headers per channel record (PascalCase → lowercase) ──
    // C-P5 bilateral concurrence: channel record stores 'X-Signature' + 'X-Timestamp';
    // middleware applies .toLowerCase() at read-time per HTTP spec header lowering.
    const canonicalSigHeader = channel.signatureHeader.toLowerCase();   // 'x-signature'
    const canonicalTsHeader = channel.timestampHeader.toLowerCase();    // 'x-timestamp'
    let signature = req.headers[canonicalSigHeader] as string | undefined;
    let timestamp = req.headers[canonicalTsHeader] as string | undefined;
    let usedLegacyHeaders = false;

    // ── Step 6: Transition window fallback (C-P2 Path (a)) ───────────────────
    // If canonical headers absent, fall back to hardcoded legacy headers.
    // Legacy header names are hardcoded constants (no schema extension per C-P2).
    // Applies only to Coastal Corridor (only existing channel with legacy state).
    if (!signature || !timestamp) {
      const legacySigHeader = 'x-cc-signature';
      const legacyTsHeader = 'x-cc-timestamp';
      const legacySignature = req.headers[legacySigHeader] as string | undefined;
      const legacyTimestamp = req.headers[legacyTsHeader] as string | undefined;

      if (legacySignature && legacyTimestamp) {
        // Legacy headers present — transition window acceptance
        signature = legacySignature;
        timestamp = legacyTimestamp;
        usedLegacyHeaders = true;
        logger.warn('[ChannelAuth] Legacy headers accepted during transition window', {
          channelSlug,
          path: req.path,
          requestId,
          usedLegacyHeaders: true,
        });
      } else {
        // Neither canonical nor legacy headers present — reject
        logger.warn('[ChannelAuth] Missing auth artefacts — no canonical or legacy headers', {
          channelSlug,
          canonicalSigHeader,
          canonicalTsHeader,
          path: req.path,
          requestId,
        });
        res.status(401).json({
          error: 'MISSING_AUTH_ARTEFACTS',
          message: `${channel.signatureHeader} and ${channel.timestampHeader} headers are required`,
        });
        return;
      }
    }

    // ── Step 7: HMAC verification per channel.authScheme dispatch ─────────────
    // Phase 5.2 implementation handles HMAC_SHA256; future schemes extend via
    // authScheme enum dispatch.
    if (channel.authScheme !== 'HMAC_SHA256') {
      logger.warn('[ChannelAuth] Unsupported auth scheme', {
        channelSlug,
        authScheme: channel.authScheme,
        path: req.path,
        requestId,
      });
      res.status(501).json({
        error: 'UNSUPPORTED_AUTH_SCHEME',
        message: `Auth scheme ${channel.authScheme} is not yet supported`,
      });
      return;
    }

    const rawBodyBuf = (req as Request & { rawBody?: Buffer }).rawBody;
    const rawBody = rawBodyBuf ? rawBodyBuf.toString('utf8') : '';

    if (!verifyHmacSignature(rawBody, signature, channel.hmacSecret, timestamp)) {
      logger.warn('[ChannelAuth] Invalid HMAC signature on inbound request', {
        channelSlug,
        path: req.path,
        requestId,
        usedLegacyHeaders,
      });
      res.status(401).json({ error: 'INVALID_SIGNATURE', message: 'Request signature verification failed' });
      return;
    }

    // ── Step 8: Attach channelSlug to request for downstream middleware ────────
    // channelRateLimiter reads req.params.channelSlug; this ensures it is
    // available even on legacy routes where it was not in the original params.
    if (!req.params.channelSlug) {
      req.params.channelSlug = channelSlug;
    }

    next();
  };
}
