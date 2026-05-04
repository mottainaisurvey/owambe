/**
 * ─── Booking.com Connectivity API Adapter ──────────────────────────────────
 *
 * Purpose: Distribute Owambe Stay properties to Booking.com via the
 *          Booking.com Connectivity API (formerly "Extranet API").
 *
 * Mode:    STAYS only
 *
 * API Docs: https://developers.booking.com/connectivity/
 *
 * Environment Variables Required:
 *   BOOKING_COM_API_KEY        — OAuth2 client_credentials access token
 *   BOOKING_COM_PROPERTY_ID    — Booking.com property ID (hotel_id)
 *   BOOKING_COM_API_URL        — Base URL (default: https://supply-xml.booking.com)
 *
 * Auth:    HTTP Basic Auth (username = BOOKING_COM_API_KEY, password = empty)
 *          OR OAuth2 Bearer token depending on API version
 *
 * Key Endpoints (Phase D implementation targets):
 *   POST   /hotels                        — Create a new property
 *   PUT    /hotels/{hotel_id}             — Update property details
 *   PUT    /hotels/{hotel_id}/rooms       — Manage room types
 *   PUT    /hotels/{hotel_id}/availability — Update availability calendar
 *   PUT    /hotels/{hotel_id}/prices      — Update pricing
 *   DELETE /hotels/{hotel_id}             — Deactivate property
 *   GET    /hotels/{hotel_id}/status      — Get sync status
 *
 * Phase A.5: Fully typed scaffold with mode guard and error handling.
 * Phase D:   Replace stub bodies with real Booking.com API calls.
 */

import {
  BaseChannelAdapter,
  ChannelListingPayload,
  ChannelListingResult,
  ChannelSyncStatus,
} from '../adapter.interface';
import { logger } from '../../../utils/logger';

const BOOKING_COM_BASE_URL = process.env.BOOKING_COM_API_URL ?? 'https://supply-xml.booking.com';

export interface BookingComPropertyPayload {
  /** Owambe property ID */
  propertyId: string;
  /** Property name */
  name: string;
  /** Property type (hotel, guesthouse, villa, etc.) */
  propertyType: string;
  /** Full address */
  address: string;
  /** City */
  city: string;
  /** Country code (ISO 3166-1 alpha-2, e.g. 'NG') */
  countryCode: string;
  /** Latitude */
  latitude: number;
  /** Longitude */
  longitude: number;
  /** Contact email */
  email: string;
  /** Contact phone */
  phone: string;
  /** Star rating (1-5) */
  starRating?: number;
  /** Description */
  description?: string;
  /** Cover image URL */
  coverImageUrl?: string;
}

export class BookingComAdapter extends BaseChannelAdapter {
  readonly channelName = 'BOOKING_COM' as const;

  isConfigured(): boolean {
    return !!(process.env.BOOKING_COM_API_KEY && process.env.BOOKING_COM_PROPERTY_ID);
  }

  /**
   * Create a new property listing on Booking.com.
   * Payload mode MUST be 'STAYS'.
   *
   * Phase D implementation:
   *   const resp = await axios.post(`${BOOKING_COM_BASE_URL}/hotels`, {
   *     hotel_name: payload.data.name,
   *     hotel_type: mapPropertyType(payload.data.propertyType),
   *     address: { street: payload.data.address, city: payload.data.city, country: payload.data.countryCode },
   *     coordinates: { latitude: payload.data.latitude, longitude: payload.data.longitude },
   *     contact: { email: payload.data.email, phone: payload.data.phone },
   *   }, {
   *     auth: { username: process.env.BOOKING_COM_API_KEY!, password: '' }
   *   });
   *   return { success: true, externalId: String(resp.data.hotel_id), externalUrl: `https://www.booking.com/hotel/ng/${resp.data.url_name}.html` };
   */
  async createListing(payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    if (payload.mode !== 'STAYS') {
      return { success: false, error: 'Booking.com adapter only supports STAYS mode' };
    }
    logger.info(`[BookingCom] createListing scaffold for property ${payload.entityId}`, {
      baseUrl: BOOKING_COM_BASE_URL,
      endpoint: '/hotels',
      method: 'POST',
    });
    // TODO Phase D: implement Booking.com Connectivity API call
    return {
      success: true,
      externalId: `bdc-scaffold-${payload.entityId}`,
      externalUrl: `https://www.booking.com/hotel/ng/owambe-${payload.entityId}.html`,
      rawResponse: { scaffold: true, entityId: payload.entityId },
    };
  }

  /**
   * Update an existing property listing on Booking.com.
   *
   * Phase D implementation:
   *   await axios.put(`${BOOKING_COM_BASE_URL}/hotels/${externalId}`, { ...updateFields }, { auth: ... });
   */
  async updateListing(externalId: string, payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    if (payload.mode !== 'STAYS') {
      return { success: false, error: 'Booking.com adapter only supports STAYS mode' };
    }
    logger.info(`[BookingCom] updateListing scaffold for ${externalId}`, {
      endpoint: `/hotels/${externalId}`,
      method: 'PUT',
    });
    // TODO Phase D: implement update
    return { success: true, externalId };
  }

  /**
   * Deactivate a property listing on Booking.com.
   *
   * Phase D implementation:
   *   await axios.delete(`${BOOKING_COM_BASE_URL}/hotels/${externalId}`, { auth: ... });
   */
  async deleteListing(externalId: string): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    logger.info(`[BookingCom] deleteListing scaffold for ${externalId}`, {
      endpoint: `/hotels/${externalId}`,
      method: 'DELETE',
    });
    // TODO Phase D: implement deactivation
    return { success: true, externalId };
  }

  /**
   * Get the sync status of a property on Booking.com.
   *
   * Phase D implementation:
   *   const resp = await axios.get(`${BOOKING_COM_BASE_URL}/hotels/${externalId}/status`, { auth: ... });
   *   return { channel: this.channelName, entityId: externalId, externalId, status: mapStatus(resp.data.status) };
   */
  async getStatus(externalId: string): Promise<ChannelSyncStatus> {
    return {
      channel: this.channelName,
      entityId: externalId,
      externalId,
      status: 'PENDING',
    };
  }
}
