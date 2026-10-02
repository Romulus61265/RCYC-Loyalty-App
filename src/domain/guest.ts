import type { ID, ISODate, MediaAsset, SourceRef } from './common';

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
  tablePreference?: 'terrace' | 'quiet-corner' | 'chefs-table' | 'no-preference';
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

export interface CommunicationPreferences {
  channels: { push: boolean; email: boolean; sms: boolean; whatsapp: boolean };
  /** Quiet hours in ship local time — no non-urgent notifications. */
  quietHours?: { start: string; end: string };
  language: string;
  marketingConsent: boolean;
}

export interface GuestPreferences {
  guestId: ID;
  preferredDestinations: string[];
  dining: DiningPreferences;
  dietary: DietaryProfile;
  beverage: BeveragePreferences;
  suite: SuitePreferences;
  activityInterests: string[];
  communication: CommunicationPreferences;
}

/** Aggregate used by Profile and by guest-context hydration. */
export interface GuestProfile {
  guest: Guest;
  preferences: GuestPreferences;
  companions: TravelCompanion[];
  occasions: SpecialOccasion[];
}
