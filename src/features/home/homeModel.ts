/**
 * Home dashboard view model.
 *
 * A pure function turns service results into exactly what each Home section
 * renders. It holds all journey-aware decisions (what counts as "next", which
 * reservation to surface, how to phrase the hero), so the UI components stay
 * presentational and this logic is testable without a device
 * (`scripts/check-home.ts`).
 */
import type {
  DaySchedule,
  Experience,
  ExperienceBooking,
  ExperienceCategory,
  FlightSegment,
  GuestProfile,
  JourneyAlert,
  JourneyPhase,
  LoyaltyRecognition,
  MediaAsset,
  Recommendation,
  VoyageOverview,
} from '@/domain';
import type { AppError } from '@/core/errors';
import { bookingStatus, type Settled, type Tone } from '@/features/shared/status';
import { daysUntil, formatDateRange, formatLongDate, formatTime, greeting, relativeDay } from '@/utils/format';

export { bookingStatus, type Settled, type Tone };

// ─── Inputs ────────────────────────────────────────────────────────────────

/** Required data: without it Home cannot render meaningfully. */
export interface HomeCoreData {
  overview: VoyageOverview;
  recognition: LoyaltyRecognition;
  profile: GuestProfile;
}


export interface HomeOptionalData {
  bookings: Settled<ExperienceBooking[]>;
  schedules: Settled<DaySchedule[]>;
  catalogue: Settled<Experience[]>;
  alerts: Settled<JourneyAlert[]>;
  recommendations: Settled<Recommendation[]>;
}

// ─── Output ────────────────────────────────────────────────────────────────


export interface JourneyStep {
  key: 'prepare' | 'travel' | 'embark' | 'sail' | 'home';
  label: string;
  state: 'done' | 'current' | 'upcoming';
}

export interface HeroModel {
  greeting: string;
  /** "Where am I?" in a few words, e.g. "Preparing for your voyage". */
  phaseLabel: string;
  headline: string;
  subline: string;
  /** Present before embarkation. */
  countdown?: { days: number; label: string };
  media: MediaAsset;
  steps: JourneyStep[];
}

export interface RecognitionModel {
  programme: string;
  tierLabel: string;
  lifetimeStatus?: string;
  line: string;
  privilegeCount: number;
  highlights: string[];
}

export interface FactModel {
  label: string;
  value: string;
}

export interface YachtModel {
  name: string;
  tagline: string;
  facts: FactModel[];
  media: MediaAsset;
}

export interface SuiteModel {
  title: string;
  location: string;
  facts: FactModel[];
  ambassador?: string;
  highlight?: string;
  media: MediaAsset;
}

export interface EmbarkationModel {
  dateLabel: string;
  windowLabel: string;
  terminal: string;
  address: string;
  timings: FactModel[];
  checkIn: { label: string; tone: Tone };
  notes: string[];
}

export interface TransferModel {
  /** Arrival at the yacht, or the journey home. */
  direction: 'arrival' | 'departure';
  title: string;
  whenLabel: string;
  venue: string;
  status: { label: string; tone: Tone };
  detail?: string;
  flight?: { label: string; status: string; tone: Tone };
}

export interface ActivityModel {
  id: string;
  /** "Next on your journey" / "Next today" / "Tomorrow". */
  heading: string;
  title: string;
  whenLabel: string;
  where: string;
  note?: string;
  category?: ExperienceCategory;
  status?: { label: string; tone: Tone };
}

export type ArrangedKind = 'dining' | 'shore' | 'spa';

export interface ArrangedModel {
  kind: ArrangedKind;
  label: string;
  /** Null when nothing is reserved in this category. */
  item: { title: string; whenLabel: string; venue: string; status: { label: string; tone: Tone }; note?: string } | null;
  /** Number of further reservations in the category. */
  more: number;
  emptyHint: string;
}

export interface RecommendationModel {
  id: string;
  title: string;
  rationale: string;
  eyebrow: string;
  media: MediaAsset;
}

export interface HomeViewModel {
  hero: HeroModel;
  recognition: RecognitionModel;
  yacht: YachtModel;
  suite: SuiteModel;
  /** Shown until the guest is aboard. */
  embarkation: EmbarkationModel | null;
  transfer: TransferModel | null;
  next: ActivityModel | null;
  /**
   * True when the next thing is the transfer shown in the arrival section;
   * Home then shows that richer card once, headed "Next on your journey".
   */
  nextIsArrival: boolean;
  arranged: ArrangedModel[];
  recommendations: RecommendationModel[];
  alerts: JourneyAlert[];
  concierge: { ambassador: string; prompt: string };
  /**
   * False when the data needed to know "what's next" failed to load. Home then
   * omits the section rather than wrongly saying nothing is planned.
   */
  nextKnown: boolean;
  /** Section-level failures; each section shows its own calm fallback. */
  errors: Partial<Record<'arranged' | 'alerts' | 'recommendations', AppError>>;
}

// ─── Builder ───────────────────────────────────────────────────────────────

const SHORE: ExperienceCategory[] = ['excursion', 'private', 'culture', 'wine'];
const STEP_ORDER: JourneyStep['key'][] = ['prepare', 'travel', 'embark', 'sail', 'home'];
const STEP_LABEL: Record<JourneyStep['key'], string> = { prepare: 'Prepare', travel: 'Travel', embark: 'Embark', sail: 'Sail', home: 'Home' };

function stepFor(phase: JourneyPhase): JourneyStep['key'] {
  switch (phase) {
    case 'dream':
    case 'book':
    case 'prepare':
      return 'prepare';
    case 'travel-to-embarkation':
      return 'travel';
    case 'embark':
      return 'embark';
    case 'sail':
    case 'explore':
      return 'sail';
    default:
      return 'home';
  }
}

const PHASE_LABEL: Record<JourneyPhase, string> = {
  dream: 'Dreaming of your next voyage',
  book: 'Your voyage is reserved',
  prepare: 'Preparing for your voyage',
  'travel-to-embarkation': 'On your way to the yacht',
  embark: 'Welcome aboard',
  sail: 'At sea with us',
  explore: 'Ashore today',
  'return-home': 'Travelling home',
  remember: 'Remembering your voyage',
  rebook: 'Your next horizon',
};

function flightStatus(f: FlightSegment): { status: string; tone: Tone } {
  switch (f.status) {
    case 'delayed':
      return { status: 'Delayed, and your driver knows', tone: 'pending' };
    case 'cancelled':
      return { status: 'Cancelled. We are rearranging', tone: 'attention' };
    case 'landed':
      return { status: 'Landed', tone: 'calm' };
    case 'departed':
      return { status: 'In the air', tone: 'calm' };
    default:
      return { status: f.trackedForTransfer ? 'On schedule and tracked' : 'On schedule', tone: 'calm' };
  }
}

const isUpcoming = (b: ExperienceBooking, now: Date) => Date.parse(b.end ?? b.start) >= now.getTime();

export function buildHomeViewModel(core: HomeCoreData, optional: HomeOptionalData, phase: JourneyPhase, now: Date): HomeViewModel {
  const { overview, recognition, profile } = core;
  const { voyage, yacht, suite, embarkation, reservation, flights } = overview;
  const firstName = profile.guest.preferredName ?? profile.guest.firstName;
  const step = stepFor(phase);
  const firstPort = voyage.itinerary[0];

  // ── Hero: where am I? ──
  const beforeEmbark = step === 'prepare' || step === 'travel';
  const days = daysUntil(embarkation.arrivalWindowStart, now);
  const todayPort = voyage.itinerary.find((p) => relativeDay(`${p.date}T12:00:00${embarkation.arrivalWindowStart.slice(-6)}`, now) === 'Today');
  const headline = beforeEmbark
    ? days > 1
      ? `${days} days until ${firstPort?.portName ?? 'your voyage'}`
      : days === 1
        ? `Tomorrow, ${firstPort?.portName ?? 'your voyage'}`
        : `Today, ${firstPort?.portName ?? 'your voyage'}`
    : step === 'home'
      ? 'Until we meet again'
      : todayPort
        ? `Day ${todayPort.day} · ${todayPort.portName}`
        : voyage.name;

  const hero: HeroModel = {
    greeting: `${greeting(now)}, ${firstName}`,
    phaseLabel: PHASE_LABEL[phase],
    headline,
    subline: `${voyage.name} · ${formatDateRange(voyage.startDate, voyage.endDate)}`,
    countdown: beforeEmbark ? { days, label: days === 1 ? 'day to go' : 'days to go' } : undefined,
    media: todayPort?.hero ?? voyage.hero,
    steps: STEP_ORDER.map((key, i) => ({
      key,
      label: STEP_LABEL[key],
      state: i < STEP_ORDER.indexOf(step) ? 'done' : key === step ? 'current' : 'upcoming',
    })),
  };

  // ── Recognition: quiet, status-first ──
  const recognitionModel: RecognitionModel = {
    programme: 'Marriott Bonvoy',
    tierLabel: recognition.membership.tierLabel,
    lifetimeStatus: recognition.membership.lifetimeStatus,
    line: recognition.recognitionLine,
    privilegeCount: recognition.privileges.length,
    highlights: recognition.privileges.slice(0, 2).map((p) => p.title),
  };

  // ── Yacht & suite ──
  const yachtModel: YachtModel = {
    name: yacht.name,
    tagline: yacht.tagline,
    facts: [
      { label: 'Guests', value: String(yacht.guestCapacity) },
      { label: 'Crew', value: String(yacht.crew) },
      { label: 'Length', value: `${yacht.lengthMeters} m` },
    ],
    media: yacht.hero,
  };
  const suiteModel: SuiteModel = {
    title: `${suite.name} ${suite.number}`,
    location: `Deck ${suite.deck}`,
    facts: [
      { label: 'Living', value: `${suite.areaSqm} m²` },
      ...(suite.terraceSqm ? [{ label: 'Terrace', value: `${suite.terraceSqm} m²` }] : []),
      { label: 'Deck', value: String(suite.deck) },
    ],
    ambassador: reservation.suiteAmbassador,
    highlight: suite.features[0],
    media: suite.hero,
  };

  // ── Embarkation (until aboard) ──
  const embarkationModel: EmbarkationModel | null = beforeEmbark || step === 'embark'
    ? {
        dateLabel: relativeDay(embarkation.arrivalWindowStart, now),
        windowLabel: `${formatTime(embarkation.arrivalWindowStart)} – ${formatTime(embarkation.arrivalWindowEnd)}`,
        terminal: embarkation.terminalName,
        address: embarkation.address,
        timings: [
          { label: 'Suite ready', value: formatTime(embarkation.suiteReadyAt) },
          { label: 'All aboard', value: formatTime(embarkation.allAboard) },
          { label: 'Sailing', value: formatTime(embarkation.departure) },
        ],
        checkIn:
          embarkation.checkInStatus === 'complete'
            ? { label: 'Check-in complete', tone: 'calm' }
            : embarkation.checkInStatus === 'in-progress'
              ? { label: 'Check-in nearly complete', tone: 'pending' }
              : { label: 'Check-in not started', tone: 'attention' },
        notes: embarkation.notes,
      }
    : null;

  // ── Bookings-derived sections ──
  const bookings = optional.bookings.ok ? optional.bookings.value : [];
  const upcoming = bookings.filter((b) => isUpcoming(b, now) && b.status !== 'cancelled').sort((a, b) => a.start.localeCompare(b.start));

  const transferBooking = upcoming.find((b) => b.category === 'transfer');
  const relatedFlight = transferBooking
    ? flights.find((f) => (f.direction === 'inbound' ? transferBooking.start.slice(0, 10) === f.arrival.slice(0, 10) : transferBooking.start.slice(0, 10) === f.departure.slice(0, 10)))
    : undefined;
  const isDeparture = !!transferBooking && (relatedFlight ? relatedFlight.direction === 'outbound' : transferBooking.start.slice(0, 10) === voyage.endDate);
  const transfer: TransferModel | null = transferBooking
    ? {
        direction: isDeparture ? 'departure' : 'arrival',
        title: transferBooking.title,
        whenLabel: `${relativeDay(transferBooking.start, now)} · ${formatTime(transferBooking.start)}`,
        venue: transferBooking.venue,
        status: bookingStatus(transferBooking),
        detail: transferBooking.note,
        flight: relatedFlight
          ? {
              label: `${relatedFlight.flightNumber} · ${relatedFlight.origin} → ${relatedFlight.destination}`,
              ...(({ status, tone }) => ({ status, tone }))(flightStatus(relatedFlight)),
            }
          : undefined,
      }
    : null;

  // ── What happens next? Prefer the next programme item today when sailing. ──
  const schedules = optional.schedules.ok ? optional.schedules.value : [];
  const nextScheduled = schedules
    .flatMap((d) => d.items)
    .filter((i) => Date.parse(i.start) >= now.getTime())
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const nextBooking = upcoming[0];
  const nextSource = !beforeEmbark && nextScheduled ? nextScheduled : undefined;
  let next: ActivityModel | null = null;
  if (nextSource) {
    const linked = nextSource.bookingId ? bookings.find((b) => b.id === nextSource.bookingId) : undefined;
    next = {
      id: nextSource.id,
      heading: relativeDay(nextSource.start, now) === 'Today' ? 'Next today' : 'Next on your journey',
      title: nextSource.title,
      whenLabel: `${relativeDay(nextSource.start, now)} · ${formatTime(nextSource.start)}`,
      where: nextSource.location,
      note: linked?.note,
      category: nextSource.category,
      status: linked ? bookingStatus(linked) : nextSource.kind === 'recommendation' ? { label: 'Suggested for you', tone: 'pending' } : undefined,
    };
  } else if (nextBooking) {
    next = {
      id: nextBooking.id,
      heading: 'Next on your journey',
      title: nextBooking.title,
      whenLabel: `${relativeDay(nextBooking.start, now)} · ${formatTime(nextBooking.start)}`,
      where: nextBooking.venue,
      note: nextBooking.note,
      category: nextBooking.category,
      status: bookingStatus(nextBooking),
    };
  }

  // ── What has been arranged for me? ──
  const ambassador = reservation.suiteAmbassador ?? 'your Suite Ambassador';
  const ambassadorFirst = ambassador.split(' ')[0] ?? ambassador;
  const arrangedFor = (kind: ArrangedKind, label: string, cats: ExperienceCategory[], emptyHint: string): ArrangedModel => {
    const list = upcoming.filter((b) => cats.includes(b.category));
    const first = list[0];
    return {
      kind,
      label,
      item: first
        ? {
            title: first.title,
            whenLabel: `${relativeDay(first.start, now)} · ${formatTime(first.start)}`,
            venue: first.venue,
            status: bookingStatus(first),
            note: first.note,
          }
        : null,
      more: Math.max(0, list.length - 1),
      emptyHint,
    };
  };
  const arranged = [
    arrangedFor('dining', 'Dining', ['dining'], `${ambassadorFirst} can reserve your window table.`),
    arrangedFor('shore', 'Ashore', SHORE, 'Private guides can be arranged in every port.'),
    arrangedFor('spa', 'Spa', ['spa'], 'Morning treatments open to you first.'),
  ];

  // ── What might I enjoy? ──
  const catalogue = optional.catalogue.ok ? optional.catalogue.value : [];
  const bookedExperienceIds = new Set(bookings.map((b) => b.experienceId));
  const recommendations: RecommendationModel[] = (optional.recommendations.ok ? optional.recommendations.value : [])
    .filter((r) => r.audience === 'guest')
    .filter((r) => !r.experienceId || !bookedExperienceIds.has(r.experienceId))
    .flatMap((r) => {
      const exp = r.experienceId ? catalogue.find((e) => e.id === r.experienceId) : undefined;
      if (!exp) return [];
      return [{ id: r.id, title: r.title, rationale: r.rationale, eyebrow: exp.destination ?? `Aboard ${yacht.name}`, media: exp.hero }];
    });

  // ── Concierge prompt, made personal ──
  const occasion = profile.occasions.find((o) => o.date >= voyage.startDate && o.date <= voyage.endDate && o.recognition !== 'private');
  const prompt = occasion
    ? `${ambassadorFirst} is quietly preparing for your ${occasion.label} on ${formatLongDate(occasion.date)}. Anything you’d like to add?`
    : `Anything you wish, before or during your voyage. ${ambassadorFirst} is a message away.`;

  return {
    hero,
    recognition: recognitionModel,
    yacht: yachtModel,
    suite: suiteModel,
    embarkation: embarkationModel,
    transfer,
    next,
    nextIsArrival: !!next && !!transferBooking && next.id === transferBooking.id,
    nextKnown: next !== null || (optional.bookings.ok && optional.schedules.ok),
    arranged,
    recommendations,
    alerts: (optional.alerts.ok ? optional.alerts.value : []).filter((a) => !a.expiresAt || Date.parse(a.expiresAt) > now.getTime()),
    concierge: { ambassador, prompt },
    errors: {
      ...(!optional.bookings.ok ? { arranged: optional.bookings.error } : {}),
      ...(!optional.alerts.ok ? { alerts: optional.alerts.error } : {}),
      ...(!optional.recommendations.ok ? { recommendations: optional.recommendations.error } : !optional.catalogue.ok ? { recommendations: optional.catalogue.error } : {}),
    },
  };
}
