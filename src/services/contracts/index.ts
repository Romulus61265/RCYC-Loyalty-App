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
  ConciergeAction,
  ConciergeMessage,
  EscalationTarget,
  GuestContext,
  PreferencesPatch,
  VersionedPreferences,
  ExperienceAvailability,
  CalendarDay,
  GuestNotification,
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
  PersonalizedRecommendation,
  Recommendation,
  RecommendationSurface,
  CelebrationApproval,
  CelebrationApprovalResult,
  CelebrationPlan,
  GuestServiceRequest,
  InboxNotification,
  NotificationPreferences,
  NotificationSettings,
  NotificationType,
  PushDevice,
  UpcomingNotification,
  NewServiceRequest,
  GoodwillProposal,
  RecoveryAcceptance,
  RecoveryApproval,
  RecoveryNotice,
  RecoveryRecord,
  ArrivalUpdate,
  AnalyticsEnvelope,
  AnalyticsEventName,
  AnalyticsEventProps,
  VoyageHistoryEntry,
  FeedbackPatch,
  VoyageFeedback,
  VoyageRecap,
  HandlerRun,
  InternalEvent,
  InternalEventStatus,
  InternalEventType,
  NewInternalEvent,
  FlightStatusUpdate,
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
import type { PushRegistrar } from '@/services/push/PushRegistrar';

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
  /** Guest record, companions and occasions, with the latest saved preferences. */
  getProfile(guestId: ID): Promise<GuestProfile>;
  getPreferences(guestId: ID): Promise<VersionedPreferences>;
  /**
   * Replaces the given preference groups. Pass `expectedVersion` (from the
   * last read) to reject a stale edit with `ServiceError('conflict')`.
   */
  updatePreferences(guestId: ID, patch: PreferencesPatch, opts?: { expectedVersion?: number }): Promise<VersionedPreferences>;
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
  /** Availability summary for every experience on the voyage (marketplace view). */
  listAvailability(voyageId: ID): Promise<ExperienceAvailability[]>;
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
  /**
   * Carries out an action the guest chose from an action card (move a table,
   * request an experience, raise a request, hand over to a person). Returns
   * the concierge's confirmation message(s). `open` actions are navigation
   * and are handled by the app, not here.
   */
  performAction(conversationId: ID, action: ConciergeAction): Promise<ConciergeMessage[]>;
  createServiceRequest(reservationId: ID, input: { type: ServiceRequestType; summary: string; details?: string; priority?: ServiceRequest['priority'] }): Promise<ServiceRequest>;
  listServiceRequests(reservationId: ID): Promise<ServiceRequest[]>;
  getServiceRequest(requestId: ID): Promise<ServiceRequest>;
  /** Live updates from human agents / request status changes. */
  subscribe(conversationId: ID, listener: (message: ConciergeMessage) => void): Unsubscribe;
}

/**
 * Pluggable reasoning backend behind ConciergeService (mock → enterprise AI).
 * The provider only decides; the orchestrating service escalates (`escalateTo`)
 * and persists. Nothing it says performs an action: only the guest's tap does
 * (ConciergeService.performAction).
 */
export interface ConciergeAIProvider {
  respond(input: { conversationId: ID; body: string; context: GuestContext; history: ConciergeMessage[] }): Promise<{
    messages: ConciergeMessage[];
    confidence: number;
    shouldEscalate: boolean;
    /** Who to hand over to when escalating, and why. */
    escalateTo?: EscalationTarget;
    escalationReason?: EscalationRequest['reason'];
  }>;
}

// ─── Personalization ───────────────────────────────────────────────────────

export interface PersonalizationService {
  /**
   * Next-best experiences from the rules-based engine, highest relevance
   * first, each with its reason, date, destination, action and source
   * signals. `relevanceScore` ranks; it is never shown to the guest.
   * Internal signals (the value segment) never reach the app.
   */
  getPersonalizedRecommendations(guestId: ID, reservationId: ID, opts?: { limit?: number; includeBooked?: boolean }): Promise<PersonalizedRecommendation[]>;
  getRecommendations(guestId: ID, surface: RecommendationSurface, opts?: { reservationId?: ID; limit?: number }): Promise<Recommendation[]>;
  /** Implicit/explicit feedback loop — e.g. dismissed, booked, loved. */
  recordFeedback(guestId: ID, recommendationId: ID, signal: 'viewed' | 'dismissed' | 'saved' | 'booked'): Promise<void>;
}

// ─── Guest service requests ────────────────────────────────────────────────

/**
 * The guest's requests to the crew: suite, dining, housekeeping, maintenance,
 * transport, excursions, spa, concierge, special assistance. Shares one store
 * with requests the concierge raises, so everything appears in one place.
 * Guests submit, follow and close; status changes are the crew's.
 */
export interface ServiceRequestService {
  submit(input: NewServiceRequest): Promise<GuestServiceRequest>;
  /** Submitted, acknowledged and in progress; newest activity first. */
  listActive(reservationId: ID): Promise<GuestServiceRequest[]>;
  /** Resolved and closed; newest first. */
  listHistory(reservationId: ID): Promise<GuestServiceRequest[]>;
  get(requestId: ID): Promise<GuestServiceRequest>;
  /** Withdraws a request before work starts, or closes a resolved one. */
  close(requestId: ID): Promise<GuestServiceRequest>;
  /** Live updates (crew acknowledging, progress, resolution). */
  subscribe(reservationId: ID, listener: (request: GuestServiceRequest) => void): Unsubscribe;
}

// ─── Special occasions ─────────────────────────────────────────────────────

/**
 * Celebrations that fall during the voyage (birthday, anniversary,
 * honeymoon, milestone voyage, Bonvoy milestone), each with a plan: a
 * personal message and steps, some already in hand. Plans only propose.
 * approveStep is the only way a step becomes a request or a booking request,
 * and it requires the guest's explicit approval (and acknowledgement of any
 * charge). Nothing is ever purchased automatically.
 */
export interface OccasionService {
  listCelebrations(guestId: ID, reservationId: ID): Promise<CelebrationPlan[]>;
  getPlan(guestId: ID, reservationId: ID, celebrationKey: string): Promise<CelebrationPlan>;
  approveStep(guestId: ID, reservationId: ID, celebrationKey: string, approval: CelebrationApproval): Promise<CelebrationApprovalResult>;
}

// ─── Notifications ─────────────────────────────────────────────────────────

/**
 * Contextual notifications (information, reminder, service update,
 * reservation, itinerary change, urgent, recommendation), built from the
 * guest's own data by the shared engine and merged with what the server has
 * sent. Preferences decide which types push, which stay in the inbox, and
 * which are off; urgent always pushes. Quiet hours hold pushes that can wait.
 */
export interface NotificationService {
  /** The inbox: what is due now, newest first. */
  list(guestId: ID, reservationId: ID, opts?: { type?: NotificationType }): Promise<InboxNotification[]>;
  /** Pushes still to come, soonest first. */
  upcoming(guestId: ID, reservationId: ID, opts?: { limit?: number }): Promise<UpcomingNotification[]>;
  unreadCount(guestId: ID, reservationId: ID): Promise<number>;
  markRead(guestId: ID, keys: string[]): Promise<void>;
  markAllRead(guestId: ID, reservationId: ID): Promise<void>;
  getSettings(guestId: ID): Promise<NotificationSettings>;
  /** Urgent cannot be switched off or kept out of push. */
  updatePreferences(guestId: ID, patch: Partial<NotificationPreferences>): Promise<NotificationSettings>;
  /** Push devices (Expo push tokens). Tokens are stored server-side only. */
  registerDevice(guestId: ID, registration: { token: string; platform: PushDevice['platform']; name?: string }): Promise<PushDevice>;
  listDevices(guestId: ID): Promise<PushDevice[]>;
  unregisterDevice(guestId: ID, deviceId: ID): Promise<void>;
  /** Something changed (a request moved on, an alert arrived): reload. */
  subscribe(guestId: ID, reservationId: ID, listener: () => void): Unsubscribe;
}

// ─── Service recovery ──────────────────────────────────────────────────────

/**
 * Disruptions (a transfer delay, a cancelled dinner or excursion, a suite
 * issue, a port change, the weather, a missed service, a complaint) as the
 * guest is told about them: calmly, the reason when known, comparable
 * alternatives, and a person to help. Each disruption is recorded once,
 * server-side, with its plan for the crew.
 *
 * Nothing is booked without the guest's explicit approval, and nothing is
 * ever compensated here: goodwill is proposed to the crew by authorised
 * business rules and decided by people (ServiceRecoveryOperations).
 */
export interface ServiceRecoveryService {
  /** Open notices first, newest first. */
  listNotices(guestId: ID, reservationId: ID): Promise<RecoveryNotice[]>;
  getNotice(guestId: ID, reservationId: ID, noticeId: ID): Promise<RecoveryNotice>;
  /** Requests the chosen alternative (a booking request, or a request to the team). */
  acceptAlternative(guestId: ID, reservationId: ID, noticeId: ID, approval: RecoveryApproval): Promise<RecoveryAcceptance>;
  /** Asks the Suite Ambassador to help, as a service request. */
  requestAssistance(guestId: ID, reservationId: ID, noticeId: ID, note?: string): Promise<RecoveryAcceptance>;
  subscribe(reservationId: ID, listener: () => void): Unsubscribe;
}

/** The crew's side: recorded recoveries and goodwill proposals. Never in the guest app. */
export interface ServiceRecoveryOperations {
  listRecords(reservationId: ID): Promise<RecoveryRecord[]>;
  listProposals(reservationId: ID): Promise<GoodwillProposal[]>;
  /** Approving records the authority to carry a gesture out; it does not carry it out. */
  decideProposal(proposalId: ID, decision: { approve: boolean; note?: string }): Promise<GoodwillProposal>;
}

// ─── Voyage history ────────────────────────────────────────────────────────

/**
 * The guest's past voyages: yacht, dates, destinations, suite, what they did
 * ashore and at the table, the preferences learned (and whether each still
 * stands), memories, and a place for photographs. The same records are the
 * personalization engine's history.
 */
export interface VoyageHistoryService {
  /** Newest first. */
  listVoyages(guestId: ID): Promise<VoyageHistoryEntry[]>;
  getVoyage(guestId: ID, voyageId: ID): Promise<VoyageHistoryEntry>;
}

// ─── After the voyage ──────────────────────────────────────────────────────

/**
 * Welcome home: the voyage remembered (days, destinations, favourite
 * moments), a note from the Suite Ambassador, a Bonvoy placeholder, the
 * next voyages that suit, and the guest's reflections. Reflections are
 * optional throughout, saved as the guest goes, and sent once, to people.
 * There is no score.
 */
export interface PostVoyageService {
  /** Null until the voyage is over. */
  getRecap(guestId: ID, reservationId: ID): Promise<VoyageRecap | null>;
  /** Saves a draft (any part, any time). Refused once sent; pass the version read to refuse a stale edit. */
  saveFeedback(guestId: ID, reservationId: ID, patch: FeedbackPatch, opts?: { expectedVersion?: number }): Promise<VoyageFeedback>;
  /** Sends the reflections to the Suite Ambassador; raises a request when the guest asked to be contacted. */
  sendFeedback(guestId: ID, reservationId: ID): Promise<VoyageFeedback>;
}

// ─── Internal events ───────────────────────────────────────────────────────

/** What a handler is given besides the event. */
export interface HandlerContext {
  /**
   * Publishes a follow-up event, caused by this one and in the same chain
   * (correlation). Its handlers run before this resolves, so the caller
   * can act on their outcome.
   */
  emit<T extends InternalEventType>(event: NewInternalEvent<T>): Promise<PublishResult<T>>;
  now(): Date;
}

export interface HandlerResult {
  outcome: HandlerRun['outcome'];
  detail?: string;
}

/**
 * Reacts to some event types. One per service (transfers, voyage,
 * notifications, concierge…). A handler that throws is recorded as failed;
 * the other handlers still run.
 */
export interface EventHandler<T extends InternalEventType = InternalEventType> {
  readonly name: string;
  readonly handles: readonly T[];
  handle(event: InternalEvent<T>, ctx: HandlerContext): Promise<HandlerResult>;
}

export interface PublishResult<T extends InternalEventType = InternalEventType> {
  event: InternalEvent<T>;
  runs: HandlerRun[];
  /** Already published under this dedupe key: nothing ran again. */
  duplicate: boolean;
}

/**
 * The internal event bus. Publishing validates the event, gives it an id
 * and a time, ignores duplicates, and runs every handler for its type in
 * registration order, recording each run and the event's final status.
 */
export interface EventService {
  publish<T extends InternalEventType>(event: NewInternalEvent<T>): Promise<PublishResult<T>>;
  register(handler: EventHandler): Unsubscribe;
  get(eventId: ID): Promise<InternalEvent | null>;
  list(filter?: { guest_id?: ID; voyage_id?: ID; event_type?: InternalEventType; status?: InternalEventStatus; correlation_id?: ID }): Promise<InternalEvent[]>;
  runs(eventId: ID): Promise<HandlerRun[]>;
  /** Every event once processed (dev tools, audit sinks). */
  subscribe(listener: (event: InternalEvent) => void): Unsubscribe;
}

/**
 * Ground transport. Transfers are bookings, but moving one is the
 * operator's decision: no transfer-supplier integration exists, so the mock
 * operator confirms and a real one would answer "requested" until it does.
 */
export interface TransferService {
  retime(bookingId: ID, change: { start: ISODateTime; end?: ISODateTime; reason: string }): Promise<'confirmed' | 'requested'>;
}

// ─── Shoreside-to-yacht continuity ─────────────────────────────────────────

/**
 * A source of flight status (delays, cancellations, new estimates). This is
 * an integration boundary: the only implementation today is
 * MockTravelDisruptionService. A production adapter (an airline or
 * flight-data provider feed, or the travel agency's disruption feed) would
 * run server-side and publish `flight.delayed` journey events; the app never
 * talks to such a source directly.
 */
export interface TravelDisruptionService {
  /** The latest observation for a flight, or null when the source has none. */
  getFlightStatus(flightNumber: string, departureDate: string): Promise<FlightStatusUpdate | null>;
  /** Observations as they arrive. */
  subscribe(listener: (update: FlightStatusUpdate) => void): Unsubscribe;
}

/**
 * What the guest is told when travel to the yacht changes: the flight delay
 * and everything moved because of it (transfer, embarkation window, plans en
 * route), with the concierge at hand. Each change says whether it is done or
 * only requested; nothing is reported as done before its owner confirms it.
 */
export interface ContinuityService {
  /** The latest update for the reservation, or null. */
  getArrivalUpdate(reservationId: ID): Promise<ArrivalUpdate | null>;
  subscribe(reservationId: ID, listener: () => void): Unsubscribe;
}

// ─── Journey events / service continuity ───────────────────────────────────

// ─── Schedule (combined guest calendar) ───────────────────────────────────

export interface ScheduleService {
  /**
   * Chronological calendar for the party: yacht events, dining, spa,
   * excursions, private experiences, transfers, port times and flights,
   * including travel days before and after the voyage.
   */
  getCalendar(reservationId: ID): Promise<CalendarDay[]>;
}

export interface JourneyEventService {
  listAlerts(reservationId: ID): Promise<JourneyAlert[]>;
  /** Outbound communication history and schedule (push, e-mail, SMS, in-app), newest first. */
  listNotifications(guestId: ID, opts?: { includeScheduled?: boolean; now?: Date }): Promise<GuestNotification[]>;
  acknowledge(alertId: ID): Promise<void>;
  subscribe(reservationId: ID, listener: (event: JourneyEvent, alert?: JourneyAlert) => void, types?: JourneyEventType[]): Unsubscribe;
}

// ─── Analytics ─────────────────────────────────────────────────────────────

/**
 * Privacy-conscious product analytics. Only declared events with declared
 * properties leave the device, screened for anything that must never be
 * logged; nothing is sent without the guest's analytics consent; no guest
 * or reservation id is attached. Never throws: analytics must not break a screen.
 */
export interface AnalyticsService {
  track<E extends AnalyticsEventName>(event: E, props: AnalyticsEventProps[E]): void;
  /** A screen, as its route pattern (/history/[id]), never with real ids. */
  screen(path: string): void;
  /** From the guest's privacy preference. Until known, events wait; when off, they are discarded. */
  setConsent(granted: boolean): void;
  flush(): Promise<void>;
}

/** Where analytics go. Replace the vendor by writing one of these. */
export interface AnalyticsProvider {
  readonly name: string;
  send(batch: AnalyticsEnvelope[]): Promise<void>;
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

// ─── Demonstration ─────────────────────────────────────────────────────────

/**
 * The presenter's controls for a demonstration (DEMO_MODE, docs/23). Outside
 * one (`mode` null, and always in Supabase mode) it does nothing.
 */
/** One step of the presenter's script. */
export interface DemoStep {
  n: number;
  /** What the step shows, as the presenter would announce it. */
  title: string;
  /** Where to look, and what to say. */
  cue: string;
  /** The in-app route the step happens on. */
  route?: string;
  /** A step the presenter performs rather than shows. */
  action?: 'inbound-delay';
}

export interface DemoService {
  /** The demonstration running, or null. */
  readonly mode: 'executive' | null;
  /** The presenter's script, in order (empty outside a demonstration). */
  script(): DemoStep[];
  status(): Promise<{ inboundDelayed: boolean }>;
  /** Reports the inbound flight two hours late (simulated), and waits until every arrangement has been adjusted. Once per run. */
  simulateInboundDelay(): Promise<{ inboundDelayed: true }>;
  /** Starts the demonstration again from its first moment: fresh services, and nothing left on the device. */
  reset(): Promise<void>;
}

export interface Services {
  auth: AuthService;
  profile: GuestProfileService;
  loyalty: LoyaltyService;
  voyage: VoyageService;
  experience: ExperienceService;
  concierge: ConciergeService;
  personalization: PersonalizationService;
  requests: ServiceRequestService;
  occasions: OccasionService;
  notifications: NotificationService;
  recovery: ServiceRecoveryService;
  continuity: ContinuityService;
  postVoyage: PostVoyageService;
  history: VoyageHistoryService;
  analytics: AnalyticsService;
  /** The device side of push (token and permission). */
  push: PushRegistrar;
  journeyEvents: JourneyEventService;
  schedule: ScheduleService;
  audit: AuditService;
  clock: ClockService;
  /** Presenter controls; inert outside a demonstration. */
  demo: DemoService;
}
