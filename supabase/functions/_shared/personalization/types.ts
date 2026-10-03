// Personalization engine: contracts.
//
// Self-contained (no imports), so the same engine runs in the app's mock mode
// (Metro/Node) and in the personalization-next-best Edge Function (Deno). The
// shapes are structural subsets of the app's domain types.
//
//   inputs (11 kinds) ──▶ candidates ──▶ rules ──▶ score ──▶ policy ──▶ PersonalizedRecommendation[]
//
// relevanceScore and sourceSignals are for ranking, audit and crew tools.
// They are never rendered to the guest.

export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string; // local, with offset

// ─── Inputs ────────────────────────────────────────────────────────────────

export type BonvoyTier = 'member' | 'silver' | 'gold' | 'platinum' | 'titanium' | 'ambassador';
export type ValueSegment = 'emerging' | 'established' | 'distinguished' | 'founding';

export interface PreviousVoyage {
  id: string;
  name: string;
  region: string;
  startDate: ISODate;
}

/** Something observed on a previous voyage: dining, spa or ashore. */
export interface HistoryItem {
  id: string;
  kind: 'dining' | 'spa' | 'excursion';
  /** Phrased as a memory: "taking the helm of a classic yacht off Hvar". */
  memory?: string;
  category?: string;
  voyageId?: string;
  /** Guest rating 1–5 where captured. */
  rating?: number;
  /** Strength 0–1. */
  weight: number;
  tags: string[];
}

export interface ItineraryDay {
  id: string;
  day: number;
  date: ISODate;
  type: 'embark' | 'port' | 'tender' | 'overnight' | 'sea' | 'disembark' | string;
  portName: string;
  country: string;
}

export interface CatalogueItem {
  id: string;
  title: string;
  category: string;
  portCallId?: string;
  destination?: string;
  durationMinutes?: number;
  format: 'private' | 'small-group' | 'shared' | 'private-or-group' | string;
  privateAvailable: boolean;
  tags: string[];
}

export interface OpenSlot {
  experienceId: string;
  start: ISODateTime;
  end?: ISODateTime;
  remaining: number;
}

export interface CurrentBooking {
  id: string;
  experienceId: string;
  category: string;
  start: ISODateTime;
  end?: ISODateTime;
  status: string;
}

export interface Companion {
  firstName: string;
  relationship: string;
  isMinor: boolean;
  /** Interests as tags, e.g. ["gardens", "art"]. */
  interests: string[];
}

export interface Occasion {
  id: string;
  type: 'anniversary' | 'birthday' | 'honeymoon' | 'milestone' | 'celebration' | string;
  label: string;
  date: ISODate;
  /** 'private' occasions are never used. */
  recognition: 'celebrate' | 'discreet' | 'private';
}

export interface PersonalizationPreferences {
  dining: { cuisines: string[]; tablePreference?: string; preferredTime?: string };
  /** Wines the guest enjoys (beverage preferences). */
  wine: string[];
  spa: { favouriteTreatments: string[]; pressure?: string; preferredTime?: 'morning' | 'afternoon' | 'evening' };
  excursions: { style: 'private' | 'small-group' | 'any'; pace?: string; maxDurationMinutes?: number };
  /** Stated interests ("Wine", "Private cultural experiences"…). */
  activityInterests: string[];
  /** Destination interests ("French Riviera", "Balearic Islands"…). */
  preferredDestinations: string[];
  mobility: 'none' | 'short-walks' | 'wheelchair-distances' | 'wheelchair';
  /** The guest's privacy choice: false = no personalised recommendations. */
  personalisedRecommendations: boolean;
}

export interface PersonalizationInput {
  /** Bonvoy status (null when no membership is linked). */
  bonvoy: { tier: BonvoyTier } | null;
  previousVoyages: PreviousVoyage[];
  /** Dining, spa and excursion history from previous voyages. */
  history: HistoryItem[];
  /** Ports already visited on earlier voyages (lower-case names). */
  destinationsVisited: string[];
  voyage: { id: string; yachtName: string; startDate: ISODate; endDate: ISODate };
  itinerary: ItineraryDay[];
  catalogue: CatalogueItem[];
  slots: OpenSlot[];
  /** Experiences with no availability at all this voyage (not "by arrangement"). */
  soldOut?: string[];
  preferences: PersonalizationPreferences;
  companions: Companion[];
  occasions: Occasion[];
  bookings: CurrentBooking[];
  /** Internal; never in reasons and never shown or sent to the guest. */
  valueSegment?: ValueSegment;
}

export interface PersonalizeOptions {
  /** Results to return after policy (default 10). */
  limit?: number;
  /** Also return booked experiences (to explain every card); default false. */
  includeBooked?: boolean;
  /** Nothing earlier than this moment is recommended. */
  now?: ISODateTime;
  /** Diversity: at most this many per category before the rest (default 2). */
  maxPerCategory?: number;
}

// ─── Output ────────────────────────────────────────────────────────────────

export type SourceSignalKind =
  | 'bonvoy-status'
  | 'previous-voyages'
  | 'current-itinerary'
  | 'dining-preferences'
  | 'spa-preferences'
  | 'excursion-history'
  | 'destination-interests'
  | 'travel-companion'
  | 'special-occasion'
  | 'current-reservations'
  | 'value-segment';

export interface SourceSignal {
  kind: SourceSignalKind;
  /** What was used, for audit ("Titanium Elite", "Sea day, 17 May"). Internal signals carry no value. */
  detail: string;
  /** The record it came from, when there is one. */
  ref?: string;
  /** 'internal' signals are stripped before anything reaches the guest app. */
  visibility: 'guest' | 'internal';
}

export type ServiceRequestType = 'dining-change' | 'transport' | 'occasion' | 'suite' | 'excursion' | 'medical' | 'general';

/** Same shapes as the app's ConciergeAction, so a card can carry it out. */
export type RecommendationAction =
  | { kind: 'request-experience'; label: string; experienceId: string; start: ISODateTime; partySize: number }
  | { kind: 'service-request'; label: string; type: ServiceRequestType; summary: string; details?: string }
  | { kind: 'open'; label: string; route: string };

export interface PersonalizedRecommendation {
  id: string;
  /** What we suggest, e.g. "Dinner on a Private Terrace". */
  recommendation: string;
  experienceId: string;
  category: string;
  /** Guest-facing, one sentence. Never mentions scores, status tiers or segments. */
  reason: string;
  /** 0–1. Internal: ranking and thresholds only, never displayed. */
  relevanceScore: number;
  voyageDate: ISODate;
  dayNumber?: number;
  /** Port name, or "Aboard <yacht>". */
  destination: string;
  action: RecommendationAction;
  sourceSignals: SourceSignal[];
  /** Rules that fired, for audit and tuning. */
  rules: string[];
  booked: boolean;
}
