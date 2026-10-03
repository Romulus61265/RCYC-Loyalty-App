/**
 * What the mock concierge knows when it answers: the guest's voyage,
 * bookings, programme, preferences, recognition, requests and availability,
 * loaded through the same services the app uses. In production the AI
 * platform reaches the same facts through tools scoped to the guest.
 *
 * Also holds the time rules: "today" and "tomorrow" are judged where the
 * guest is (home before and after the voyage, aboard during it).
 */
import type {
  DaySchedule,
  Experience,
  ExperienceAvailability,
  ExperienceBooking,
  GuestProfile,
  ID,
  LoyaltyRecognition,
  PortCall,
  Recommendation,
  ServiceRequest,
  VoyageOverview,
} from '@/domain';
import type { ExperienceService, GuestProfileService, LoyaltyService, PersonalizationService, VoyageService } from '@/services/contracts';

export interface ConciergeSnapshot {
  now: Date;
  overview: VoyageOverview;
  profile: GuestProfile;
  recognition: LoyaltyRecognition;
  bookings: ExperienceBooking[];
  days: DaySchedule[];
  catalogue: Experience[];
  availability: ExperienceAvailability[];
  requests: ServiceRequest[];
  /** Personalised ranking with reasons; empty when the guest has switched personalisation off. */
  recommendations: Recommendation[];
  /** Names used in replies. */
  ambassador: { name: string; title: string; firstName: string };
  team: Record<'shoreside' | 'aboard' | 'medical', { name: string; title: string }>;
}

export interface SnapshotSources {
  voyage: VoyageService;
  experience: ExperienceService;
  loyalty: LoyaltyService;
  profile: GuestProfileService;
  personalization: PersonalizationService;
  requests: (reservationId: ID) => Promise<ServiceRequest[]>;
  team: ConciergeSnapshot['team'];
}

export async function loadSnapshot(src: SnapshotSources, reservationId: ID, now: Date): Promise<ConciergeSnapshot> {
  const overview = await src.voyage.getOverview(reservationId);
  const guestId = overview.reservation.leadGuestId;
  const voyageId = overview.voyage.id;
  const [profile, recognition, bookings, days, catalogue, availability, requests] = await Promise.all([
    src.profile.getProfile(guestId),
    src.loyalty.getRecognition(guestId, voyageId),
    src.experience.listBookings(reservationId).catch(() => []),
    src.experience.listDaySchedules(reservationId).catch(() => []),
    src.experience.listCatalogue(voyageId),
    src.experience.listAvailability(voyageId).catch(() => []),
    src.requests(reservationId),
  ]);
  // The full ranked list (Discover's), so every experience can carry its reason.
  const recommendations = profile.preferences.privacy.personalisedRecommendations
    ? await src.personalization.getRecommendations(guestId, 'discover', { reservationId, limit: 100 }).catch(() => [])
    : [];
  const contact = overview.reservation.suiteAmbassadorContact;
  const name = contact?.name ?? overview.reservation.suiteAmbassador ?? 'your Suite Ambassador';
  return {
    now,
    overview,
    profile,
    recognition,
    bookings,
    days,
    catalogue,
    availability,
    requests,
    recommendations,
    ambassador: { name, title: contact?.title ?? 'Suite Ambassador', firstName: name.split(' ')[0] ?? name },
    team: src.team,
  };
}

// ─── Time ──────────────────────────────────────────────────────────────────

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** "+02:00" → 120. */
export function offsetOf(iso: string): number {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(iso);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/** Where the guest is at `now`: aboard during the voyage window, home otherwise. */
export function guestOffset(s: Pick<ConciergeSnapshot, 'overview'>, now: Date): number {
  const { embarkation, voyage, flights } = s.overview;
  const ship = offsetOf(embarkation.arrivalWindowStart);
  const home = offsetOf(flights.find((f) => f.direction === 'inbound')?.departure ?? embarkation.arrivalWindowStart);
  const last = voyage.itinerary[voyage.itinerary.length - 1];
  const start = Date.parse(embarkation.arrivalWindowStart) - 12 * HOUR;
  const end = Date.parse(last?.arrival ?? `${voyage.endDate}T12:00:00Z`) + 6 * HOUR;
  return now.getTime() >= start && now.getTime() <= end ? ship : home;
}

/** Local calendar date where the guest is, `plusDays` from now. */
export function localDate(s: Pick<ConciergeSnapshot, 'overview'>, now: Date, plusDays = 0): string {
  return new Date(now.getTime() + guestOffset(s, now) * 60_000 + plusDays * DAY).toISOString().slice(0, 10);
}

/** ISO for a local wall-clock time on a date, with an offset in minutes. */
export function atLocal(date: string, time: string, offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  return `${date}T${time}:00${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** An instant as ISO with a given offset, e.g. for "next update by" in the guest's local time. */
export function isoAt(ms: number, offsetMinutes: number): string {
  return atLocal(new Date(ms + offsetMinutes * 60_000).toISOString().slice(0, 10), new Date(ms + offsetMinutes * 60_000).toISOString().slice(11, 16), offsetMinutes);
}

export const portOn = (s: ConciergeSnapshot, date: string): PortCall | undefined => s.overview.voyage.itinerary.find((p) => p.date === date);
export const dayOn = (s: ConciergeSnapshot, date: string): DaySchedule | undefined => s.days.find((d) => d.date === date);
export const bookingsOn = (s: ConciergeSnapshot, date: string) => s.bookings.filter((b) => b.start.slice(0, 10) === date && b.status !== 'cancelled' && b.status !== 'declined');
export const experienceById = (s: ConciergeSnapshot, id: ID | undefined) => (id ? s.catalogue.find((e) => e.id === id) : undefined);

/** Busy interval of a booking (an evening booking without an end lasts about two and a half hours). */
export function busy(b: Pick<ExperienceBooking, 'start' | 'end'>): [number, number] {
  const start = Date.parse(b.start);
  return [start, b.end ? Date.parse(b.end) : start + 2.5 * HOUR];
}

export function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/**
 * Places a party needs in a slot: a private experience is one appointment
 * whatever the party size; anything shared needs a place per guest.
 */
export function placesNeeded(exp: Pick<Experience, 'format'> | undefined, partySize: number): number {
  return exp?.format === 'private' ? 1 : partySize;
}

/** Slots on a date with room for the party, that don't clash with anything booked. */
export function freeSlots(s: ConciergeSnapshot, experienceId: ID, date: string, partySize: number) {
  const exp = experienceById(s, experienceId);
  const taken = bookingsOn(s, date).map(busy);
  const need = placesNeeded(exp, partySize);
  return (s.availability.find((a) => a.experienceId === experienceId)?.slots ?? [])
    .filter((slot) => slot.start.slice(0, 10) === date && slot.remaining >= need && Date.parse(slot.start) > s.now.getTime())
    .filter((slot) => {
      const start = Date.parse(slot.start);
      const end = slot.end ? Date.parse(slot.end) : start + (exp?.durationMinutes ?? 90) * 60_000;
      return !taken.some((t) => overlaps([start, end], t));
    });
}

/** How many of the party an experience is for: one for an individual spa treatment, else the party. */
export function partyFor(s: ConciergeSnapshot, exp: Experience): number {
  const party = s.overview.reservation.partyGuestIds.length || 1;
  if ((exp.category === 'spa' || exp.category === 'wellness') && exp.format === 'private' && !exp.tags.includes('couples')) return 1;
  return Math.min(party, exp.capacity ?? party);
}

export const companionName = (s: ConciergeSnapshot) => s.profile.companions[0]?.firstName;
export const guestName = (s: ConciergeSnapshot) => s.profile.guest.preferredName ?? s.profile.guest.firstName;
