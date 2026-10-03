import type { ID, ISODate, MediaAsset, SourceRef } from './common';
import type { NotificationPreferences } from './notifications';

/** Guest identity — the golden record is mastered by enterprise CRM. */
export interface Guest {
  id: ID;
  /** Preferred form of address, e.g. "Mrs. Laurent". */
  salutation: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  /** Masked by default; full values only fetched for explicit, audited flows. */
  emailMasked: string;
  phoneMasked?: string;
  dateOfBirth?: ISODate;
  nationality?: string;
  homeCity?: string;
  /** IATA code of the guest's usual departure airport, e.g. "MIA". */
  homeAirport?: string;
  portrait?: MediaAsset;
  /** Relationship tenure with the Yacht Collection (not loyalty programme). */
  guestSince: ISODate;
  source: SourceRef;
}

export type CompanionRelationship = 'spouse' | 'partner' | 'child' | 'parent' | 'friend' | 'colleague' | 'other';

export interface TravelCompanion {
  id: ID;
  guestId?: ID;
  firstName: string;
  lastName: string;
  relationship: CompanionRelationship;
  isMinor: boolean;
  notes?: string;
}

export type OccasionType = 'anniversary' | 'birthday' | 'honeymoon' | 'milestone' | 'celebration';

export interface SpecialOccasion {
  id: ID;
  type: OccasionType;
  /** Display label, e.g. "25th wedding anniversary". */
  label: string;
  date: ISODate;
  /** Which travel party member(s) the occasion relates to. */
  personIds: ID[];
  /** Whether crew may acknowledge it openly, or only with discretion. */
  recognition: 'celebrate' | 'discreet' | 'private';
}

export interface DiningPreferences {
  cuisines: string[];
  /** Preferred dinner time, "HH:MM". */
  preferredTime?: string;
  tablePreference?: 'window' | 'terrace' | 'quiet-corner' | 'chefs-table' | 'no-preference';
  preferredSeating?: string;
  notes?: string;
}

export interface DietaryProfile {
  restrictions: string[];
  allergies: { allergen: string; severity: 'intolerance' | 'allergy' | 'anaphylactic' }[];
}

export interface BeveragePreferences {
  wine: string[];
  spirits: string[];
  nonAlcoholic: string[];
  welcomeAmenity?: string;
}

export interface SuitePreferences {
  pillow?: string;
  bedConfiguration?: 'king' | 'twin';
  temperatureCelsius?: number;
  turndown?: string;
  minibar?: string[];
  newspapers?: string[];
}

export interface ExcursionPreferences {
  style: 'private' | 'small-group' | 'any';
  pace: 'leisurely' | 'moderate' | 'active';
  /** Maximum comfortable duration ashore, in minutes. */
  maxDurationMinutes?: number;
  notes?: string;
}

export interface SpaPreferences {
  favouriteTreatments: string[];
  pressure?: 'light' | 'medium' | 'firm';
  preferredTime?: 'morning' | 'afternoon' | 'evening';
  notes?: string;
}

export interface TransportationPreferences {
  /** How the guest likes to be met at airports and ports. */
  arrivals: 'private-car' | 'private-van' | 'self-arranged';
  cabin?: 'first' | 'business' | 'premium-economy' | 'economy';
  helicopterWelcome: boolean;
  notes?: string;
}

/**
 * Accessibility needs. Health-adjacent special-category data: shared with
 * crew only when the guest allows it.
 */
export interface AccessibilityPreferences {
  mobility: 'none' | 'short-walks' | 'wheelchair-distances' | 'wheelchair';
  tenderAssistance: boolean;
  hearingSupport: boolean;
  visualSupport: boolean;
  notes?: string;
  shareWithCrew: boolean;
}

/** What the guest allows us to do with their data. */
export interface PrivacySettings {
  personalisedRecommendations: boolean;
  /** Let crew prepare quiet gestures for occasions. */
  shareOccasionsWithCrew: boolean;
  /** Share dietary needs with restaurants ashore that we book for you. */
  shareDietaryWithPartners: boolean;
  /** Anonymous usage analytics to improve the app. */
  analytics: boolean;
}

export interface CommunicationPreferences {
  channels: { push: boolean; email: boolean; sms: boolean; whatsapp: boolean };
  /** Quiet hours in ship local time — no non-urgent notifications. */
  quietHours?: { start: string; end: string };
  language: string;
  marketingConsent: boolean;
  /** Which notification types reach the guest, and how (defaults by language when absent). */
  notifications?: NotificationPreferences;
}

export interface GuestPreferences {
  guestId: ID;
  preferredDestinations: string[];
  dining: DiningPreferences;
  dietary: DietaryProfile;
  beverage: BeveragePreferences;
  suite: SuitePreferences;
  activityInterests: string[];
  excursions: ExcursionPreferences;
  spa: SpaPreferences;
  transportation: TransportationPreferences;
  accessibility: AccessibilityPreferences;
  communication: CommunicationPreferences;
  privacy: PrivacySettings;
}

/** Preferences as stored, with an optimistic-concurrency version. */
export interface VersionedPreferences {
  preferences: GuestPreferences;
  /** 0 = never saved (seeded from the guest record); increments on each save. */
  version: number;
  updatedAt: string | null;
  source: 'seed' | 'device' | 'supabase';
}

/** A partial update: any top-level group, replaced as a whole. */
export type PreferencesPatch = Partial<Omit<GuestPreferences, 'guestId'>>;

/** Aggregate used by Profile and by guest-context hydration. */
export interface GuestProfile {
  guest: Guest;
  preferences: GuestPreferences;
  companions: TravelCompanion[];
  occasions: SpecialOccasion[];
}
