/** Shared value objects used across all bounded contexts. */

/** Opaque identifier. Enterprise systems own the canonical IDs; we never parse them. */
export type ID = string;

/** ISO-8601 timestamp with offset, e.g. `2027-06-12T16:00:00+02:00`. */
export type ISODateTime = string;

/** ISO-8601 calendar date, e.g. `2027-06-12`. */
export type ISODate = string;

/** IANA time-zone, e.g. `Europe/Monaco`. Ship time can differ from local port time. */
export type TimeZone = string;

export interface Money {
  /** Minor units (cents) to avoid floating point drift. */
  amountMinor: number;
  currency: 'EUR' | 'USD' | 'GBP' | 'CHF';
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Imagery reference. `uri` is resolved by the brand DAM / CDN in production.
 * `tone` gives the UI a graceful, on-brand gradient while imagery loads or
 * when no asset is available.
 */
export interface MediaAsset {
  uri?: string;
  alt: string;
  tone: readonly [string, string];
}

/** Every integration-sourced record carries provenance for traceability. */
export interface SourceRef {
  system:
    | 'mock'
    | 'marriott-bonvoy'
    | 'reservations-pms'
    | 'shipboard-pms'
    | 'crm'
    | 'shore-ops'
    | 'concierge-platform'
    | 'supabase';
  externalId?: string;
  syncedAt?: ISODateTime;
}

export type RequestStatus =
  | 'received'
  | 'in_progress'
  | 'awaiting_guest'
  | 'confirmed'
  | 'completed'
  | 'declined'
  | 'cancelled';
