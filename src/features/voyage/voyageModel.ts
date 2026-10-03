/**
 * Voyage area view model.
 *
 * One pure function turns service results into what each of the nine
 * Voyage sections renders. Components stay presentational; this logic is
 * tested without a device by `scripts/check-voyage.ts`.
 */
import type {
  CalendarDay,
  CalendarEntryKind,
  Experience,
  ExperienceBooking,
  ExperienceCategory,
  GuestProfile,
  MediaAsset,
  PortCall,
  Recommendation,
  TravelDocument,
  VoyageOverview,
} from '@/domain';
import type { AppError } from '@/core/errors';
import { bookingStatus, type Settled, type Tone } from '@/features/shared/status';
import {
  formatDateRange,
  formatLongDate,
  formatMoney,
  formatShortDate,
  formatTime,
  offsetDifferenceHours,
  relativeDay,
  utcOffsetLabel,
} from '@/utils/format';

// ─── Sections ──────────────────────────────────────────────────────────────

export const VOYAGE_SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'itinerary', label: 'Itinerary' },
  { key: 'suite', label: 'My Suite' },
  { key: 'embarkation', label: 'Embarkation' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'dining', label: 'Dining' },
  { key: 'spa', label: 'Spa' },
  { key: 'experiences', label: 'Experiences' },
  { key: 'documents', label: 'Documents' },
] as const;

export type VoyageSectionKey = (typeof VOYAGE_SECTIONS)[number]['key'];

export function parseSection(value: unknown): VoyageSectionKey {
  const v = Array.isArray(value) ? value[0] : value;
  return VOYAGE_SECTIONS.some((s) => s.key === v) ? (v as VoyageSectionKey) : 'overview';
}

// ─── Inputs ────────────────────────────────────────────────────────────────

export interface VoyageCoreData {
  overview: VoyageOverview;
  profile: GuestProfile;
}

export interface VoyageOptionalData {
  bookings: Settled<ExperienceBooking[]>;
  catalogue: Settled<Experience[]>;
  recommendations: Settled<Recommendation[]>;
  calendar: Settled<CalendarDay[]>;
}

// ─── Output ────────────────────────────────────────────────────────────────

export interface Fact {
  label: string;
  value: string;
  detail?: string;
}

export interface StatusModel {
  label: string;
  tone: Tone;
}

export interface BookingLine {
  id: string;
  title: string;
  whenLabel: string;
  venue: string;
  status: StatusModel;
  note?: string;
  partyLabel: string;
}

export interface SuggestionLine {
  id: string;
  title: string;
  subtitle: string;
  reason?: string;
  priceLabel: string;
  where: string;
}

export interface OverviewModel {
  media: MediaAsset;
  name: string;
  yachtName: string;
  dateRange: string;
  route: string;
  stats: Fact[];
  facts: Fact[];
  shortcuts: { section: VoyageSectionKey; label: string; detail: string; attention?: boolean }[];
}

export interface PortModel {
  id: string;
  day: number;
  dateLabel: string;
  name: string;
  country: string;
  typeLabel: string;
  summary: string;
  media: MediaAsset;
  times: Fact[];
  localTime: string;
  booked: BookingLine[];
  recommended: SuggestionLine[];
  isToday: boolean;
}

export interface SuiteSectionModel {
  title: string;
  categoryLabel: string;
  number: string;
  deck: string;
  media: MediaAsset;
  size: Fact[];
  amenities: string[];
  preferences: Fact[];
  ambassador: { name: string; title: string; availability: string; telephone?: string; languages: string; channels: string[] } | null;
}

export interface EmbarkationSectionModel {
  port: string;
  terminal: string;
  address: string;
  dateLabel: string;
  arrivalWindow: string;
  timings: Fact[];
  transfer: { title: string; whenLabel: string; venue: string; status: StatusModel; note?: string; flight?: string } | null;
  luggage: { summary: string; facts: Fact[] } | null;
  documents: { complete: number; total: number; outstanding: string[]; status: StatusModel };
  checkIn: { status: StatusModel; steps: { label: string; done: boolean }[] };
  notes: string[];
}

export interface CalendarEntryModel {
  id: string;
  kind: CalendarEntryKind;
  time: string;
  endTime?: string;
  title: string;
  location: string;
  status?: StatusModel;
  note?: string;
  suggestion: boolean;
}

export interface CalendarDayModel {
  date: string;
  heading: string;
  subheading: string;
  meta?: string;
  entries: CalendarEntryModel[];
  isToday: boolean;
}

export interface CategorySectionModel {
  title: string;
  intro: string;
  booked: { dayLabel: string; items: BookingLine[] }[];
  available: SuggestionLine[];
}

export interface DocumentLine {
  id: string;
  label: string;
  detail: string;
  status: StatusModel;
  needsAction: boolean;
}

export interface VoyageViewModel {
  overview: OverviewModel;
  itinerary: PortModel[];
  suite: SuiteSectionModel;
  embarkation: EmbarkationSectionModel;
  calendar: CalendarDayModel[];
  dining: CategorySectionModel;
  spa: CategorySectionModel;
  experiences: CategorySectionModel;
  documents: { summary: string; items: DocumentLine[] };
  errors: Partial<Record<'bookings' | 'calendar' | 'recommendations', AppError>>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const EXPERIENCE_CATEGORIES: ExperienceCategory[] = ['excursion', 'private', 'culture', 'wine', 'marina', 'entertainment', 'shopping', 'event'];

const PORT_TYPE: Record<PortCall['type'], string> = {
  embark: 'Embarkation',
  port: 'Alongside',
  tender: 'At anchor · by tender',
  overnight: 'Overnight',
  sea: 'At sea',
  disembark: 'Disembarkation',
};

const DOC_STATUS: Record<TravelDocument['status'], StatusModel> = {
  verified: { label: 'Complete', tone: 'calm' },
  submitted: { label: 'Under review', tone: 'pending' },
  required: { label: 'Required', tone: 'attention' },
  expired: { label: 'Expired', tone: 'attention' },
  'not-required': { label: 'Not required', tone: 'calm' },
};

function priceLabel(e: Experience): string {
  if (e.inclusive) return 'Included';
  return e.price ? `From ${formatMoney(e.price.amountMinor, e.price.currency)}` : 'On request';
}

function partyLabel(n: number): string {
  return n === 1 ? 'For one' : n === 2 ? 'For two' : `For ${n}`;
}

function bookingLine(b: ExperienceBooking, now: Date): BookingLine {
  return {
    id: b.id,
    title: b.title,
    whenLabel: `${relativeDay(b.start, now)} · ${formatTime(b.start)}${b.end ? ` – ${formatTime(b.end)}` : ''}`,
    venue: b.venue,
    status: bookingStatus(b),
    note: b.note,
    partyLabel: partyLabel(b.partySize),
  };
}

function groupByDay(bookings: ExperienceBooking[], now: Date): { dayLabel: string; items: BookingLine[] }[] {
  const groups = new Map<string, ExperienceBooking[]>();
  for (const b of [...bookings].sort((a, c) => a.start.localeCompare(c.start))) {
    const key = b.start.slice(0, 10);
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return [...groups.entries()].map(([, list]) => ({ dayLabel: relativeDay(list[0]!.start, now), items: list.map((b) => bookingLine(b, now)) }));
}

// ─── Builder ───────────────────────────────────────────────────────────────

export function buildVoyageViewModel(core: VoyageCoreData, optional: VoyageOptionalData, now: Date): VoyageViewModel {
  const { overview, profile } = core;
  const { voyage, yacht, suite, embarkation, reservation, documents, flights } = overview;
  const bookings = optional.bookings.ok ? optional.bookings.value.filter((b) => b.status !== 'cancelled') : [];
  const catalogue = optional.catalogue.ok ? optional.catalogue.value : [];
  const recommendations = optional.recommendations.ok ? optional.recommendations.value.filter((r) => r.audience === 'guest') : [];
  const expById = new Map(catalogue.map((e) => [e.id, e]));
  const bookedIds = new Set(bookings.map((b) => b.experienceId));
  const portOf = (b: ExperienceBooking) => expById.get(b.experienceId)?.portCallId ?? voyage.itinerary.find((p) => p.date === b.start.slice(0, 10))?.id;
  const homeRef = flights.find((f) => f.direction === 'inbound')?.departure;
  const homeCity = profile.guest.homeCity?.split(',')[0];
  const first = voyage.itinerary[0];
  const last = voyage.itinerary.at(-1);
  const route = [first?.portName, last?.portName.replace(/ \(.*\)$/, '')].filter(Boolean).join(' to ');
  const todayKey = (offsetIso: string) => relativeDay(offsetIso, now) === 'Today';

  // ── Documents ──
  const docLines: DocumentLine[] = documents.map((d) => ({
    id: d.id,
    label: d.label,
    detail: d.detail ?? (d.dueBy ? `Due by ${formatLongDate(d.dueBy)}` : DOC_STATUS[d.status].label),
    status: DOC_STATUS[d.status],
    needsAction: d.status === 'required' || d.status === 'expired',
  }));
  const complete = documents.filter((d) => d.status === 'verified' || d.status === 'not-required').length;
  const outstanding = docLines.filter((d) => d.needsAction);

  // ── Overview ──
  const ports = new Set(voyage.itinerary.filter((p) => p.type !== 'sea').map((p) => p.portName)).size;
  const overviewModel: OverviewModel = {
    media: voyage.hero,
    name: voyage.name,
    yachtName: yacht.name,
    dateRange: formatDateRange(voyage.startDate, voyage.endDate),
    route,
    stats: [
      { label: 'Nights', value: String(voyage.nights) },
      { label: 'Ports', value: String(ports) },
      { label: 'Reserved', value: String(bookings.length) },
    ],
    facts: [
      { label: 'Yacht', value: yacht.name, detail: yacht.tagline },
      { label: 'Suite', value: `${suite.name} ${suite.number}`, detail: `Deck ${suite.deck}` },
      { label: 'Ambassador', value: reservation.suiteAmbassador ?? 'To be assigned', detail: 'Aboard and ashore' },
      { label: 'Booking', value: reservation.bookingReference },
    ],
    shortcuts: [
      { section: 'itinerary', label: 'Itinerary', detail: `${voyage.itinerary.length} days, ${route}` },
      { section: 'suite', label: 'My Suite', detail: `${suite.name} ${suite.number} · Deck ${suite.deck}` },
      { section: 'embarkation', label: 'Embarkation', detail: `${formatLongDate(embarkation.arrivalWindowStart)}, ${formatTime(embarkation.arrivalWindowStart)}` },
      { section: 'calendar', label: 'Calendar', detail: 'Everything, in order' },
      { section: 'dining', label: 'Dining', detail: `${bookings.filter((b) => b.category === 'dining').length} reservations` },
      { section: 'spa', label: 'Spa', detail: `${bookings.filter((b) => b.category === 'spa').length} appointments` },
      { section: 'experiences', label: 'Experiences', detail: `${bookings.filter((b) => EXPERIENCE_CATEGORIES.includes(b.category)).length} arranged` },
      {
        section: 'documents',
        label: 'Documents',
        detail: outstanding.length ? `${outstanding.length} to complete` : 'All complete',
        attention: outstanding.length > 0,
      },
    ],
  };

  // ── Itinerary ──
  const itinerary: PortModel[] = voyage.itinerary.map((p) => {
    const offsetIso = p.arrival ?? p.departure ?? p.allAboard ?? `${p.date}T12:00:00${embarkation.arrivalWindowStart.slice(-6)}`;
    const diff = homeRef ? offsetDifferenceHours(offsetIso, homeRef) : 0;
    const booked = bookings.filter((b) => portOf(b) === p.id && b.category !== 'transfer').sort((a, b) => a.start.localeCompare(b.start));
    const recIds = new Set(recommendations.map((r) => r.experienceId));
    const recommended: SuggestionLine[] = [
      ...recommendations
        .map((r) => ({ r, e: r.experienceId ? expById.get(r.experienceId) : undefined }))
        // Port experiences on their day; experiences aboard on the sea day, when there is time for them.
        .filter(({ e }) => e && (e.portCallId === p.id || (!e.portCallId && p.type === 'sea')) && !bookedIds.has(e.id))
        .map(({ r, e }) => ({ id: r.id, title: e!.title, subtitle: e!.subtitle, reason: r.rationale, priceLabel: priceLabel(e!), where: e!.destination ?? `Aboard ${yacht.name}` })),
      // Private, unbooked experiences in this port also suit the guest's stated style.
      ...catalogue
        .filter((e) => e.portCallId === p.id && e.privateAvailable && !bookedIds.has(e.id) && !recIds.has(e.id) && e.category !== 'transfer')
        .slice(0, 1)
        .map((e) => ({ id: `cat_${e.id}`, title: e.title, subtitle: e.subtitle, reason: profile.preferences.excursions.style === 'private' ? 'Private, as you prefer.' : undefined, priceLabel: priceLabel(e), where: e.destination ?? p.portName })),
    ];
    return {
      id: p.id,
      day: p.day,
      dateLabel: formatLongDate(p.date),
      name: p.portName,
      country: p.country,
      typeLabel: PORT_TYPE[p.type],
      summary: p.summary,
      media: p.hero,
      times: [
        ...(p.arrival ? [{ label: 'Arrive', value: formatTime(p.arrival) }] : []),
        ...(p.allAboard ? [{ label: 'All aboard', value: formatTime(p.allAboard) }] : []),
        ...(p.departure ? [{ label: 'Depart', value: p.departure.slice(0, 10) === p.date ? formatTime(p.departure) : `${formatTime(p.departure)} +1` }] : []),
      ],
      localTime: `${utcOffsetLabel(offsetIso)}${diff ? ` · ${Math.abs(diff)} h ${diff > 0 ? 'ahead of' : 'behind'} ${homeCity ?? 'home'}` : ''}`,
      booked: booked.map((b) => bookingLine(b, now)),
      recommended,
      isToday: todayKey(offsetIso),
    };
  });

  // ── Suite ──
  const sp = profile.preferences.suite;
  const contact = reservation.suiteAmbassadorContact;
  const CHANNEL: Record<string, string> = { chat: 'Message in the app', 'suite-telephone': 'Suite telephone', 'in-person': 'In person' };
  const suiteModel: SuiteSectionModel = {
    title: `${suite.name} ${suite.number}`,
    categoryLabel: suite.name,
    number: suite.number,
    deck: `Deck ${suite.deck}`,
    media: suite.hero,
    size: [
      { label: 'Living', value: `${suite.areaSqm} m²` },
      ...(suite.terraceSqm ? [{ label: 'Terrace', value: `${suite.terraceSqm} m²` }] : []),
      { label: 'Deck', value: String(suite.deck) },
      { label: 'Suite', value: suite.number },
    ],
    amenities: suite.features,
    preferences: [
      ...(sp.pillow ? [{ label: 'Pillows', value: sp.pillow }] : []),
      ...(sp.bedConfiguration ? [{ label: 'Bed', value: sp.bedConfiguration === 'king' ? 'King' : 'Twin' }] : []),
      ...(sp.temperatureCelsius ? [{ label: 'Temperature', value: `${sp.temperatureCelsius} °C` }] : []),
      ...(sp.turndown ? [{ label: 'Turndown', value: sp.turndown }] : []),
      ...(sp.minibar?.length ? [{ label: 'Bar', value: sp.minibar.join(' · ') }] : []),
      ...(profile.preferences.beverage.welcomeAmenity ? [{ label: 'On arrival', value: profile.preferences.beverage.welcomeAmenity }] : []),
      ...(sp.newspapers?.length ? [{ label: 'Reading', value: sp.newspapers.join(' · ') }] : []),
    ],
    ambassador: contact
      ? {
          name: contact.name,
          title: contact.title,
          availability: contact.availability,
          telephone: contact.suiteTelephone,
          languages: contact.languages.join(', '),
          channels: contact.channels.map((c) => CHANNEL[c] ?? c),
        }
      : reservation.suiteAmbassador
        ? { name: reservation.suiteAmbassador, title: 'Suite Ambassador', availability: 'Aboard throughout your voyage', languages: '', channels: ['Message in the app'] }
        : null,
  };

  // ── Embarkation ──
  const arrivalTransfer = bookings.find((b) => b.category === 'transfer' && b.start.slice(0, 10) === voyage.startDate);
  const inbound = flights.find((f) => f.direction === 'inbound');
  const lug = embarkation.luggage;
  const CHECKIN: Record<typeof embarkation.checkInStatus, StatusModel> = {
    complete: { label: 'Check-in complete', tone: 'calm' },
    'in-progress': { label: 'Check-in nearly complete', tone: 'pending' },
    'not-started': { label: 'Check-in not started', tone: 'attention' },
  };
  const embarkationModel: EmbarkationSectionModel = {
    port: first?.portName ?? '',
    terminal: embarkation.terminalName,
    address: embarkation.address,
    dateLabel: relativeDay(embarkation.arrivalWindowStart, now),
    arrivalWindow: `${formatTime(embarkation.arrivalWindowStart)} – ${formatTime(embarkation.arrivalWindowEnd)}`,
    timings: [
      { label: 'Suite ready', value: formatTime(embarkation.suiteReadyAt) },
      { label: 'All aboard', value: formatTime(embarkation.allAboard) },
      { label: 'Sailing', value: formatTime(embarkation.departure) },
    ],
    transfer: arrivalTransfer
      ? {
          title: arrivalTransfer.title,
          whenLabel: `${relativeDay(arrivalTransfer.start, now)} · ${formatTime(arrivalTransfer.start)}`,
          venue: arrivalTransfer.venue,
          status: bookingStatus(arrivalTransfer),
          note: arrivalTransfer.note,
          flight: inbound ? `${inbound.flightNumber} lands ${formatTime(inbound.arrival)} · ${inbound.trackedForTransfer ? 'tracked by your driver' : 'not tracked'}` : undefined,
        }
      : null,
    luggage: lug
      ? {
          summary: lug.summary,
          facts: [
            ...(lug.pieces ? [{ label: 'Pieces', value: String(lug.pieces) }] : []),
            { label: 'Tags', value: lug.tags === 'e-tags-issued' ? 'Digital tags issued' : lug.tags === 'posted' ? 'Posted to you' : 'At the terminal' },
            ...(lug.deliveredBy ? [{ label: 'In your suite by', value: formatTime(lug.deliveredBy) }] : []),
          ],
        }
      : null,
    documents: {
      complete,
      total: documents.length,
      outstanding: outstanding.map((d) => d.label),
      status: outstanding.length ? { label: `${outstanding.length} to complete`, tone: 'attention' } : { label: 'All complete', tone: 'calm' },
    },
    checkIn: {
      status: CHECKIN[embarkation.checkInStatus],
      steps: [
        ...documents.map((d) => ({ label: d.label, done: d.status === 'verified' || d.status === 'not-required' })),
        { label: 'Arrival time chosen', done: true },
      ],
    },
    notes: embarkation.notes,
  };

  // ── Calendar ──
  const calendarDays = optional.calendar.ok ? optional.calendar.value : [];
  const calendar: CalendarDayModel[] = calendarDays.map((d) => ({
    date: d.date,
    heading: d.dayNumber ? `Day ${d.dayNumber} · ${d.title}` : d.title,
    subheading: formatLongDate(d.date),
    meta: [d.dressCode && `Dress: ${d.dressCode}`, d.sunset && `Sunset ${formatTime(d.sunset)}`].filter(Boolean).join(' · ') || undefined,
    entries: d.entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      time: formatTime(e.start),
      endTime: e.end && e.kind !== 'flight' ? formatTime(e.end) : e.kind === 'flight' && e.end ? `lands ${formatTime(e.end)}` : undefined,
      title: e.title,
      location: e.location,
      status: e.suggestion ? { label: 'Suggested for you', tone: 'pending' } : e.status ? bookingStatus({ status: e.status }) : undefined,
      note: e.note,
      suggestion: e.suggestion,
    })),
    isToday: relativeDay(`${d.date}T12:00:00${d.entries[0]?.start.slice(-6) ?? '+00:00'}`, now) === 'Today',
  }));

  // ── Category sections ──
  const ambassadorFirst = (reservation.suiteAmbassador ?? 'Your Suite Ambassador').split(' ')[0];
  const availableIn = (cats: ExperienceCategory[], limit = 4): SuggestionLine[] => {
    const recFor = new Map(recommendations.filter((r) => r.experienceId).map((r) => [r.experienceId!, r.rationale]));
    return catalogue
      .filter((e) => cats.includes(e.category) && !bookedIds.has(e.id))
      .sort((a, b) => Number(recFor.has(b.id)) - Number(recFor.has(a.id)))
      .slice(0, limit)
      .map((e) => ({
        id: e.id,
        title: e.title,
        subtitle: e.subtitle,
        reason: recFor.get(e.id),
        priceLabel: priceLabel(e),
        where: e.destination ?? `Aboard ${yacht.name}`,
      }));
  };
  const dp = profile.preferences.dining;
  const dining: CategorySectionModel = {
    title: 'Dining',
    intro: [dp.tablePreference === 'window' ? 'Your window table is held each evening.' : '', dp.notes ?? ''].filter(Boolean).join(' '),
    booked: groupByDay(bookings.filter((b) => b.category === 'dining'), now),
    available: availableIn(['dining']),
  };
  const spaPref = profile.preferences.spa;
  const spa: CategorySectionModel = {
    title: 'Spa',
    intro: [spaPref.pressure && `${spaPref.pressure[0]!.toUpperCase()}${spaPref.pressure.slice(1)} pressure`, spaPref.preferredTime && `${spaPref.preferredTime} appointments`, spaPref.notes].filter(Boolean).join(' · '),
    booked: groupByDay(bookings.filter((b) => b.category === 'spa'), now),
    available: availableIn(['spa']),
  };
  const experiences: CategorySectionModel = {
    title: 'Experiences',
    intro: profile.preferences.excursions.notes ?? `${ambassadorFirst} can arrange private guides in every port.`,
    booked: groupByDay(bookings.filter((b) => EXPERIENCE_CATEGORIES.includes(b.category)), now),
    available: availableIn(EXPERIENCE_CATEGORIES),
  };

  return {
    overview: overviewModel,
    itinerary,
    suite: suiteModel,
    embarkation: embarkationModel,
    calendar,
    dining,
    spa,
    experiences,
    documents: {
      summary: outstanding.length
        ? `${complete} of ${documents.length} complete. ${outstanding.length === 1 ? 'One item remains' : `${outstanding.length} items remain`}${documents.find((d) => d.status === 'required')?.dueBy ? `, due by ${formatShortDate(documents.find((d) => d.status === 'required')!.dueBy!)}` : ''}.`
        : 'Everything is complete. Nothing more is needed.',
      items: docLines,
    },
    errors: {
      ...(!optional.bookings.ok ? { bookings: optional.bookings.error } : {}),
      ...(!optional.calendar.ok ? { calendar: optional.calendar.error } : {}),
      ...(!optional.recommendations.ok ? { recommendations: optional.recommendations.error } : {}),
    },
  };
}
