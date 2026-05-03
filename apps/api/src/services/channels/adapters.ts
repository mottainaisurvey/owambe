// ─── adapters.ts ─────────────────────────────────────
// Concrete channel adapter implementations.
// Stubs are fully wired — they validate configuration and return
// structured results. Replace stub bodies with real API calls in Phase C/D.

import {
  BaseChannelAdapter,
  ChannelListingPayload,
  ChannelListingResult,
  ChannelSyncStatus,
} from './adapter.interface';
import { logger } from '../../utils/logger';

// ─── Google Events Adapter ────────────────────────────
export class GoogleEventsAdapter extends BaseChannelAdapter {
  readonly channelName = 'GOOGLE_EVENTS' as const;

  isConfigured(): boolean {
    return !!(process.env.GOOGLE_EVENTS_API_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }

  async createListing(payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    // TODO Phase C: implement Google Events API call
    logger.info(`[GoogleEvents] createListing stub called for entity ${payload.entityId}`);
    return {
      success: true,
      externalId: `google-stub-${payload.entityId}`,
      externalUrl: `https://g.co/events/stub-${payload.entityId}`,
    };
  }

  async updateListing(externalId: string, payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    logger.info(`[GoogleEvents] updateListing stub called for ${externalId}`);
    return { success: true, externalId };
  }

  async deleteListing(externalId: string): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    logger.info(`[GoogleEvents] deleteListing stub called for ${externalId}`);
    return { success: true, externalId };
  }

  async getStatus(externalId: string): Promise<ChannelSyncStatus> {
    return { channel: this.channelName, entityId: externalId, externalId, status: 'SYNCED' };
  }
}

// ─── Eventbrite Adapter ───────────────────────────────
export class EventbriteAdapter extends BaseChannelAdapter {
  readonly channelName = 'EVENTBRITE' as const;

  isConfigured(): boolean {
    return !!(process.env.EVENTBRITE_API_KEY);
  }

  async createListing(payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    // TODO Phase C: implement Eventbrite API call
    // POST https://www.eventbriteapi.com/v3/organizations/{org_id}/events/
    logger.info(`[Eventbrite] createListing stub called for entity ${payload.entityId}`);
    return {
      success: true,
      externalId: `eb-stub-${payload.entityId}`,
      externalUrl: `https://www.eventbrite.com/e/stub-${payload.entityId}`,
    };
  }

  async updateListing(externalId: string, payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    logger.info(`[Eventbrite] updateListing stub called for ${externalId}`);
    return { success: true, externalId };
  }

  async deleteListing(externalId: string): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    logger.info(`[Eventbrite] deleteListing stub called for ${externalId}`);
    return { success: true, externalId };
  }

  async getStatus(externalId: string): Promise<ChannelSyncStatus> {
    return { channel: this.channelName, entityId: externalId, externalId, status: 'SYNCED' };
  }
}

// ─── Facebook Events Adapter ──────────────────────────
export class FacebookEventsAdapter extends BaseChannelAdapter {
  readonly channelName = 'FACEBOOK_EVENTS' as const;

  isConfigured(): boolean {
    return !!(process.env.FACEBOOK_PAGE_TOKEN && process.env.FACEBOOK_PAGE_ID);
  }

  async createListing(payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    // TODO Phase C: implement Facebook Graph API call
    // POST https://graph.facebook.com/{page_id}/events
    logger.info(`[Facebook] createListing stub called for entity ${payload.entityId}`);
    return {
      success: true,
      externalId: `fb-stub-${payload.entityId}`,
      externalUrl: `https://www.facebook.com/events/stub-${payload.entityId}`,
    };
  }

  async updateListing(externalId: string, payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    logger.info(`[Facebook] updateListing stub called for ${externalId}`);
    return { success: true, externalId };
  }

  async deleteListing(externalId: string): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    logger.info(`[Facebook] deleteListing stub called for ${externalId}`);
    return { success: true, externalId };
  }

  async getStatus(externalId: string): Promise<ChannelSyncStatus> {
    return { channel: this.channelName, entityId: externalId, externalId, status: 'SYNCED' };
  }
}

// ─── Widget Embed Adapter ─────────────────────────────
export class WidgetEmbedAdapter extends BaseChannelAdapter {
  readonly channelName = 'WIDGET_EMBED' as const;

  isConfigured(): boolean {
    return !!(process.env.NEXT_PUBLIC_WIDGET_URL || process.env.WIDGET_URL);
  }

  async createListing(payload: ChannelListingPayload): Promise<ChannelListingResult> {
    const widgetBase = process.env.NEXT_PUBLIC_WIDGET_URL || process.env.WIDGET_URL || 'https://owambe-widget.vercel.app';
    const mode = payload.mode.toLowerCase();
    const externalUrl = `${widgetBase}/${mode === 'events' ? 'widget' : mode}/${payload.entityId}`;
    return { success: true, externalId: payload.entityId, externalUrl };
  }

  async updateListing(externalId: string, _payload: ChannelListingPayload): Promise<ChannelListingResult> {
    // Widget URLs are derived from entity IDs — no update needed
    return { success: true, externalId };
  }

  async deleteListing(externalId: string): Promise<ChannelListingResult> {
    // Widget deactivation is handled by deactivating the entity itself
    return { success: true, externalId };
  }

  async getStatus(externalId: string): Promise<ChannelSyncStatus> {
    return { channel: this.channelName, entityId: externalId, externalId, status: 'SYNCED' };
  }
}

// ─── Airbnb Adapter (Stays) ───────────────────────────
export class AirbnbAdapter extends BaseChannelAdapter {
  readonly channelName = 'AIRBNB' as const;

  isConfigured(): boolean {
    return !!(process.env.AIRBNB_API_KEY && process.env.AIRBNB_USER_ID);
  }

  async createListing(payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    // TODO Phase D: implement Airbnb Host API call
    logger.info(`[Airbnb] createListing stub called for entity ${payload.entityId}`);
    return {
      success: true,
      externalId: `airbnb-stub-${payload.entityId}`,
      externalUrl: `https://www.airbnb.com/rooms/stub-${payload.entityId}`,
    };
  }

  async updateListing(externalId: string, _payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return { success: true, externalId };
  }

  async deleteListing(externalId: string): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return { success: true, externalId };
  }

  async getStatus(externalId: string): Promise<ChannelSyncStatus> {
    return { channel: this.channelName, entityId: externalId, externalId, status: 'PENDING' };
  }
}

// ─── Viator Adapter (Experiences) ────────────────────
export class ViatorAdapter extends BaseChannelAdapter {
  readonly channelName = 'VIATOR' as const;

  isConfigured(): boolean {
    return !!(process.env.VIATOR_API_KEY);
  }

  async createListing(payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    // TODO Phase D: implement Viator Supplier API call
    logger.info(`[Viator] createListing stub called for entity ${payload.entityId}`);
    return {
      success: true,
      externalId: `viator-stub-${payload.entityId}`,
      externalUrl: `https://www.viator.com/tours/stub-${payload.entityId}`,
    };
  }

  async updateListing(externalId: string, _payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return { success: true, externalId };
  }

  async deleteListing(externalId: string): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return { success: true, externalId };
  }

  async getStatus(externalId: string): Promise<ChannelSyncStatus> {
    return { channel: this.channelName, entityId: externalId, externalId, status: 'PENDING' };
  }
}

// ─── Coastal Corridor Adapter (ACTIVE — Priority Channel) ────────────────────
// The Coastal Corridor is the first live distribution channel for Stays and
// Experiences modes. Phase A: stub with correct interface. Phase C: live API.
export class CoastalCorridorAdapter extends BaseChannelAdapter {
  readonly channelName = 'COASTAL_CORRIDOR' as const;

  isConfigured(): boolean {
    return !!(process.env.COASTAL_CORRIDOR_API_KEY && process.env.COASTAL_CORRIDOR_API_URL);
  }

  async createListing(payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    // TODO Phase C: POST to Coastal Corridor partner API
    // Endpoint: process.env.COASTAL_CORRIDOR_API_URL + '/listings'
    // Auth: Bearer process.env.COASTAL_CORRIDOR_API_KEY
    logger.info(`[CoastalCorridor] createListing stub for entity ${payload.entityId} (mode: ${payload.mode})`);
    return { success: true, externalId: `cc-stub-${payload.entityId}` };
  }

  async updateListing(externalId: string, _payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    logger.info(`[CoastalCorridor] updateListing stub for ${externalId}`);
    return { success: true, externalId };
  }

  async deleteListing(externalId: string): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    logger.info(`[CoastalCorridor] deleteListing stub for ${externalId}`);
    return { success: true, externalId };
  }

  async getStatus(externalId: string): Promise<ChannelSyncStatus> {
    return { channel: this.channelName, entityId: externalId, externalId, status: 'PENDING' };
  }
}

// ─── Hotels.ng Adapter (Stays) ────────────────────────
export class HotelsNgAdapter extends BaseChannelAdapter {
  readonly channelName = 'HOTELS_NG' as const;

  isConfigured(): boolean {
    return !!(process.env.HOTELS_NG_API_KEY);
  }

  async createListing(payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    // TODO Phase D: implement Hotels.ng supplier API call
    logger.info(`[HotelsNg] createListing stub for entity ${payload.entityId}`);
    return { success: true, externalId: `hotelsng-stub-${payload.entityId}` };
  }

  async updateListing(externalId: string, _payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return { success: true, externalId };
  }

  async deleteListing(externalId: string): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return { success: true, externalId };
  }

  async getStatus(externalId: string): Promise<ChannelSyncStatus> {
    return { channel: this.channelName, entityId: externalId, externalId, status: 'PENDING' };
  }
}

// ─── Booking.com Adapter (Stays) ──────────────────────
export class BookingComAdapter extends BaseChannelAdapter {
  readonly channelName = 'BOOKING_COM' as const;

  isConfigured(): boolean {
    return !!(process.env.BOOKING_COM_API_KEY && process.env.BOOKING_COM_PROPERTY_ID);
  }

  async createListing(payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    // TODO Phase D: implement Booking.com Connectivity API call
    logger.info(`[BookingCom] createListing stub for entity ${payload.entityId}`);
    return { success: true, externalId: `bdc-stub-${payload.entityId}` };
  }

  async updateListing(externalId: string, _payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return { success: true, externalId };
  }

  async deleteListing(externalId: string): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return { success: true, externalId };
  }

  async getStatus(externalId: string): Promise<ChannelSyncStatus> {
    return { channel: this.channelName, entityId: externalId, externalId, status: 'PENDING' };
  }
}

// ─── GetYourGuide Adapter (Experiences) ───────────────
export class GetYourGuideAdapter extends BaseChannelAdapter {
  readonly channelName = 'GETYOURGUIDE' as const;

  isConfigured(): boolean {
    return !!(process.env.GETYOURGUIDE_API_KEY);
  }

  async createListing(payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    // TODO Phase D: implement GetYourGuide Supplier API call
    logger.info(`[GetYourGuide] createListing stub for entity ${payload.entityId}`);
    return { success: true, externalId: `gyg-stub-${payload.entityId}` };
  }

  async updateListing(externalId: string, _payload: ChannelListingPayload): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return { success: true, externalId };
  }

  async deleteListing(externalId: string): Promise<ChannelListingResult> {
    if (!this.isConfigured()) return this.notConfiguredResult();
    return { success: true, externalId };
  }

  async getStatus(externalId: string): Promise<ChannelSyncStatus> {
    return { channel: this.channelName, entityId: externalId, externalId, status: 'PENDING' };
  }
}

// ─── Adapter Registry ─────────────────────────────────
import { IChannelAdapter, ChannelName } from './adapter.interface';

// Coastal Corridor is listed first as it is the priority active channel.
const adapterInstances: Record<ChannelName, IChannelAdapter> = {
  COASTAL_CORRIDOR: new CoastalCorridorAdapter(),
  HOTELS_NG:        new HotelsNgAdapter(),
  GOOGLE_EVENTS:    new GoogleEventsAdapter(),
  EVENTBRITE:       new EventbriteAdapter(),
  FACEBOOK_EVENTS:  new FacebookEventsAdapter(),
  WIDGET_EMBED:     new WidgetEmbedAdapter(),
  MANUAL:           new WidgetEmbedAdapter(), // Manual uses widget embed URL generation
  AIRBNB:           new AirbnbAdapter(),
  BOOKING_COM:      new BookingComAdapter(),
  VIATOR:           new ViatorAdapter(),
  GETYOURGUIDE:     new GetYourGuideAdapter(),
};

export function getAdapter(channel: ChannelName): IChannelAdapter {
  return adapterInstances[channel];
}

export function getAllAdapters(): IChannelAdapter[] {
  return Object.values(adapterInstances);
}

export function getConfiguredAdapters(): IChannelAdapter[] {
  return getAllAdapters().filter(a => a.isConfigured());
}
