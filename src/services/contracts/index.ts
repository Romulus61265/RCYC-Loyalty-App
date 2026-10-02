/**
 * Service contracts — the ONLY surface the presentation layer depends on.
 *
 * Each contract has a Mock implementation for the MVP and will gain
 * Supabase / enterprise implementations (e.g. MarriottBonvoyService) that
 * are swapped in via the ServiceRegistry without touching any screen.
 *
 * Rules for implementations:
 *  - Return domain types only; never leak vendor DTOs.
 *  - Throw `ServiceError` with a stable `code`; UI maps codes to calm copy.
 *  - Never accept or return secrets. Auth is handled by the transport.
 */
import type {
  DaySchedule,
  Destination,
  DiscoverCollection,
  Embarkation,
  EscalationRequest,
  EscalationResult,
  Experience,
  ExperienceBooking,
  ExperienceCategory,
  ConciergeMessage,
  GuestContext,
  GuestPreferences,
  GuestPrivilege,
  GuestProfile,
  GuestRelationship,
  ID,
  ISODateTime,
  JourneyAlert,
  JourneyEvent,
  JourneyEventType,
  JourneyPhase,
  LoyaltyMembership,
  LoyaltyRecognition,
  Recommendation,
  RecommendationSurface,
  ServiceRequest,
  ServiceRequestType,
  TravelDocument,
  Voyage,
  VoyageOverview,
  VoyageReservation,
  Yacht,
  Suite,
  SpecialOccasion,
  TravelCompanion,
} from '@/domain';
import { AppError } from '@/core/errors/AppError';

export type ServiceErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'unavailable'
  | 'validation'
  | 'unknown';

/** Error thrown by every service implementation; a specialisation of AppError. */
export class ServiceError extends AppError {
  constructor(code: ServiceErrorCode, message: string, retryable?: boolean) {
    super(code, message, retryable === undefined ? {} : { retryable });
    this.name = 'ServiceError';
  }
}

export type Unsubscribe = () => void;

// ─── Auth ──────────────────────────────────────────────────────────────────

export type AppRole = 'guest' | 'travel_companion' | 'suite_ambassador' | 'concierge_agent' | 'shore_ops' | 'admin';

export interface AuthSession {
  userId: ID;
  guestId: ID;
  roles: AppRole[];
  /** Access token lifetime only — tokens themselves stay in secure storage. */
  expiresAt: ISODateTime;
  mfaVerified: boolean;
}

export interface AuthService {
  getSession(): Promise<AuthSession | null>;
  /** Passwordless e-mail OTP or Marriott Bonvoy SSO (OIDC + PKCE). */
  signInWithOtp(email: string): Promise<{ challengeId: ID }>;
  verifyOtp(challengeId: ID, code: string): Promise<AuthSession>;
  signInWithBonvoy(): Promise<AuthSession>;
  signOut(): Promise<void>;
  onSessionChange(listener: (session: AuthSession | null) => void): Unsubscribe;
}

// ─── Guest profile ─────────────────────────────────────────────────────────

export interface GuestProfileService {
  getProfile(guestId: ID): Promise<GuestProfile>;
  updatePreferences(guestId: ID, patch: Partial<Omit<GuestPreferences, 'guestId'>>): Promise<GuestPreferences>;
  listCompanions(guestId: ID): Promise<TravelCompanion[]>;
  listOccasions(guestId: ID): Promise<SpecialOccasion[]>;
}

// ─── Loyalty (Marriott Bonvoy) ─────────────────────────────────────────────

export interface LoyaltyService {
  getMembership(guestId: ID): Promise<LoyaltyMembership | null>;
  getRelationship(guestId: ID): Promise<GuestRelationship>;
  /** Privileges resolved for a specific voyage (tier + tenure + suite + occasion). */
  getPrivileges(guestId: ID, voyageId?: ID): Promise<GuestPrivilege[]>;
  /** Aggregate projection used on Home/Profile. */
  getRecognition(guestId: ID, voyageId?: ID): Promise<LoyaltyRecognition>;
  /** Links an existing Bonvoy account via the Bonvoy OAuth consent flow. */
  linkMembership(guestId: ID, authorizationCode: string): Promise<LoyaltyMembership>;
}

// ─── Voyage ────────────────────────────────────────────────────────────────

export interface VoyageService {
  listReservations(guestId: ID): Promise<VoyageReservation[]>;
  getUpcomingReservation(guestId: ID): Promise<VoyageReservation | null>;
  getPastVoyages(guestId: ID): Promise<Voyage[]>;
  getVoyage(voyageId: ID): Promise<Voyage>;
  getYacht(yachtId: ID): Promise<Yacht>;
  getSuite(suiteId: ID): Promise<Suite>;
  getEmbarkation(reservationId: ID): Promise<Embarkation>;
  getTravelDocuments(reservationId: ID): Promise<TravelDocument[]>;
  /** Composite read model for the Voyage tab. */
  getOverview(reservationId: ID): Promise<VoyageOverview>;
  /** Derives the journey phase for contextual UI. */
  getJourneyPhase(reservationId: ID, now?: Date): Promise<JourneyPhase>;
}

// ─── Daily experiences ─────────────────────────────────────────────────────

export interface AvailabilityQuery {
  experienceId: ID;
  date: string;
  partySize: number;
}

export interface AvailabilitySlot {
  start: ISODateTime;
  end?: ISODateTime;
  remaining: number;
}

export interface ExperienceService {
  listBookings(reservationId: ID, filter?: { category?: ExperienceCategory }): Promise<ExperienceBooking[]>;
  getNextBooking(reservationId: ID, category?: ExperienceCategory, now?: Date): Promise<ExperienceBooking | null>;
  getDaySchedule(reservationId: ID, dayNumber: number): Promise<DaySchedule>;
  listDaySchedules(reservationId: ID): Promise<DaySchedule[]>;
  listCatalogue(voyageId: ID, filter?: { category?: ExperienceCategory; portCallId?: ID }): Promise<Experience[]>;
  getExperience(experienceId: ID): Promise<Experience>;
  listCollections(voyageId: ID): Promise<DiscoverCollection[]>;
  listDestinations(voyageId: ID): Promise<Destination[]>;
  checkAvailability(query: AvailabilityQuery): Promise<AvailabilitySlot[]>;
  /** Bookings are requests: crew may confirm, propose alternatives or decline. */
  requestBooking(reservationId: ID, experienceId: ID, slot: ISODateTime, partySize: number, note?: string): Promise<ExperienceBooking>;
  requestChange(bookingId: ID, change: { start?: ISODateTime; partySize?: number; note?: string }): Promise<ExperienceBooking>;
  cancelBooking(bookingId: ID): Promise<void>;
}

// ─── Concierge ─────────────────────────────────────────────────────────────

export interface ConciergeService {
  /** Starts or resumes the guest's conversation for this reservation. */
  openConversation(reservationId: ID): Promise<{ conversationId: ID; messages: ConciergeMessage[] }>;
  /** AI-first response. Implementations decide when to auto-escalate. */
  sendMessage(conversationId: ID, body: string, context: GuestContext): Promise<ConciergeMessage[]>;
  escalateToHuman(request: EscalationRequest): Promise<EscalationResult>;
  createServiceRequest(reservationId: ID, input: { type: ServiceRequestType; summary: string; details?: string; priority?: ServiceRequest['priority'] }): Promise<ServiceRequest>;
  listServiceRequests(reservationId: ID): Promise<ServiceRequest[]>;
  getServiceRequest(requestId: ID): Promise<ServiceRequest>;
  /** Live updates from human agents / request status changes. */
  subscribe(conversationId: ID, listener: (message: ConciergeMessage) => void): Unsubscribe;
}

/** Pluggable reasoning backend behind ConciergeService (mock → enterprise AI). */
export interface ConciergeAIProvider {
  respond(input: { conversationId: ID; body: string; context: GuestContext; history: ConciergeMessage[] }): Promise<{
    messages: ConciergeMessage[];
    confidence: number;
    shouldEscalate: boolean;
  }>;
}

// ─── Personalization ───────────────────────────────────────────────────────

export interface PersonalizationService {
  getRecommendations(guestId: ID, surface: RecommendationSurface, opts?: { reservationId?: ID; limit?: number }): Promise<Recommendation[]>;
  /** Implicit/explicit feedback loop — e.g. dismissed, booked, loved. */
  recordFeedback(guestId: ID, recommendationId: ID, signal: 'viewed' | 'dismissed' | 'saved' | 'booked'): Promise<void>;
}

// ─── Journey events / service continuity ───────────────────────────────────

export interface JourneyEventService {
  listAlerts(reservationId: ID): Promise<JourneyAlert[]>;
  acknowledge(alertId: ID): Promise<void>;
  subscribe(reservationId: ID, listener: (event: JourneyEvent, alert?: JourneyAlert) => void, types?: JourneyEventType[]): Unsubscribe;
}

// ─── Audit ─────────────────────────────────────────────────────────────────

export interface AuditEntry {
  action: string;
  resource: string;
  resourceId?: ID;
  outcome: 'success' | 'failure';
  metadata?: Record<string, string | number | boolean>;
}

/** Client-side audit is advisory; the authoritative trail is server-side. */
export interface AuditService {
  record(entry: AuditEntry): void;
}

// ─── Clock ─────────────────────────────────────────────────────────────────

/** Injected time source — lets mocks pin "now" and tests control time. */
export interface ClockService {
  now(): Date;
}

// ─── Registry ──────────────────────────────────────────────────────────────

export interface Services {
  auth: AuthService;
  profile: GuestProfileService;
  loyalty: LoyaltyService;
  voyage: VoyageService;
  experience: ExperienceService;
  concierge: ConciergeService;
  personalization: PersonalizationService;
  journeyEvents: JourneyEventService;
  audit: AuditService;
  clock: ClockService;
}
