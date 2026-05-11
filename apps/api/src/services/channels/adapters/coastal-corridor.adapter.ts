/**
 * ─── Coastal Corridor Channel Adapter ──────────────────────────────────────
 *
 * Purpose: First-party integration between Owambe and Coastal Corridor
 *          (verified real estate and tourism platform for the Lagos-Calabar
 *          corridor). Implements both STAYS and EXPERIENCES modes.
 *
 * API Contract: coastal-corridor-owambe-api.yaml v1.0.0
 *
 * This adapter handles OUTBOUND calls (Owambe → Coastal Corridor):
 *   - Flow 1: Stays availability and pricing
 *   - Flow 3: Experiences inventory and time-slots
 *
 * Inbound calls (Coastal Corridor → Owambe) are handled by the
 * channel router: src/routes/channel.ts
 *
 * Environment Variables Required:
 *   COASTAL_CORRIDOR_API_URL     — Base URL (default: https://api.coastalcorridor.africa/v1/channel)
 *   COASTAL_CORRIDOR_SHARED_SECRET — HMAC-SHA256 shared secret for request signing
 *   COASTAL_CORRIDOR_WEBHOOK_SECRET — Secret for verifying inbound webhooks from CC
 *
 * Auth:    HMAC-SHA256 signature of timestamp.body (CC's verifyChannelRequest guard).
 *          Header: x-owambe-signature: HMAC-SHA256(timestamp + "." + body) as raw hex, no prefix
 *          Header: x-owambe-timestamp: Unix epoch seconds (5-minute replay window)
 *          Header: x-idempotency-key: caller-generated UUID
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  BaseChannelAdapter,
  ChannelListingPayload,
  ChannelListingResult,
  ChannelSyncStatus,
} from '../adapter.interface';
import { logger } from '../../../utils/logger';

// ─── Type Definitions (from API contract) ─────────────────────────────────

// CCAddress and CCLocation are kept for reference but CC's API uses flat top-level fields
export interface CCAddress {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  country: string;
  postalCode?: string | null;
}

export interface CCLocation {
  latitude: number;
  longitude: number;
}

export interface CCPhoto {
  url: string;
  caption?: string;
  isPrimary?: boolean;
}

export interface CCRoom {
  owambe_room_id: string;
  name: string;
  room_type: 'STANDARD' | 'DELUXE' | 'SUITE' | 'FAMILY' | 'ENTIRE_PROPERTY' | 'OTHER';
  capacity: number;
  base_rate: number;
  base_currency: 'NGN' | 'USD' | 'GBP';
}

export interface CCPropertyPolicies {
  checkInTime?: string;
  checkOutTime?: string;
  cancellationPolicy?: 'FLEXIBLE' | 'MODERATE' | 'STRICT';
  houseRules?: string[];
  damageDepositRequired?: boolean;
  damageDepositAmount?: number;
  damageDepositCurrency?: 'NGN' | 'USD' | 'GBP';
}

/**
 * CCPropertyRegistration — uses CC's actual API shape:
 * snake_case field names, flat address/location fields (not nested objects).
 */
export interface CCPropertyRegistration {
  owambe_property_id: string;
  host_owambe_user_id: string;
  host_user_id: string;
  cohort_member?: boolean;
  cohort_type?: 'COASTAL_CORRIDOR_HOST' | 'COASTAL_CORRIDOR_OPERATOR' | 'BOTH' | null;
  cohort_code?: string;  // CC-issued code; include for host auto-creation on first push
  name: string;
  description?: string;
  property_type: 'BEACH_HOUSE' | 'GUESTHOUSE' | 'HOTEL' | 'SERVICED_APARTMENT' | 'RESORT' | 'HERITAGE' | 'OTHER';
  // Flat address fields
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  country: string;
  postal_code?: string | null;
  // Flat location fields
  latitude: number;
  longitude: number;
  amenities?: string[];
  photos?: CCPhoto[];
  policies?: CCPropertyPolicies;
  rooms: CCRoom[];
  status: 'ACTIVE' | 'INACTIVE' | 'UNDER_REVIEW';
}

export interface CCPropertyRegistrationResponse {
  // CC returns 'id' as the property ID, not 'coastalCorridorPropertyId'
  id: string;
  owambe_property_id: string;
  status: string;
  // listingUrl and createdAt may not always be present
  listingUrl?: string;
  createdAt?: string;
  // Legacy field names kept for backward compat (may be undefined)
  coastalCorridorPropertyId?: string;
  owambePropertyId?: string;
}

export interface CCAvailabilityEntry {
  date: string; // ISO date YYYY-MM-DD
  available: boolean;
  rate?: number;
  currency?: 'NGN' | 'USD' | 'GBP';
  minimumStay?: number;
  maximumStay?: number;
  closedReason?: string;
}

/**
 * CCAvailabilityRoomUpdate — per-room payload within the CC rooms array.
 * CC contract: { owambe_room_id, dates: [{ date, available, rate? }] }
 */
export interface CCAvailabilityRoomUpdate {
  owambe_room_id: string;
  dates: CCAvailabilityEntry[];
}

/**
 * CCAvailabilityUpdate — the full payload sent to CC.
 * OWB-C-01: CC contract requires rooms array (not flat entries).
 * Idempotency key is derived from owambeRoomId + startDate + endDate per room.
 */
export interface CCAvailabilityUpdate {
  owambeRoomId: string;  // kept for idempotency key derivation; not sent to CC
  startDate: string;     // kept for idempotency key derivation; not sent to CC
  endDate: string;       // kept for idempotency key derivation; not sent to CC
  entries: CCAvailabilityEntry[]; // kept for internal use; not sent to CC
}

export interface CCExperiencePricing {
  model: 'PER_PERSON' | 'PER_GROUP' | 'TIERED';
  basePrice: number;
  baseCurrency: 'NGN' | 'USD' | 'GBP';
}

export interface CCMeetingPoint {
  description: string;
  latitude: number;
  longitude: number;
}

export interface CCExperienceRegistration {
  owambeExperienceId: string;
  operatorOwambeUserId: string;
  cohortMember?: boolean;
  cohortType?: 'COASTAL_CORRIDOR_HOST' | 'COASTAL_CORRIDOR_OPERATOR' | 'BOTH' | null;
  name: string;
  description?: string;
  experienceType: 'TOUR' | 'CHARTER' | 'WORKSHOP' | 'FOOD_EXPERIENCE' | 'TRANSPORT' | 'EVENT_SPECIALIST' | 'WELLNESS' | 'OTHER';
  durationMinutes: number;
  capacity: number;
  meetingPoint: CCMeetingPoint;
  pricing: CCExperiencePricing;
  ageRestriction?: string;
  fitnessRequirement?: string;
  weatherDependent?: boolean;
  equipmentProvided?: string[];
  equipmentRequired?: string[];
  photos?: CCPhoto[];
  status: 'ACTIVE' | 'INACTIVE' | 'UNDER_REVIEW';
}

export interface CCExperienceRegistrationResponse {
  coastalCorridorExperienceId: string;
  owambeExperienceId: string;
  status: string;
  listingUrl: string;
  createdAt: string;
}

export interface CCTimeSlot {
  owambeTimeSlotId: string;
  startDateTime: string; // ISO 8601
  endDateTime: string;
  capacity: number;
  spotsBooked: number;
  rate?: number;
  currency?: 'NGN' | 'USD' | 'GBP';
  recurrencePattern?: string; // RFC 5545 RRULE
  status: 'OPEN' | 'FULL' | 'CANCELLED' | 'COMPLETED';
}

export interface CCTimeSlotsUpdate {
  slots: CCTimeSlot[];
}

// ─── HMAC Signing ──────────────────────────────────────────────────────────

/**
 * Sign a request for Coastal Corridor.
 * CC's verifyChannelRequest guard enforces:
 *   x-owambe-signature = HMAC-SHA256(timestamp + "." + body) as raw hex (no prefix)
 *   x-owambe-timestamp = Unix epoch seconds (5-minute replay window)
 */
function signRequest(body: string, timestamp: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}.${body}`, 'utf8');
  return hmac.digest('hex');
}

/**
 * Verify an inbound HMAC signature from Coastal Corridor.
 *
 * CC signs outbound webhooks with the same strategy as Owambe's outbound calls:
 *   HMAC-SHA256(timestamp + "." + body) as raw hex, no prefix.
 *
 * @param rawBody         - Raw request body string (UTF-8)
 * @param signature       - Value of the x-owambe-signature header
 * @param secret          - Shared secret (COASTAL_CORRIDOR_WEBHOOK_SECRET or COASTAL_CORRIDOR_SHARED_SECRET)
 * @param inboundTimestamp - Value of the x-owambe-timestamp header (Unix epoch seconds as string)
 */
export function verifyInboundSignature(
  rawBody: string,
  signature: string,
  secret: string,
  inboundTimestamp: string,
): boolean {
  // Enforce a 5-minute replay window
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(inboundTimestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > 300) {
    return false;
  }
  const expected = signRequest(rawBody, inboundTimestamp, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─── Adapter Class ─────────────────────────────────────────────────────────

export class CoastalCorridorAdapter extends BaseChannelAdapter {
  readonly channelName = 'COASTAL_CORRIDOR' as const;

  private readonly baseUrl: string;
  private readonly sharedSecret: string;
  private readonly client: AxiosInstance;

  constructor() {
    super();
    this.baseUrl = process.env.COASTAL_CORRIDOR_BASE_URL ?? process.env.COASTAL_CORRIDOR_API_URL ?? 'https://api.coastalcorridor.africa/v1/channel';
    this.sharedSecret = process.env.COASTAL_CORRIDOR_SHARED_SECRET ?? '';

    this.client = axios.create({
      baseURL: `${this.baseUrl}/api/v1/channel`,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  }

  isConfigured(): boolean {
    return !!(process.env.COASTAL_CORRIDOR_SHARED_SECRET);
  }

  /**
   * Build signed request headers for a Coastal Corridor API call.
   * Uses CC's documented three-header scheme:
   *   x-owambe-signature  — HMAC-SHA256(timestamp.body) as raw hex
   *   x-owambe-timestamp  — Unix epoch seconds
   *   x-idempotency-key   — deterministic UUID (v5 from semantic key) or random UUID
   *
   * @param body             - JSON-serialised request body (already stringified)
   * @param idempotencyKey   - Optional deterministic key; if omitted a random UUIDv4 is used
   */
  private buildHeaders(body: string, idempotencyKey?: string): Record<string, string> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    return {
      'x-owambe-signature': signRequest(body, timestamp, this.sharedSecret),
      'x-owambe-timestamp': timestamp,
      'x-idempotency-key': idempotencyKey ?? uuidv4(),
    };
  }

  /**
   * Handle Axios errors with structured logging.
   */
  private handleError(error: unknown, operation: string): ChannelListingResult {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const data = error.response?.data;
      logger.error(`[CoastalCorridor] ${operation} failed`, { status, data, message: error.message });
      return {
        success: false,
        error: `${operation} failed: HTTP ${status} — ${(data as { message?: string })?.message ?? error.message}`,
      };
    }
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[CoastalCorridor] ${operation} unexpected error`, { error: msg });
    return { success: false, error: `${operation} unexpected error: ${msg}` };
  }

  // ─── FLOW 1: Stays Availability ─────────────────────────────────────────

  /**
   * Register a property on Coastal Corridor.
   * Idempotent on owambePropertyId.
   * Supports both STAYS and EXPERIENCES modes (property registration is STAYS).
   *
   * POST /stays/properties
   */
  async registerProperty(payload: CCPropertyRegistration): Promise<CCPropertyRegistrationResponse & { alreadyExisted?: boolean }> {
    const body = JSON.stringify(payload);
    const headers = this.buildHeaders(body);

    logger.info(`[CoastalCorridor] registerProperty`, {
      owambePropertyId: payload.owambe_property_id,
      endpoint: '/stays/properties',
    });

    // Pass the pre-serialised string so the signed body and the transmitted body are identical.
    const resp = await this.client.post<CCPropertyRegistrationResponse>('/stays/properties', body, { headers: { ...headers, 'Content-Type': 'application/json' } });
    return { ...resp.data, alreadyExisted: resp.status === 200 };
  }

  /**
   * Update property metadata on Coastal Corridor.
   *
   * PATCH /stays/properties/{owambePropertyId}
   * OWB-C-02: path param is the Owambe UUID (REG-BUG-03 lesson from OWB-C-01).
   * Body is serialised once and the same string is both signed and transmitted
   * so the HMAC covers exactly the bytes CC receives.
   */
  async updateProperty(
    owambePropertyId: string,
    update: Partial<Pick<CCPropertyRegistration, 'name' | 'description' | 'property_type' | 'address_line1' | 'address_line2' | 'city' | 'state' | 'country' | 'latitude' | 'longitude' | 'amenities' | 'policies' | 'status'>>,
  ): Promise<CCPropertyRegistrationResponse> {
    const body = JSON.stringify(update);
    const headers = this.buildHeaders(body);

    logger.info(`[CoastalCorridor] updateProperty`, { owambePropertyId, endpoint: `/stays/properties/${owambePropertyId}` });

    const resp = await this.client.patch<CCPropertyRegistrationResponse>(
      `/stays/properties/${owambePropertyId}`,
      body,
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    );
    return resp.data;
  }

  /**
   * Deactivate a property listing on Coastal Corridor (soft-delete).
   *
   * DELETE /stays/properties/{owambePropertyId}
   * OWB-C-03: path param is the Owambe UUID (REG-BUG-03 lesson from OWB-C-01).
   * HMAC is signed over empty string for DELETE (no body).
   * Returns the CC response body for sync status tracking.
   */
  async deactivateProperty(owambePropertyId: string): Promise<{ deleted: boolean; owambe_property_id: string }> {
    const headers = this.buildHeaders('');
    logger.info(`[CoastalCorridor] deactivateProperty`, { owambePropertyId, endpoint: `/stays/properties/${owambePropertyId}` });
    const resp = await this.client.delete<{ deleted: boolean; owambe_property_id: string }>(
      `/stays/properties/${owambePropertyId}`,
      { headers },
    );
    return resp.data;
  }

  /**
   * Update availability and pricing for a date range.
   * Idempotent on owambeRoomId + startDate + endDate.
   *
   * PUT /stays/properties/{coastalCorridorPropertyId}/availability
   */
  async updateAvailability(
    coastalCorridorPropertyId: string,
    update: CCAvailabilityUpdate,
  ): Promise<{ updatedDates: number; effectiveAt: string }> {
    // OWB-C-01: Derive a deterministic idempotency key from the semantic triple
    // (owambeRoomId + startDate + endDate) so that re-sending the same payload
    // with the same semantic content produces the same key (idempotent re-send),
    // while a legitimate edit (different date range) produces a different key.
    const semanticKey = `${update.owambeRoomId}:${update.startDate}:${update.endDate}`;
    const deterministicIdempotencyKey = crypto
      .createHash('sha256')
      .update(semanticKey, 'utf8')
      .digest('hex')
      .substring(0, 32)
      .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'); // format as UUID-like

    // OWB-C-01 payload fix: CC contract requires { rooms: [{ owambe_room_id, dates: [...] }] }
    // not a flat entries array. Wrap the entries in the canonical rooms array format.
    const ccPayload: { rooms: CCAvailabilityRoomUpdate[] } = {
      rooms: [
        {
          owambe_room_id: update.owambeRoomId,
          dates: update.entries,
        },
      ],
    };

    const body = JSON.stringify(ccPayload);
    const headers = this.buildHeaders(body, deterministicIdempotencyKey);

    logger.info(`[CoastalCorridor] updateAvailability`, {
      coastalCorridorPropertyId,
      owambeRoomId: update.owambeRoomId,
      dateRange: `${update.startDate}/${update.endDate}`,
      entryCount: update.entries.length,
      payloadFormat: 'rooms_array',
    });

    const resp = await this.client.put<{ updatedDates: number; effectiveAt: string }>(
      `/stays/properties/${coastalCorridorPropertyId}/availability`,
      ccPayload,
      { headers },
    );
    return resp.data;
  }

  // ─── FLOW 3: Experiences Inventory ──────────────────────────────────────

  /**
   * Register an experience on Coastal Corridor.
   * Idempotent on owambeExperienceId.
   *
   * POST /experiences/inventory
   */
  async registerExperience(payload: CCExperienceRegistration): Promise<CCExperienceRegistrationResponse & { alreadyExisted?: boolean }> {
    const body = JSON.stringify(payload);
    const headers = this.buildHeaders(body);

    logger.info(`[CoastalCorridor] registerExperience`, {
      owambeExperienceId: payload.owambeExperienceId,
      endpoint: '/experiences/inventory',
    });

    const resp = await this.client.post<CCExperienceRegistrationResponse>('/experiences/inventory', payload, { headers });
    return { ...resp.data, alreadyExisted: resp.status === 200 };
  }

  /**
   * Update time slots and capacity for an experience.
   * Idempotent on owambeTimeSlotId.
   *
   * PUT /experiences/{coastalCorridorExperienceId}/time-slots
   */
  async updateTimeSlots(
    coastalCorridorExperienceId: string,
    update: CCTimeSlotsUpdate,
  ): Promise<{ updatedSlots: number; effectiveAt: string }> {
    const body = JSON.stringify(update);
    const headers = this.buildHeaders(body);

    logger.info(`[CoastalCorridor] updateTimeSlots`, {
      coastalCorridorExperienceId,
      slotCount: update.slots.length,
    });

    const resp = await this.client.put<{ updatedSlots: number; effectiveAt: string }>(
      `/experiences/${coastalCorridorExperienceId}/time-slots`,
      update,
      { headers },
    );
    return resp.data;
  }

  // ─── Reconciliation ─────────────────────────────────────────────────────

  /**
   * Get a stays state snapshot from Coastal Corridor for reconciliation.
   *
   * GET /reconciliation/stays/snapshot
   */
  async getStaysSnapshot(ownerOwambeUserId?: string, dateRange?: string): Promise<unknown> {
    const params: Record<string, string> = {};
    if (ownerOwambeUserId) params.ownerOwambeUserId = ownerOwambeUserId;
    if (dateRange) params.dateRange = dateRange;

    const headers = this.buildHeaders('');
    const resp = await this.client.get('/reconciliation/stays/snapshot', { params, headers });
    return resp.data;
  }

  /**
   * Get an experiences state snapshot from Coastal Corridor for reconciliation.
   *
   * GET /reconciliation/experiences/snapshot
   */
  async getExperiencesSnapshot(operatorOwambeUserId?: string, dateRange?: string): Promise<unknown> {
    const params: Record<string, string> = {};
    if (operatorOwambeUserId) params.operatorOwambeUserId = operatorOwambeUserId;
    if (dateRange) params.dateRange = dateRange;

    const headers = this.buildHeaders('');
    const resp = await this.client.get('/reconciliation/experiences/snapshot', { params, headers });
    return resp.data;
  }

  // ─── IChannelAdapter interface methods ──────────────────────────────────

  /**
   * IChannelAdapter.createListing — routes to registerProperty or registerExperience
   * based on payload.mode.
   */
  async createListing(payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();

    try {
      if (payload.mode === 'STAYS') {
        const data = payload.data as CCPropertyRegistration;
        const result = await this.registerProperty(data);
        return {
          success: true,
          externalId: result.coastalCorridorPropertyId,
          externalUrl: result.listingUrl,
          rawResponse: result,
        };
      } else if (payload.mode === 'EXPERIENCES') {
        const data = payload.data as CCExperienceRegistration;
        const result = await this.registerExperience(data);
        return {
          success: true,
          externalId: result.coastalCorridorExperienceId,
          externalUrl: result.listingUrl,
          rawResponse: result,
        };
      } else {
        return { success: false, error: `Coastal Corridor adapter does not support mode: ${payload.mode}` };
      }
    } catch (error) {
      return this.handleError(error, 'createListing');
    }
  }

  /**
   * IChannelAdapter.updateListing — routes to updateProperty or updateTimeSlots
   * based on payload.mode.
   */
  async updateListing(externalId: string, payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();

    try {
      if (payload.mode === 'STAYS') {
        const data = payload.data as Partial<CCPropertyRegistration>;
        await this.updateProperty(externalId, data);
        return { success: true, externalId };
      } else if (payload.mode === 'EXPERIENCES') {
        // For experiences, updateListing pushes time slot updates
        const data = payload.data as CCTimeSlotsUpdate;
        await this.updateTimeSlots(externalId, data);
        return { success: true, externalId };
      } else {
        return { success: false, error: `Coastal Corridor adapter does not support mode: ${payload.mode}` };
      }
    } catch (error) {
      return this.handleError(error, 'updateListing');
    }
  }

  /**
   * IChannelAdapter.deleteListing — deactivates a property or experience.
   */
  async deleteListing(externalId: string): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();

    try {
      await this.deactivateProperty(externalId);
      return { success: true, externalId };
    } catch (error) {
      return this.handleError(error, 'deleteListing');
    }
  }

  async getStatus(externalId: string): Promise<ChannelSyncStatus> {
    return {
      channel: this.channelName,
      entityId: externalId,
      externalId,
      status: 'SYNCED',
    };
  }
}
