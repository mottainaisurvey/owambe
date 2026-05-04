/**
 * ─── GetYourGuide Supplier API Adapter ─────────────────────────────────────
 *
 * Purpose: Distribute Owambe Experience activities to GetYourGuide (GYG)
 *          via the GetYourGuide Supplier API.
 *
 * Mode:    EXPERIENCES only
 *
 * API Docs: https://supplier.getyourguide.com/api-docs
 *           (Requires GYG Supplier Partner approval)
 *
 * Environment Variables Required:
 *   GETYOURGUIDE_API_KEY      — GYG supplier API key
 *   GETYOURGUIDE_SUPPLIER_ID  — GYG supplier/operator ID
 *   GETYOURGUIDE_API_URL      — Base URL (default: https://api.getyourguide.com/1)
 *
 * Auth:    Authorization: Bearer {GETYOURGUIDE_API_KEY}
 *          X-GYG-Supplier-ID: {GETYOURGUIDE_SUPPLIER_ID}
 *
 * Key Endpoints (Phase D implementation targets):
 *   POST   /activities                        — Create a new activity
 *   PUT    /activities/{activity_id}          — Update activity details
 *   POST   /activities/{activity_id}/options  — Add pricing options/tiers
 *   PUT    /activities/{activity_id}/availability — Set availability schedule
 *   DELETE /activities/{activity_id}          — Deactivate activity
 *   GET    /activities/{activity_id}          — Get activity status
 *
 * Phase A.5: Fully typed scaffold with mode guard and error handling.
 * Phase D:   Replace stub bodies with real GetYourGuide Supplier API calls.
 */

import {
  BaseChannelAdapter,
  ChannelListingPayload,
  ChannelListingResult,
  ChannelSyncStatus,
} from '../adapter.interface';
import { logger } from '../../../utils/logger';

const GYG_BASE_URL = process.env.GETYOURGUIDE_API_URL ?? 'https://api.getyourguide.com/1';

export interface GetYourGuideActivityPayload {
  /** Owambe experience ID */
  experienceId: string;
  /** Activity title */
  title: string;
  /** Activity description */
  description: string;
  /** Experience type/category */
  category: string;
  /** City */
  city: string;
  /** Country code (ISO 3166-1 alpha-2) */
  countryCode: string;
  /** Latitude of meeting point */
  latitude: number;
  /** Longitude of meeting point */
  longitude: number;
  /** Duration in minutes */
  durationMinutes: number;
  /** Maximum group size */
  maxGroupSize: number;
  /** Price per person in NGN */
  pricePerPersonNgn: number;
  /** Languages offered */
  languages?: string[];
  /** Cover image URL */
  coverImageUrl?: string;
  /** Included items */
  includes?: string[];
  /** Excluded items */
  excludes?: string[];
  /** Meeting point description */
  meetingPoint?: string;
}

export class GetYourGuideAdapter extends BaseChannelAdapter {
  readonly channelName = 'GETYOURGUIDE' as const;

  isConfigured(): boolean {
    return !!(process.env.GETYOURGUIDE_API_KEY && process.env.GETYOURGUIDE_SUPPLIER_ID);
  }

  /**
   * Create a new activity listing on GetYourGuide.
   * Payload mode MUST be 'EXPERIENCES'.
   *
   * Phase D implementation:
   *   const resp = await axios.post(`${GYG_BASE_URL}/activities`, {
   *     supplier_id: process.env.GETYOURGUIDE_SUPPLIER_ID,
   *     title: payload.data.title,
   *     description: payload.data.description,
   *     category: mapExperienceType(payload.data.category),
   *     location: {
   *       city: payload.data.city,
   *       country_code: payload.data.countryCode,
   *       coordinates: { lat: payload.data.latitude, lng: payload.data.longitude },
   *     },
   *     duration: { minutes: payload.data.durationMinutes },
   *     pricing: { per_person: payload.data.pricePerPersonNgn, currency: 'NGN' },
   *     max_group_size: payload.data.maxGroupSize,
   *   }, {
   *     headers: {
   *       Authorization: `Bearer ${process.env.GETYOURGUIDE_API_KEY}`,
   *       'X-GYG-Supplier-ID': process.env.GETYOURGUIDE_SUPPLIER_ID,
   *     }
   *   });
   *   return { success: true, externalId: String(resp.data.activity_id), externalUrl: resp.data.url };
   */
  async createListing(payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    if (payload.mode !== 'EXPERIENCES') {
      return { success: false, error: 'GetYourGuide adapter only supports EXPERIENCES mode' };
    }
    logger.info(`[GetYourGuide] createListing scaffold for experience ${payload.entityId}`, {
      baseUrl: GYG_BASE_URL,
      endpoint: '/activities',
      method: 'POST',
    });
    // TODO Phase D: implement GetYourGuide Supplier API call
    return {
      success: true,
      externalId: `gyg-scaffold-${payload.entityId}`,
      externalUrl: `https://www.getyourguide.com/activity/scaffold-${payload.entityId}`,
      rawResponse: { scaffold: true, entityId: payload.entityId },
    };
  }

  /**
   * Update an existing activity on GetYourGuide.
   *
   * Phase D implementation:
   *   await axios.put(`${GYG_BASE_URL}/activities/${externalId}`, { ...updateFields },
   *     { headers: { Authorization: `Bearer ${process.env.GETYOURGUIDE_API_KEY}`, 'X-GYG-Supplier-ID': ... } });
   */
  async updateListing(externalId: string, payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    if (payload.mode !== 'EXPERIENCES') {
      return { success: false, error: 'GetYourGuide adapter only supports EXPERIENCES mode' };
    }
    logger.info(`[GetYourGuide] updateListing scaffold for ${externalId}`, {
      endpoint: `/activities/${externalId}`,
      method: 'PUT',
    });
    // TODO Phase D: implement update
    return { success: true, externalId };
  }

  /**
   * Deactivate an activity on GetYourGuide.
   *
   * Phase D implementation:
   *   await axios.delete(`${GYG_BASE_URL}/activities/${externalId}`,
   *     { headers: { Authorization: `Bearer ${process.env.GETYOURGUIDE_API_KEY}`, 'X-GYG-Supplier-ID': ... } });
   */
  async deleteListing(externalId: string): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    logger.info(`[GetYourGuide] deleteListing scaffold for ${externalId}`, {
      endpoint: `/activities/${externalId}`,
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
