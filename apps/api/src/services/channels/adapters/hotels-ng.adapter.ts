/**
 * ─── Hotels.ng Supplier API Adapter ────────────────────────────────────────
 *
 * Purpose: Distribute Owambe Stay properties to Hotels.ng — Nigeria's
 *          leading hotel booking platform — via their Supplier/Channel
 *          Manager API.
 *
 * Mode:    STAYS only
 *
 * API Docs: https://hotels.ng/api-docs (contact: api@hotels.ng for access)
 *
 * Environment Variables Required:
 *   HOTELS_NG_API_KEY     — Hotels.ng supplier API key
 *   HOTELS_NG_API_URL     — Base URL (default: https://api.hotels.ng/v1)
 *   HOTELS_NG_SUPPLIER_ID — Hotels.ng supplier/partner ID
 *
 * Auth:    Authorization: Bearer {HOTELS_NG_API_KEY}
 *
 * Key Endpoints (Phase D implementation targets):
 *   POST   /properties                       — Create a new property
 *   PUT    /properties/{property_id}         — Update property details
 *   POST   /properties/{property_id}/rooms   — Add room types
 *   PUT    /properties/{property_id}/rates   — Update pricing/rates
 *   PUT    /properties/{property_id}/availability — Update availability
 *   DELETE /properties/{property_id}         — Deactivate property
 *   GET    /properties/{property_id}/status  — Get sync status
 *
 * Phase A.5: Fully typed scaffold with mode guard and error handling.
 * Phase D:   Replace stub bodies with real Hotels.ng Supplier API calls.
 */

import {
  BaseChannelAdapter,
  ChannelListingPayload,
  ChannelListingResult,
  ChannelSyncStatus,
} from '../adapter.interface';
import { logger } from '../../../utils/logger';

const HOTELS_NG_BASE_URL = process.env.HOTELS_NG_API_URL ?? 'https://api.hotels.ng/v1';

export interface HotelsNgPropertyPayload {
  /** Owambe property ID */
  propertyId: string;
  /** Property name */
  name: string;
  /** Property description */
  description: string;
  /** Property type */
  propertyType: string;
  /** City (must be a Hotels.ng-recognised Nigerian city) */
  city: string;
  /** State */
  state: string;
  /** Full address */
  address: string;
  /** Latitude */
  latitude: number;
  /** Longitude */
  longitude: number;
  /** Contact phone */
  phone: string;
  /** Contact email */
  email: string;
  /** Star rating (1-5) */
  starRating?: number;
  /** Cover image URL */
  coverImageUrl?: string;
  /** Gallery image URLs */
  galleryUrls?: string[];
  /** Amenities list */
  amenities?: string[];
  /** Nightly rate in NGN */
  baseRateNgn: number;
}

export class HotelsNgAdapter extends BaseChannelAdapter {
  readonly channelName = 'HOTELS_NG' as const;

  isConfigured(): boolean {
    return !!(process.env.HOTELS_NG_API_KEY && process.env.HOTELS_NG_SUPPLIER_ID);
  }

  /**
   * Create a new property listing on Hotels.ng.
   * Payload mode MUST be 'STAYS'.
   *
   * Phase D implementation:
   *   const resp = await axios.post(`${HOTELS_NG_BASE_URL}/properties`, {
   *     supplier_id: process.env.HOTELS_NG_SUPPLIER_ID,
   *     name: payload.data.name,
   *     description: payload.data.description,
   *     type: payload.data.propertyType,
   *     city: payload.data.city,
   *     state: payload.data.state,
   *     address: payload.data.address,
   *     latitude: payload.data.latitude,
   *     longitude: payload.data.longitude,
   *     contact: { phone: payload.data.phone, email: payload.data.email },
   *     base_rate: payload.data.baseRateNgn,
   *     currency: 'NGN',
   *   }, {
   *     headers: { Authorization: `Bearer ${process.env.HOTELS_NG_API_KEY}` }
   *   });
   *   return { success: true, externalId: resp.data.property_id, externalUrl: resp.data.url };
   */
  async createListing(payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    if (payload.mode !== 'STAYS') {
      return { success: false, error: 'Hotels.ng adapter only supports STAYS mode' };
    }
    logger.info(`[HotelsNg] createListing scaffold for property ${payload.entityId}`, {
      baseUrl: HOTELS_NG_BASE_URL,
      endpoint: '/properties',
      method: 'POST',
    });
    // TODO Phase D: implement Hotels.ng Supplier API call
    return {
      success: true,
      externalId: `hotelsng-scaffold-${payload.entityId}`,
      externalUrl: `https://hotels.ng/hotel/owambe-${payload.entityId}`,
      rawResponse: { scaffold: true, entityId: payload.entityId },
    };
  }

  /**
   * Update an existing property listing on Hotels.ng.
   *
   * Phase D implementation:
   *   await axios.put(`${HOTELS_NG_BASE_URL}/properties/${externalId}`, { ...updateFields },
   *     { headers: { Authorization: `Bearer ${process.env.HOTELS_NG_API_KEY}` } });
   */
  async updateListing(externalId: string, payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    if (payload.mode !== 'STAYS') {
      return { success: false, error: 'Hotels.ng adapter only supports STAYS mode' };
    }
    logger.info(`[HotelsNg] updateListing scaffold for ${externalId}`, {
      endpoint: `/properties/${externalId}`,
      method: 'PUT',
    });
    // TODO Phase D: implement update
    return { success: true, externalId };
  }

  /**
   * Deactivate a property listing on Hotels.ng.
   *
   * Phase D implementation:
   *   await axios.delete(`${HOTELS_NG_BASE_URL}/properties/${externalId}`,
   *     { headers: { Authorization: `Bearer ${process.env.HOTELS_NG_API_KEY}` } });
   */
  async deleteListing(externalId: string): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    logger.info(`[HotelsNg] deleteListing scaffold for ${externalId}`, {
      endpoint: `/properties/${externalId}`,
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
