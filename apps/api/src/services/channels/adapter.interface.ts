// ─── adapter.interface.ts ────────────────────────────
// Channel adapter interface for the distribution engine.
// All channel adapters (Eventbrite, Facebook, Google Events, etc.)
// must implement this interface.

export type ChannelName =
  | 'COASTAL_CORRIDOR'
  | 'HOTELS_NG'
  | 'GOOGLE_EVENTS'
  | 'EVENTBRITE'
  | 'FACEBOOK_EVENTS'
  | 'WIDGET_EMBED'
  | 'MANUAL'
  | 'AIRBNB'
  | 'BOOKING_COM'
  | 'VIATOR'
  | 'GETYOURGUIDE';

export interface ChannelListingPayload {
  /** Internal Owambe entity ID (event, property, or experience) */
  entityId: string;
  /** The mode this entity belongs to */
  mode: 'EVENTS' | 'STAYS' | 'EXPERIENCES';
  /** Channel-specific listing data */
  data: Record<string, any>;
}

export interface ChannelListingResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** The external listing ID on the channel (if created/updated) */
  externalId?: string;
  /** The external URL of the listing on the channel */
  externalUrl?: string;
  /** Error message if the operation failed */
  error?: string;
  /** Raw response from the channel API */
  rawResponse?: any;
}

export interface ChannelSyncStatus {
  channel: ChannelName;
  entityId: string;
  externalId?: string;
  externalUrl?: string;
  lastSyncedAt?: Date;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  error?: string;
}

/**
 * Base interface that all channel adapters must implement.
 */
export interface IChannelAdapter {
  /** The name of this channel */
  readonly channelName: ChannelName;

  /** Whether this adapter is currently configured and ready to use */
  isConfigured(): boolean;

  /**
   * Create a new listing on the channel.
   * @param payload - The entity data to list
   */
  createListing(payload: ChannelListingPayload): Promise<ChannelListingResult>;

  /**
   * Update an existing listing on the channel.
   * @param externalId - The external ID of the listing to update
   * @param payload - The updated entity data
   */
  updateListing(externalId: string, payload: ChannelListingPayload): Promise<ChannelListingResult>;

  /**
   * Delete/unpublish a listing on the channel.
   * @param externalId - The external ID of the listing to delete
   */
  deleteListing(externalId: string): Promise<ChannelListingResult>;

  /**
   * Check the current sync status of a listing on the channel.
   * @param externalId - The external ID of the listing to check
   */
  getStatus(externalId: string): Promise<ChannelSyncStatus>;
}

/**
 * Abstract base class with common utilities for channel adapters.
 * Concrete adapters should extend this class.
 */
export abstract class BaseChannelAdapter implements IChannelAdapter {
  abstract readonly channelName: ChannelName;

  abstract isConfigured(): boolean;
  abstract createListing(payload: ChannelListingPayload): Promise<ChannelListingResult>;
  abstract updateListing(externalId: string, payload: ChannelListingPayload): Promise<ChannelListingResult>;
  abstract deleteListing(externalId: string): Promise<ChannelListingResult>;
  abstract getStatus(externalId: string): Promise<ChannelSyncStatus>;

  protected notConfiguredResult(): ChannelListingResult {
    return {
      success: false,
      error: `${this.channelName} adapter is not configured. Set the required environment variables.`,
    };
  }

  protected errorResult(error: unknown): ChannelListingResult {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
