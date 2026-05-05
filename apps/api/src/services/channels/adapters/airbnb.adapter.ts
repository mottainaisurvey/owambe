/**
 * ─── Airbnb Host API Adapter ────────────────────────────────────────────────
 *
 * Purpose: Distribute Owambe Stay properties to Airbnb via the
 *          Airbnb Host API (available to software partners/channel managers).
 *
 * Mode:    STAYS only
 *
 * API Docs: https://www.airbnb.com/partner/api-docs
 *           (Requires Airbnb Software Partner approval)
 *
 * Environment Variables Required:
 *   AIRBNB_API_KEY     — Airbnb Partner API key (client_id)
 *   AIRBNB_USER_ID     — Airbnb host user ID
 *   AIRBNB_API_URL     — Base URL (default: https://api.airbnb.com/v2)
 *
 * Auth:    X-Airbnb-API-Key header
 *
 * Key Endpoints (Phase D implementation targets):
 *   POST   /listings                         — Create a new listing
 *   PUT    /listings/{listing_id}            — Update listing details
 *   POST   /listings/{listing_id}/photos     — Upload listing photos
 *   PUT    /listings/{listing_id}/availability_rules — Set availability
 *   PUT    /listings/{listing_id}/pricing_settings   — Set pricing
 *   DELETE /listings/{listing_id}            — Archive/deactivate listing
 *   GET    /listings/{listing_id}            — Get listing status
 *
 * Phase A.5: Fully typed scaffold with mode guard and error handling.
 * Phase D:   Replace stub bodies with real Airbnb Host API calls.
 */

import {
  BaseChannelAdapter,
  ChannelListingPayload,
  ChannelListingResult,
  ChannelSyncStatus,
} from '../adapter.interface';
import { logger } from '../../../utils/logger';

const AIRBNB_BASE_URL = process.env.AIRBNB_API_URL ?? 'https://api.airbnb.com/v2';

export interface AirbnbListingPayload {
  /** Owambe property ID */
  propertyId: string;
  /** Listing name */
  name: string;
  /** Listing description */
  description: string;
  /** Property type (e.g. 'apartment', 'house', 'villa') */
  propertyType: string;
  /** Room type (e.g. 'entire_home', 'private_room', 'shared_room') */
  roomType: 'entire_home' | 'private_room' | 'shared_room';
  /** Number of bedrooms */
  bedrooms: number;
  /** Number of bathrooms */
  bathrooms: number;
  /** Maximum guest count */
  maxGuests: number;
  /** Nightly price in NGN */
  pricePerNight: number;
  /** City */
  city: string;
  /** Country code */
  countryCode: string;
  /** Latitude */
  latitude: number;
  /** Longitude */
  longitude: number;
  /** Cover image URL */
  coverImageUrl?: string;
  /** Amenities list */
  amenities?: string[];
}

export class AirbnbAdapter extends BaseChannelAdapter {
  readonly channelName = 'AIRBNB' as const;

  isConfigured(): boolean {
    return !!(process.env.AIRBNB_API_KEY && process.env.AIRBNB_USER_ID);
  }

  /**
   * Create a new listing on Airbnb.
   * Payload mode MUST be 'STAYS'.
   *
   * Phase D implementation:
   *   const resp = await axios.post(`${AIRBNB_BASE_URL}/listings`, {
   *     user_id: process.env.AIRBNB_USER_ID,
   *     listing: {
   *       name: payload.data.name,
   *       description: payload.data.description,
   *       property_type_id: mapPropertyType(payload.data.propertyType),
   *       room_type_category: payload.data.roomType,
   *       bedrooms: payload.data.bedrooms,
   *       bathrooms: payload.data.bathrooms,
   *       person_capacity: payload.data.maxGuests,
   *       lat: payload.data.latitude,
   *       lng: payload.data.longitude,
   *       city: payload.data.city,
   *       country_code: payload.data.countryCode,
   *     }
   *   }, {
   *     headers: { 'X-Airbnb-API-Key': process.env.AIRBNB_API_KEY }
   *   });
   *   return { success: true, externalId: String(resp.data.listing.id), externalUrl: `https://www.airbnb.com/rooms/${resp.data.listing.id}` };
   */
  async createListing(payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    if (payload.mode !== 'STAYS') {
      return { success: false, error: 'Airbnb adapter only supports STAYS mode' };
    }
    logger.info(`[Airbnb] createListing scaffold for property ${payload.entityId}`, {
      baseUrl: AIRBNB_BASE_URL,
      endpoint: '/listings',
      method: 'POST',
    });
    // TODO Phase D: implement Airbnb Host API call
    return {
      success: true,
      externalId: `airbnb-scaffold-${payload.entityId}`,
      externalUrl: `https://www.airbnb.com/rooms/scaffold-${payload.entityId}`,
      rawResponse: { scaffold: true, entityId: payload.entityId },
    };
  }

  /**
   * Update an existing listing on Airbnb.
   *
   * Phase D implementation:
   *   await axios.put(`${AIRBNB_BASE_URL}/listings/${externalId}`, { listing: { ...updateFields } },
   *     { headers: { 'X-Airbnb-API-Key': process.env.AIRBNB_API_KEY } });
   */
  async updateListing(externalId: string, payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    if (payload.mode !== 'STAYS') {
      return { success: false, error: 'Airbnb adapter only supports STAYS mode' };
    }
    logger.info(`[Airbnb] updateListing scaffold for ${externalId}`, {
      endpoint: `/listings/${externalId}`,
      method: 'PUT',
    });
    // TODO Phase D: implement update
    return { success: true, externalId };
  }

  /**
   * Archive/deactivate a listing on Airbnb.
   *
   * Phase D implementation:
   *   await axios.delete(`${AIRBNB_BASE_URL}/listings/${externalId}`,
   *     { headers: { 'X-Airbnb-API-Key': process.env.AIRBNB_API_KEY } });
   */
  async deleteListing(externalId: string): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    logger.info(`[Airbnb] deleteListing scaffold for ${externalId}`, {
      endpoint: `/listings/${externalId}`,
      method: 'DELETE',
    });
    // TODO Phase D: implement deactivation
    return { success: true, externalId };
  }

  async getStatus(externalId: string): Promise<ChannelSyncStatus> {
    return {
      channel: this.channelName,
      entityId: externalId,
      externalId,
      status: 'PENDING',
    };
  }
}
