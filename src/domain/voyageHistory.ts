import type { ID, ISODate, MediaAsset } from './common';

/**
 * Something the guest did on a past voyage: ashore, at the spa, or at the
 * table. Moments with a `weight` are what we learned from; they feed the
 * personalization engine as history.
 */
export interface PastVoyageMoment {
  id: string;
  kind: 'excursion' | 'spa' | 'dining';
  title: string;
  /** "Hvar", "Aboard Evrima". */
  place?: string;
  date: ISODate;
  /** Phrased as a memory: "taking the helm of a classic yacht off Hvar". */
  memory?: string;
  category?: string;
  /** The guest's own rating, 1–5, where they gave one. */
  rating?: number;
  /** How strongly it says something about them (0–1). */
  weight?: number;
  tags: string[];
  /** Shown to the guest: what they told us about it. */
  note?: string;
}

/** Something learned on a voyage and kept, matched against today's preferences. */
export interface SavedPreference {
  id: string;
  label: string;
  /** Where it lives in GuestPreferences and what it says, so we can tell whether it still stands. */
  key?: 'dining.tablePreference' | 'excursions.style' | 'spa.pressure' | 'suite.pillow' | 'beverage.wine';
  value?: string;
}

/** The guest's record of a past voyage (from the reservation and shipboard systems). */
export interface PastVoyageRecord {
  guestId: ID;
  voyageId: ID;
  yachtName: string;
  suite: string;
  destinations: { name: string; country: string }[];
  moments: PastVoyageMoment[];
  savedPreferences: SavedPreference[];
  /** Photographs: none yet; the shape is reserved. */
  photos: { id: string; caption?: string; url?: string }[];
}

/** One past voyage, as the guest sees it. */
export interface VoyageHistoryEntry {
  voyageId: ID;
  name: string;
  region: string;
  yachtName: string;
  /** "2 – 9 December 2023". */
  dates: string;
  startDate: ISODate;
  nights: number;
  suite: string;
  destinations: { name: string; country: string }[];
  experiences: PastVoyageMoment[];
  dining: PastVoyageMoment[];
  savedPreferences: (SavedPreference & { status: 'kept' | 'noted' })[];
  /** Short memories, from the moments. */
  memories: string[];
  photos: { count: number; placeholder: string };
  hero: MediaAsset;
}
