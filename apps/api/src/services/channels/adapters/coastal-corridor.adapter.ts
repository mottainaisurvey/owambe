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
 * Auth:    HMAC-SHA256 signature of the request body.
 *          Header: X-Signature: hmac-sha256=<hex-digest>
 *          Header: Idempotency-Key: <uuid-v4>
 *          Header: X-Request-Id: <caller-generated-id>
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
  owambeRoomId: string;
  name: string;
  roomType: 'STANDARD' | 'DELUXE' | 'SUITE' | 'FAMILY' | 'ENTIRE_PROPERTY' | 'OTHER';
  capacity: number;
  baseRate: number;
  baseCurrency: 'NGN' | 'USD' | 'GBP';
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

export interface CCPropertyRegistration {
  owambePropertyId: string;
  hostOwambeUserId: string;
  cohortMember?: boolean;
  cohortType?: 'COASTAL_CORRIDOR_HOST' | 'COASTAL_CORRIDOR_OPERATOR' | 'BOTH' | null;
  name: string;
  description?: string;
  propertyType: 'BEACH_HOUSE' | 'GUESTHOUSE' | 'HOTEL' | 'SERVICED_APARTMENT' | 'RESORT' | 'HERITAGE' | 'OTHER';
  address: CCAddress;
  location: CCLocation;
  amenities?: string[];
  photos?: CCPhoto[];
  policies?: CCPropertyPolicies;
  rooms: CCRoom[];
  status: 'ACTIVE' | 'INACTIVE' | 'UNDER_REVIEW';
}

export interface CCPropertyRegistrationResponse {
  coastalCorridorPropertyId: string;
  owambePropertyId: string;
  status: string;
  listingUrl: string;
  createdAt: string;
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

export interface CCAvailabilityUpdate {
  owambeRoomId: string;
  startDate: string;
  endDate: string;
  entries: CCAvailabilityEntry[];
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

function signRequest(body: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body, 'utf8');
  return `hmac-sha256=${hmac.digest('hex')}`;
}

export function verifyInboundSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = signRequest(rawBody, secret);
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
    this.baseUrl = process.env.COASTAL_CORRIDOR_API_URL ?? 'https://api.coastalcorridor.africa/v1/channel';
    this.sharedSecret = process.env.COASTAL_CORRIDOR_SHARED_SECRET ?? '';

    this.client = axios.create({
      baseURL: this.baseUrl,
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
   */
  private buildHeaders(body: string): Record<string, string> {
    return {
      'X-Signature': signRequest(body, this.sharedSecret),
      'Idempotency-Key': uuidv4(),
      'X-Request-Id': uuidv4(),
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
      owambePropertyId: payload.owambePropertyId,
      endpoint: '/stays/properties',
    });

    const resp = await this.client.post<CCPropertyRegistrationResponse>('/stays/properties', payload, { headers });
    return { ...resp.data, alreadyExisted: resp.status === 200 };
  }

  /**
   * Update property metadata on Coastal Corridor.
   *
   * PATCH /stays/properties/{coastalCorridorPropertyId}
   */
  async updateProperty(
    coastalCorridorPropertyId: string,
    update: Partial<Pick<CCPropertyRegistration, 'name' | 'description' | 'amenities' | 'photos' | 'policies' | 'status'>>,
  ): Promise<CCPropertyRegistrationResponse> {
    const body = JSON.stringify(update);
    const headers = this.buildHeaders(body);

    logger.info(`[CoastalCorridor] updateProperty`, { coastalCorridorPropertyId, endpoint: `/stays/properties/${coastalCorridorPropertyId}` });

    const resp = await this.client.patch<CCPropertyRegistrationResponse>(
      `/stays/properties/${coastalCorridorPropertyId}`,
      update,
      { headers },
    );
    return resp.data;
  }

  /**
   * Deactivate a property listing on Coastal Corridor (soft-delete).
   *
   * DELETE /stays/properties/{coastalCorridorPropertyId}
   */
  async deactivateProperty(coastalCorridorPropertyId: string): Promise<void> {
    const headers = this.buildHeaders('');
    logger.info(`[CoastalCorridor] deactivateProperty`, { coastalCorridorPropertyId });
    await this.client.delete(`/stays/properties/${coastalCorridorPropertyId}`, { headers });
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
    const body = JSON.stringify(update);
    const headers = this.buildHeaders(body);

    logger.info(`[CoastalCorridor] updateAvailability`, {
      coastalCorridorPropertyId,
      owambeRoomId: update.owambeRoomId,
      dateRange: `${update.startDate}/${update.endDate}`,
      entryCount: update.entries.length,
    });

    const resp = await this.client.put<{ updatedDates: number; effectiveAt: string }>(
      `/stays/properties/${coastalCorridorPropertyId}/availability`,
      update,
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
