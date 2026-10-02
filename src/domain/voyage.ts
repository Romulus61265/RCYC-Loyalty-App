import type { GeoPoint, ID, ISODate, ISODateTime, MediaAsset, SourceRef, TimeZone } from './common';

export interface Yacht {
  id: ID;
  name: string;
  /** e.g. "Evrima", modelled as a fictional sister yacht. */
  tagline: string;
  guestCapacity: number;
  suites: number;
  crew: number;
  lengthMeters: number;
  highlights: string[];
  hero: MediaAsset;
}

export type SuiteCategory = 'terrace' | 'view' | 'loft' | 'signature' | 'owners';

export interface Suite {
  id: ID;
  number: string;
  name: string;
  category: SuiteCategory;
  deck: number;
  areaSqm: number;
  terraceSqm?: number;
  features: string[];
  hero: MediaAsset;
}

export type PortCallType = 'embark' | 'port' | 'sea' | 'tender' | 'overnight' | 'disembark';

export interface PortCall {
  id: ID;
  day: number;
  date: ISODate;
  type: PortCallType;
  portName: string;
  country: string;
  timeZone: TimeZone;
  arrival?: ISODateTime;
  departure?: ISODateTime;
  /** Guests must be aboard by — the critical operational time. */
  allAboard?: ISODateTime;
  location?: GeoPoint;
  summary: string;
  hero: MediaAsset;
}

export interface Voyage {
  id: ID;
  code: string;
  name: string;
  yachtId: ID;
  startDate: ISODate;
  endDate: ISODate;
  nights: number;
  region: string;
  itinerary: PortCall[];
  hero: MediaAsset;
  source: SourceRef;
}

export type ReservationStatus = 'confirmed' | 'pending-documents' | 'checked-in' | 'onboard' | 'completed' | 'cancelled';

/** The booking binding a guest party to a voyage and suite. */
export interface VoyageReservation {
  id: ID;
  bookingReference: string;
  voyageId: ID;
  suiteId: ID;
  leadGuestId: ID;
  partyGuestIds: ID[];
  status: ReservationStatus;
  /** Name of the assigned Suite Ambassador (butler/concierge equivalent). */
  suiteAmbassador?: string;
  source: SourceRef;
}

export interface Embarkation {
  reservationId: ID;
  terminalName: string;
  address: string;
  location?: GeoPoint;
  /** Personal arrival window — staggered for a quiet, unhurried welcome. */
  arrivalWindowStart: ISODateTime;
  arrivalWindowEnd: ISODateTime;
  suiteReadyAt: ISODateTime;
  allAboard: ISODateTime;
  departure: ISODateTime;
  checkInStatus: 'not-started' | 'in-progress' | 'complete';
  notes: string[];
}

export type DocumentType = 'passport' | 'visa' | 'health-declaration' | 'guest-contract' | 'emergency-contact' | 'payment-folio';

export interface TravelDocument {
  id: ID;
  guestId: ID;
  type: DocumentType;
  label: string;
  status: 'required' | 'submitted' | 'verified' | 'expired' | 'not-required';
  /** Never the document number itself — only what the guest needs to know. */
  detail?: string;
  dueBy?: ISODate;
}

/** Composite read model for the Voyage tab. */
export interface VoyageOverview {
  reservation: VoyageReservation;
  voyage: Voyage;
  yacht: Yacht;
  suite: Suite;
  embarkation: Embarkation;
  documents: TravelDocument[];
}

/** Where the guest is in the end-to-end journey; drives contextual UI. */
export type JourneyPhase =
  | 'dream'
  | 'book'
  | 'prepare'
  | 'travel-to-embarkation'
  | 'embark'
  | 'sail'
  | 'explore'
  | 'return-home'
  | 'remember'
  | 'rebook';
