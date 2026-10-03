/**
 * Typed shape of a complete development dataset.
 *
 * Every entity uses the production domain types from `@/domain`, so mock
 * services and future enterprise adapters return identical shapes. The
 * dataset-level wrapper below exists only in development.
 */
import type {
  DaySchedule,
  Destination,
  DiscoverCollection,
  Embarkation,
  Experience,
  ExperienceBooking,
  ExperienceAvailability,
  FlightSegment,
  GuestNotification,
  GuestPrivilege,
  GuestProfile,
  GuestRelationship,
  JourneyAlert,
  LoyaltyMembership,
  PersonalizationSignal,
  Recommendation,
  ServiceRequest,
  Suite,
  TravelDocument,
  Voyage,
  VoyageReservation,
  Yacht,
  ConciergeMessage,
} from '@/domain';

/** Provenance stamped on every dataset, so fixture data can never be mistaken for real data. */
export interface FixtureMeta {
  datasetId: string;
  description: string;
  /** Always true. Checked by the integrity script and the mock registry. */
  fictional: true;
  /** Only mock services may load this dataset. */
  allowedConsumers: 'mock-services-only';
  /** "Now" the dataset is designed around (pre-voyage, sailing, …). */
  referenceNow: string;
  disclaimer: string;
}

export interface DevGuestData {
  profile: GuestProfile;
  membership: LoyaltyMembership;
  relationship: GuestRelationship;
  privileges: GuestPrivilege[];
}

export interface DevVoyageData {
  yacht: Yacht;
  suite: Suite;
  voyage: Voyage;
  reservation: VoyageReservation;
  embarkation: Embarkation;
  documents: TravelDocument[];
  flights: FlightSegment[];
  pastVoyages: Voyage[];
}

export interface DevExperienceData {
  catalogue: Experience[];
  /** Dining, spa, excursions, transfers, private experiences — all held by the party. */
  bookings: ExperienceBooking[];
  daySchedules: DaySchedule[];
  collections: DiscoverCollection[];
  destinations: Destination[];
  availability: ExperienceAvailability[];
}

/** Opening state of the concierge, including a Suite Ambassador hand-off. */
export interface DevConciergeData {
  ambassador: { name: string; title: string };
  /** Opening line, without the salutation (added at runtime from the clock). */
  greeting: string;
  suggestedQuestions: string[];
  requests: ServiceRequest[];
  /** Prior conversation, already in progress before the demo "now". */
  history: Omit<ConciergeMessage, 'conversationId'>[];
}

export interface DevCommunicationData {
  alerts: JourneyAlert[];
  notifications: GuestNotification[];
}

export interface DevPersonalizationData {
  signals: PersonalizationSignal[];
  recommendations: Recommendation[];
}

export interface DevDataset {
  meta: FixtureMeta;
  guest: DevGuestData;
  voyage: DevVoyageData;
  experiences: DevExperienceData;
  concierge: DevConciergeData;
  communication: DevCommunicationData;
  personalization: DevPersonalizationData;
}
