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
  suiteAmbassadorContact?: AmbassadorContact;
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
  luggage?: LuggageArrangement;
  notes: string[];
}

/** How the guest reaches their Suite Ambassador. Never a personal phone number. */
export interface AmbassadorContact {
  name: string;
  title: string;
  /** e.g. "07:00 – 23:00, ship time; urgent matters at any hour". */
  availability: string;
  /** In-suite dialling, e.g. "Dial 9 from your suite telephone". */
  suiteTelephone?: string;
  languages: string[];
  channels: ('chat' | 'suite-telephone' | 'in-person')[];
}

export interface LuggageArrangement {
  method: 'airport-collection' | 'terminal-kerbside' | 'guest-carried';
  summary: string;
  /** When bags are expected in the suite. */
  deliveredBy?: ISODateTime;
  /** Luggage tags issued electronically or posted. */
  tags: 'e-tags-issued' | 'posted' | 'at-terminal';
  pieces?: number;
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

/** Air travel to/from the voyage, as known to the reservation (fictional in dev data). */
export interface FlightSegment {
  id: ID;
  reservationId: ID;
  direction: 'inbound' | 'outbound';
  carrier: string;
  flightNumber: string;
  /** IATA codes. */
  origin: string;
  destination: string;
  departure: ISODateTime;
  arrival: ISODateTime;
  cabin: 'economy' | 'premium-economy' | 'business' | 'first';
  status: 'scheduled' | 'delayed' | 'departed' | 'landed' | 'cancelled';
  /** Whether the yacht's transfer team is tracking this flight. */
  trackedForTransfer: boolean;
}

/** Composite read model for the Voyage tab. */
export interface VoyageOverview {
  reservation: VoyageReservation;
  voyage: Voyage;
  yacht: Yacht;
  suite: Suite;
  embarkation: Embarkation;
  documents: TravelDocument[];
  flights: FlightSegment[];
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
