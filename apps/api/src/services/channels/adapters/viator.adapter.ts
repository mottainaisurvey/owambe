/**
 * ─── Viator Supplier API Adapter ───────────────────────────────────────────
 *
 * Purpose: Distribute Owambe Experience activities to Viator (TripAdvisor
 *          subsidiary) via the Viator Supplier API.
 *
 * Mode:    EXPERIENCES only
 *
 * API Docs: https://docs.viator.com/partner-api/supplier/
 *           (Requires Viator Supplier Partner approval)
 *
 * Environment Variables Required:
 *   VIATOR_API_KEY        — Viator supplier API key
 *   VIATOR_SUPPLIER_ID    — Viator supplier/operator ID
 *   VIATOR_API_URL        — Base URL (default: https://api.viator.com/partner)
 *
 * Auth:    exp-api-key: {VIATOR_API_KEY} header
 *
 * Key Endpoints (Phase D implementation targets):
 *   POST   /products                          — Create a new product/tour
 *   PUT    /products/{product_code}           — Update product details
 *   POST   /products/{product_code}/photos    — Upload product photos
 *   PUT    /products/{product_code}/availability — Set availability schedule
 *   PUT    /products/{product_code}/pricing   — Set pricing tiers
 *   DELETE /products/{product_code}           — Deactivate product
 *   GET    /products/{product_code}           — Get product status
 *
 * Phase A.5: Fully typed scaffold with mode guard and error handling.
 * Phase D:   Replace stub bodies with real Viator Supplier API calls.
 */

import {
  BaseChannelAdapter,
  ChannelListingPayload,
  ChannelListingResult,
  ChannelSyncStatus,
} from '../adapter.interface';
import { logger } from '../../../utils/logger';

const VIATOR_BASE_URL = process.env.VIATOR_API_URL ?? 'https://api.viator.com/partner';

export interface ViatorProductPayload {
  /** Owambe experience ID */
  experienceId: string;
  /** Product/tour title */
  title: string;
  /** Product description */
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
  /** Inclusions */
  inclusions?: string[];
  /** Exclusions */
  exclusions?: string[];
  /** Meeting point description */
  meetingPoint?: string;
  /** Cancellation policy */
  cancellationPolicy?: 'STANDARD_24H' | 'STANDARD_48H' | 'NON_REFUNDABLE';
}

export class ViatorAdapter extends BaseChannelAdapter {
  readonly channelName = 'VIATOR' as const;

  isConfigured(): boolean {
    return !!(process.env.VIATOR_API_KEY && process.env.VIATOR_SUPPLIER_ID);
  }

  /**
   * Create a new product/tour listing on Viator.
   * Payload mode MUST be 'EXPERIENCES'.
   *
   * Phase D implementation:
   *   const resp = await axios.post(`${VIATOR_BASE_URL}/products`, {
   *     supplierId: process.env.VIATOR_SUPPLIER_ID,
   *     title: payload.data.title,
   *     description: payload.data.description,
   *     productType: mapExperienceType(payload.data.category),
   *     location: {
   *       city: payload.data.city,
   *       countryCode: payload.data.countryCode,
   *       coordinates: { lat: payload.data.latitude, lng: payload.data.longitude },
   *     },
   *     duration: { fixedDurationInMinutes: payload.data.durationMinutes },
   *     pricing: { currency: 'NGN', netRate: payload.data.pricePerPersonNgn },
   *     groupSize: { maxGroupSize: payload.data.maxGroupSize },
   *     cancellationPolicy: payload.data.cancellationPolicy ?? 'STANDARD_24H',
   *   }, {
   *     headers: { 'exp-api-key': process.env.VIATOR_API_KEY }
   *   });
   *   return { success: true, externalId: resp.data.productCode, externalUrl: resp.data.productUrl };
   */
  async createListing(payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    if (payload.mode !== 'EXPERIENCES') {
      return { success: false, error: 'Viator adapter only supports EXPERIENCES mode' };
    }
    logger.info(`[Viator] createListing scaffold for experience ${payload.entityId}`, {
      baseUrl: VIATOR_BASE_URL,
      endpoint: '/products',
      method: 'POST',
    });
    // TODO Phase D: implement Viator Supplier API call
    return {
      success: true,
      externalId: `viator-scaffold-${payload.entityId}`,
      externalUrl: `https://www.viator.com/tours/scaffold-${payload.entityId}`,
      rawResponse: { scaffold: true, entityId: payload.entityId },
    };
  }

  /**
   * Update an existing product on Viator.
   *
   * Phase D implementation:
   *   await axios.put(`${VIATOR_BASE_URL}/products/${externalId}`, { ...updateFields },
   *     { headers: { 'exp-api-key': process.env.VIATOR_API_KEY } });
   */
  async updateListing(externalId: string, payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    if (payload.mode !== 'EXPERIENCES') {
      return { success: false, error: 'Viator adapter only supports EXPERIENCES mode' };
    }
    logger.info(`[Viator] updateListing scaffold for ${externalId}`, {
      endpoint: `/products/${externalId}`,
      method: 'PUT',
    });
    // TODO Phase D: implement update
    return { success: true, externalId };
  }

  /**
   * Deactivate a product on Viator.
   *
   * Phase D implementation:
   *   await axios.delete(`${VIATOR_BASE_URL}/products/${externalId}`,
   *     { headers: { 'exp-api-key': process.env.VIATOR_API_KEY } });
   */
  async deleteListing(externalId: string): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    logger.info(`[Viator] deleteListing scaffold for ${externalId}`, {
      endpoint: `/products/${externalId}`,
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
