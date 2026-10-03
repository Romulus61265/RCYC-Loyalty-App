/**
 * Row shapes returned by PostgREST and their mapping to domain types.
 * Pure functions: tested by scripts/check-supabase.ts against the mocks.
 *
 * Times come from the `*_local` views as ISO strings with the local offset
 * of where they happen, which is how the app displays them.
 */
import type {
  ConciergeMessage,
  Destination,
  DiscoverCollection,
  Embarkation,
  Experience,
  ExperienceBooking,
  FlightSegment,
  Guest,
  GuestNotification,
  GuestPrivilege,
  JourneyAlert,
  LoyaltyMembership,
  MediaAsset,
  PortCall,
  Recommendation,
  ScheduleItem,
  ServiceRequest,
  SourceRef,
  SpecialOccasion,
  Suite,
  TravelCompanion,
  TravelDocument,
  Voyage,
  VoyageReservation,
  Yacht,
} from '@/domain';
import { compact, nightsBetween, opt, optList } from './support';

const DEFAULT_TONE = ['#1F3A4D', '#7F9C96'] as const;

export function media(hero: MediaAsset | null | undefined, alt: string): MediaAsset {
  return hero ?? { alt, tone: DEFAULT_TONE };
}

function source(system: SourceRef['system'] | null, externalId?: string | null, syncedAt?: string | null): SourceRef {
  return compact({ system: system ?? 'supabase', externalId: opt(externalId), syncedAt: opt(syncedAt) });
}

const point = (lat: number | null, lng: number | null) => (lat === null || lng === null ? undefined : { lat, lng });

// ─── Guest ─────────────────────────────────────────────────────────────────

export const GUEST_COLUMNS = 'id, salutation, first_name, last_name, preferred_name, email_masked, phone_masked, home_city, home_airport, guest_since, source_system, external_id';

export interface GuestRow {
  id: string;
  salutation: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  email_masked: string;
  phone_masked: string | null;
  home_city: string | null;
  home_airport: string | null;
  guest_since: string;
  source_system: SourceRef['system'];
  external_id: string | null;
}

/** Date of birth is never read by the app; nationality comes from `my_personal_details()`. */
export function toGuest(r: GuestRow, nationality?: string | null): Guest {
  return compact({
    id: r.id,
    salutation: r.salutation,
    firstName: r.first_name,
    lastName: r.last_name,
    preferredName: opt(r.preferred_name),
    emailMasked: r.email_masked,
    phoneMasked: opt(r.phone_masked),
    nationality: opt(nationality),
    homeCity: opt(r.home_city),
    homeAirport: opt(r.home_airport),
    guestSince: r.guest_since,
    source: source(r.source_system, r.external_id),
  });
}

export const COMPANION_COLUMNS = 'id, companion_guest_id, first_name, last_name, relationship, is_minor, notes';

export interface CompanionRow {
  id: string;
  companion_guest_id: string | null;
  first_name: string;
  last_name: string;
  relationship: TravelCompanion['relationship'];
  is_minor: boolean;
  notes: string | null;
}

export function toCompanion(r: CompanionRow): TravelCompanion {
  return compact({ id: r.id, guestId: opt(r.companion_guest_id), firstName: r.first_name, lastName: r.last_name, relationship: r.relationship, isMinor: r.is_minor, notes: opt(r.notes) });
}

export const OCCASION_COLUMNS = 'id, type, label, occasion_date, person_ids, recognition';

export interface OccasionRow {
  id: string;
  type: SpecialOccasion['type'];
  label: string;
  occasion_date: string;
  person_ids: string[];
  recognition: SpecialOccasion['recognition'];
}

export function toOccasion(r: OccasionRow): SpecialOccasion {
  return { id: r.id, type: r.type, label: r.label, date: r.occasion_date, personIds: r.person_ids ?? [], recognition: r.recognition };
}

// ─── Loyalty ───────────────────────────────────────────────────────────────

export const MEMBERSHIP_COLUMNS = 'programme, member_number_masked, tier, tier_label, lifetime_status, member_since, points_balance, source_system, external_id, synced_at';

export interface MembershipRow {
  programme: string;
  member_number_masked: string;
  tier: LoyaltyMembership['tier'];
  tier_label: string;
  lifetime_status: string | null;
  member_since: string | null;
  points_balance: number | null;
  source_system: SourceRef['system'];
  external_id: string | null;
  synced_at: string | null;
}

export function toMembership(r: MembershipRow): LoyaltyMembership {
  return compact({
    programme: 'marriott-bonvoy' as const,
    memberNumberMasked: r.member_number_masked,
    tier: r.tier,
    tierLabel: r.tier_label,
    lifetimeStatus: opt(r.lifetime_status),
    memberSince: r.member_since ?? '',
    pointsBalance: opt(r.points_balance),
    source: source(r.source_system, r.external_id, r.synced_at),
  });
}

export interface PrivilegeRow {
  voyage_id: string | null;
  privilege: { id: string; title: string; description: string; category: GuestPrivilege['category']; basis: GuestPrivilege['basis'] } | null;
}

export function toPrivilege(r: PrivilegeRow): GuestPrivilege | null {
  if (!r.privilege) return null;
  const p = r.privilege;
  return compact({ id: p.id, title: p.title, description: p.description, category: p.category, basis: p.basis, appliesToVoyageId: opt(r.voyage_id) });
}

// ─── Fleet & voyage ────────────────────────────────────────────────────────

export const YACHT_COLUMNS = 'id, name, tagline, guest_capacity, suites, crew, length_m, highlights, hero';

export interface YachtRow {
  id: string;
  name: string;
  tagline: string | null;
  guest_capacity: number | null;
  suites: number | null;
  crew: number | null;
  length_m: number | null;
  highlights: string[];
  hero: MediaAsset | null;
}

export function toYacht(r: YachtRow): Yacht {
  return {
    id: r.id,
    name: r.name,
    tagline: r.tagline ?? '',
    guestCapacity: r.guest_capacity ?? 0,
    suites: r.suites ?? 0,
    crew: r.crew ?? 0,
    lengthMeters: Number(r.length_m ?? 0),
    highlights: r.highlights ?? [],
    hero: media(r.hero, r.name),
  };
}

export const SUITE_COLUMNS = 'id, number, name, category, deck, area_sqm, terrace_sqm, features, hero';

export interface SuiteRow {
  id: string;
  number: string;
  name: string;
  category: Suite['category'];
  deck: number;
  area_sqm: number | null;
  terrace_sqm: number | null;
  features: string[];
  hero: MediaAsset | null;
}

export function toSuite(r: SuiteRow): Suite {
  return compact({
    id: r.id,
    number: r.number,
    name: r.name,
    category: r.category,
    deck: r.deck,
    areaSqm: Number(r.area_sqm ?? 0),
    terraceSqm: r.terrace_sqm === null ? undefined : Number(r.terrace_sqm),
    features: r.features ?? [],
    hero: media(r.hero, r.name),
  });
}

export const PORT_CALL_COLUMNS = 'id, voyage_id, day, call_date, type, port_name, country, time_zone, arrival, departure, all_aboard, summary, lat, lng, hero';

export interface PortCallRow {
  id: string;
  voyage_id: string;
  day: number;
  call_date: string;
  type: PortCall['type'];
  port_name: string;
  country: string;
  time_zone: string;
  arrival: string | null;
  departure: string | null;
  all_aboard: string | null;
  summary: string | null;
  lat: number | null;
  lng: number | null;
  hero: MediaAsset | null;
}

export function toPortCall(r: PortCallRow): PortCall {
  return compact({
    id: r.id,
    day: r.day,
    date: r.call_date,
    type: r.type,
    portName: r.port_name,
    country: r.country,
    timeZone: r.time_zone,
    arrival: opt(r.arrival),
    departure: opt(r.departure),
    allAboard: opt(r.all_aboard),
    location: point(r.lat, r.lng),
    summary: r.summary ?? '',
    hero: media(r.hero, r.port_name),
  });
}

export const VOYAGE_COLUMNS = 'id, code, name, yacht_id, start_date, end_date, region, hero, source_system, external_id';

export interface VoyageRow {
  id: string;
  code: string;
  name: string;
  yacht_id: string;
  start_date: string;
  end_date: string;
  region: string | null;
  hero: MediaAsset | null;
  source_system: SourceRef['system'];
  external_id: string | null;
}

export function toVoyage(r: VoyageRow, itinerary: PortCall[]): Voyage {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    yachtId: r.yacht_id,
    startDate: r.start_date,
    endDate: r.end_date,
    nights: nightsBetween(r.start_date, r.end_date),
    region: r.region ?? '',
    itinerary,
    hero: media(r.hero, r.name),
    source: source(r.source_system, r.external_id),
  };
}

export const RESERVATION_COLUMNS =
  'id, booking_reference, voyage_id, suite_id, lead_guest_id, status, suite_ambassador, suite_ambassador_contact, source_system, external_id, reservation_guests(guest_id)';

export interface ReservationRow {
  id: string;
  booking_reference: string;
  voyage_id: string;
  suite_id: string | null;
  lead_guest_id: string;
  status: VoyageReservation['status'];
  suite_ambassador: string | null;
  suite_ambassador_contact: VoyageReservation['suiteAmbassadorContact'] | null;
  source_system: SourceRef['system'];
  external_id: string | null;
  reservation_guests: { guest_id: string }[] | null;
}

export function toReservation(r: ReservationRow): VoyageReservation {
  const others = (r.reservation_guests ?? []).map((g) => g.guest_id).filter((id) => id !== r.lead_guest_id).sort();
  return compact({
    id: r.id,
    bookingReference: r.booking_reference,
    voyageId: r.voyage_id,
    suiteId: r.suite_id ?? '',
    leadGuestId: r.lead_guest_id,
    partyGuestIds: [r.lead_guest_id, ...others],
    status: r.status,
    suiteAmbassador: opt(r.suite_ambassador),
    suiteAmbassadorContact: opt(r.suite_ambassador_contact),
    source: source(r.source_system, r.external_id),
  });
}

export const EMBARKATION_COLUMNS = 'reservation_id, terminal_name, address, lat, lng, arrival_window_start, arrival_window_end, suite_ready_at, all_aboard, departure, check_in_status, luggage, notes';

export interface EmbarkationRow {
  reservation_id: string;
  terminal_name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  arrival_window_start: string;
  arrival_window_end: string;
  suite_ready_at: string | null;
  all_aboard: string;
  departure: string;
  check_in_status: Embarkation['checkInStatus'];
  luggage: Embarkation['luggage'] | null;
  notes: string[];
}

export function toEmbarkation(r: EmbarkationRow): Embarkation {
  return compact({
    reservationId: r.reservation_id,
    terminalName: r.terminal_name,
    address: r.address,
    location: point(r.lat, r.lng),
    arrivalWindowStart: r.arrival_window_start,
    arrivalWindowEnd: r.arrival_window_end,
    suiteReadyAt: r.suite_ready_at ?? r.arrival_window_end,
    allAboard: r.all_aboard,
    departure: r.departure,
    checkInStatus: r.check_in_status,
    luggage: opt(r.luggage),
    notes: r.notes ?? [],
  });
}

export const DOCUMENT_COLUMNS = 'id, guest_id, type, label, status, detail, due_by';

export interface DocumentRow {
  id: string;
  guest_id: string;
  type: TravelDocument['type'];
  label: string;
  status: TravelDocument['status'];
  detail: string | null;
  due_by: string | null;
}

export function toDocument(r: DocumentRow): TravelDocument {
  return compact({ id: r.id, guestId: r.guest_id, type: r.type, label: r.label, status: r.status, detail: opt(r.detail), dueBy: opt(r.due_by) });
}

export const FLIGHT_COLUMNS = 'id, reservation_id, direction, carrier, flight_number, origin, destination, departure, arrival, cabin, status, tracked_for_transfer';

export interface FlightRow {
  id: string;
  reservation_id: string;
  direction: FlightSegment['direction'];
  carrier: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  cabin: FlightSegment['cabin'];
  status: FlightSegment['status'];
  tracked_for_transfer: boolean;
}

export function toFlight(r: FlightRow): FlightSegment {
  return {
    id: r.id,
    reservationId: r.reservation_id,
    direction: r.direction,
    carrier: r.carrier,
    flightNumber: r.flight_number,
    origin: r.origin,
    destination: r.destination,
    departure: r.departure,
    arrival: r.arrival,
    cabin: r.cabin,
    status: r.status,
    trackedForTransfer: r.tracked_for_transfer,
  };
}

// ─── Experiences ───────────────────────────────────────────────────────────

export const EXPERIENCE_COLUMNS =
  'id, category, title, subtitle, description, port_call_id, destination, duration_minutes, price_minor, currency, inclusive, private_available, format, capacity, includes, tags, hero';

export interface ExperienceRow {
  id: string;
  category: Experience['category'];
  title: string;
  subtitle: string | null;
  description: string | null;
  port_call_id: string | null;
  destination: string | null;
  duration_minutes: number | null;
  price_minor: number | null;
  currency: string | null;
  inclusive: boolean;
  private_available: boolean;
  format: Experience['format'];
  capacity: number | null;
  includes: string[];
  tags: string[];
  hero: MediaAsset | null;
}

export function toExperience(r: ExperienceRow): Experience {
  return compact({
    id: r.id,
    category: r.category,
    title: r.title,
    subtitle: r.subtitle ?? '',
    description: r.description ?? '',
    portCallId: opt(r.port_call_id),
    destination: opt(r.destination),
    durationMinutes: opt(r.duration_minutes),
    price: r.price_minor !== null && r.currency ? { amountMinor: r.price_minor, currency: r.currency.trim() as 'EUR' } : undefined,
    inclusive: r.inclusive,
    privateAvailable: r.private_available,
    format: r.format,
    capacity: opt(r.capacity),
    includes: optList(r.includes),
    tags: r.tags ?? [],
    hero: media(r.hero, r.title),
  });
}

export const BOOKING_COLUMNS = 'id, reservation_id, experience_id, category, title, venue, start_local, end_local, party_size, status, note';

export interface BookingRow {
  id: string;
  reservation_id: string;
  experience_id: string;
  category: ExperienceBooking['category'];
  title: string;
  venue: string | null;
  start_local: string;
  end_local: string | null;
  party_size: number;
  status: ExperienceBooking['status'];
  note: string | null;
}

export function toBooking(r: BookingRow): ExperienceBooking {
  return compact({
    id: r.id,
    reservationId: r.reservation_id,
    experienceId: r.experience_id,
    category: r.category,
    title: r.title,
    venue: r.venue ?? '',
    start: r.start_local,
    end: opt(r.end_local),
    partySize: r.party_size,
    status: r.status,
    note: opt(r.note),
  });
}

export const ACTIVITY_COLUMNS = 'id, day, title, location, kind, booking_id, category, start_local, end_local, previous_start_local, changed_local';

export interface ActivityRow {
  id: string;
  day: number;
  title: string;
  location: string | null;
  kind: ScheduleItem['kind'];
  booking_id: string | null;
  category: ScheduleItem['category'] | null;
  start_local: string;
  end_local: string | null;
  previous_start_local?: string | null;
  changed_local?: string | null;
}

export function toScheduleItem(r: ActivityRow): ScheduleItem {
  return compact({
    id: r.id,
    start: r.start_local,
    end: opt(r.end_local),
    title: r.title,
    location: r.location ?? '',
    kind: r.kind,
    bookingId: opt(r.booking_id),
    category: opt(r.category),
    previousStart: opt(r.previous_start_local ?? null),
    changedAt: opt(r.changed_local ?? null),
  });
}

export const VOYAGE_DAY_COLUMNS = 'day, day_date, port_call_id, headline, dress_code, sunset';

export interface VoyageDayRow {
  day: number;
  day_date: string;
  port_call_id: string | null;
  headline: string;
  dress_code: string | null;
  sunset: string | null;
}

export const COLLECTION_COLUMNS = 'id, title, standfirst, category, experience_ids';

export interface CollectionRow {
  id: string;
  title: string;
  standfirst: string;
  category: DiscoverCollection['category'];
  experience_ids: string[];
}

export function toCollection(r: CollectionRow): DiscoverCollection {
  return { id: r.id, title: r.title, standfirst: r.standfirst, category: r.category, experienceIds: r.experience_ids ?? [] };
}

export const DESTINATION_COLUMNS = 'id, name, country, port_call_id, standfirst, hero';

export interface DestinationRow {
  id: string;
  name: string;
  country: string;
  port_call_id: string | null;
  standfirst: string;
  hero: MediaAsset | null;
}

export function toDestination(r: DestinationRow): Destination {
  return compact({ id: r.id, name: r.name, country: r.country, portCallId: opt(r.port_call_id), standfirst: r.standfirst, hero: media(r.hero, r.name) });
}

export interface SlotRow {
  experience_id: string;
  start_local: string;
  end_local: string | null;
  remaining: number;
}

export const toSlot = (s: SlotRow) => compact({ start: s.start_local, end: opt(s.end_local), remaining: s.remaining });

// ─── Concierge ─────────────────────────────────────────────────────────────

export const MESSAGE_COLUMNS = 'id, conversation_id, author, author_name, body, intent, classification, attachments, suggestions, created_at';

export interface MessageRow {
  id: string;
  conversation_id: string;
  author: ConciergeMessage['author'];
  author_name: string | null;
  body: string;
  intent: ConciergeMessage['intent'] | null;
  classification?: ConciergeMessage['classification'] | null;
  attachments: ConciergeMessage['attachments'] | null;
  suggestions: string[] | null;
  created_at: string;
}

export function toMessage(r: MessageRow): ConciergeMessage {
  return compact({
    id: r.id,
    conversationId: r.conversation_id,
    author: r.author,
    authorName: opt(r.author_name),
    body: r.body,
    createdAt: new Date(r.created_at).toISOString(),
    intent: opt(r.intent),
    classification: opt(r.classification ?? null),
    attachments: optList(r.attachments ?? undefined),
    suggestions: optList(r.suggestions ?? undefined),
  });
}

export const REQUEST_COLUMNS =
  'id, reservation_id, type, summary, details, status, priority, assigned_team, assigned_to_name, created_at, updated_at, next_update_by, experience_id, booking_id, category, guest_id, resolution_notes, acknowledged_at, started_at, resolved_at, closed_at, occasion_step';

export interface RequestRow {
  id: string;
  reservation_id: string;
  type: ServiceRequest['type'];
  summary: string;
  details: string | null;
  status: ServiceRequest['status'];
  priority: ServiceRequest['priority'];
  assigned_team: ServiceRequest['assignedTeam'];
  assigned_to_name: string | null;
  created_at: string;
  updated_at: string;
  next_update_by: string | null;
  experience_id: string | null;
  booking_id: string | null;
  category: NonNullable<ServiceRequest['category']>;
  guest_id: string | null;
  resolution_notes: string | null;
  acknowledged_at: string | null;
  started_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  occasion_step: string | null;
}

export function toRequest(r: RequestRow): ServiceRequest {
  return compact({
    id: r.id,
    reservationId: r.reservation_id,
    type: r.type,
    summary: r.summary,
    details: opt(r.details),
    status: r.status,
    priority: r.priority,
    assignedTeam: r.assigned_team,
    assignedTo: opt(r.assigned_to_name),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    nextUpdateBy: opt(r.next_update_by),
    experienceId: opt(r.experience_id),
    bookingId: opt(r.booking_id),
    category: r.category,
    guestId: opt(r.guest_id),
    resolutionNotes: opt(r.resolution_notes),
    acknowledgedAt: opt(r.acknowledged_at),
    startedAt: opt(r.started_at),
    resolvedAt: opt(r.resolved_at),
    closedAt: opt(r.closed_at),
    occasionStep: opt(r.occasion_step),
  });
}

// ─── Continuity ────────────────────────────────────────────────────────────

export const ALERT_COLUMNS = 'id, event_id, event_type, severity, title, body, handled, action_label, action_route, created_at, expires_at, acknowledged_at';

export interface AlertRow {
  id: string;
  event_id: string;
  event_type: string | null;
  reservation_id?: string;
  severity: JourneyAlert['severity'];
  title: string;
  body: string;
  handled: string | null;
  action_label: string | null;
  action_route: string | null;
  created_at: string;
  expires_at: string | null;
  acknowledged_at: string | null;
}

export function toAlert(r: AlertRow): JourneyAlert {
  return compact({
    id: r.id,
    eventId: r.event_id,
    severity: r.severity,
    title: r.title,
    body: r.body,
    handled: opt(r.handled),
    // Only in-app routes (also enforced by a check constraint).
    action: r.action_label && r.action_route?.startsWith('/') && !r.action_route.startsWith('//') ? { label: r.action_label, route: r.action_route } : undefined,
    createdAt: r.created_at,
    expiresAt: opt(r.expires_at),
    acknowledged: r.acknowledged_at !== null,
  });
}

export const NOTIFICATION_COLUMNS = 'id, guest_id, reservation_id, channel, category, title, body, deep_link, scheduled_for, delivered_at, read_at, bypass_quiet_hours, type, dedupe_key';

export interface NotificationRow {
  id: string;
  guest_id: string;
  reservation_id: string | null;
  channel: GuestNotification['channel'];
  category: GuestNotification['category'];
  title: string;
  body: string;
  deep_link: string | null;
  scheduled_for: string;
  delivered_at: string | null;
  read_at: string | null;
  bypass_quiet_hours: boolean;
  type?: GuestNotification['type'] | null;
  dedupe_key?: string | null;
}

export function toNotification(r: NotificationRow): GuestNotification {
  return compact({
    id: r.id,
    guestId: r.guest_id,
    reservationId: opt(r.reservation_id),
    channel: r.channel,
    category: r.category,
    title: r.title,
    body: r.body,
    deepLink: r.deep_link?.startsWith('/') && !r.deep_link.startsWith('//') ? r.deep_link : undefined,
    scheduledFor: r.scheduled_for,
    deliveredAt: opt(r.delivered_at),
    readAt: opt(r.read_at),
    bypassQuietHours: r.bypass_quiet_hours,
    type: opt(r.type ?? null),
    dedupeKey: opt(r.dedupe_key ?? null),
  });
}

// ─── Personalization ───────────────────────────────────────────────────────

export const RECOMMENDATION_COLUMNS = 'id, surface, kind, experience_id, title, rationale, score, drivers, audience, model_version, experience:experiences(category, sort_order)';

export interface RecommendationRow {
  id: string;
  surface: Recommendation['surface'];
  kind: Recommendation['kind'];
  experience_id: string | null;
  title: string;
  rationale: string;
  score: number;
  drivers: Recommendation['drivers'];
  audience: Recommendation['audience'];
  model_version: string;
  experience: { category: Recommendation['category']; sort_order: number } | null;
}

export function toRecommendation(r: RecommendationRow): Recommendation {
  return compact({
    id: r.id,
    surface: r.surface,
    kind: r.kind,
    experienceId: opt(r.experience_id),
    category: opt(r.experience?.category),
    title: r.title,
    rationale: r.rationale,
    score: Number(r.score),
    drivers: r.drivers ?? [],
    audience: r.audience,
  });
}
