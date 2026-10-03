/**
 * Discover marketplace view model.
 *
 * Pure functions: `buildDiscoverModel` turns service data into cards and
 * filter options; `applyDiscoverFilters` narrows them. The screen only keeps
 * which filters are selected. Tested by `scripts/check-discover.ts`.
 */
import type {
  AvailabilityStatus,
  Destination,
  Experience,
  ExperienceAvailability,
  ExperienceBooking,
  ExperienceCategory,
  GuestProfile,
  MediaAsset,
  Recommendation,
  VoyageOverview,
} from '@/domain';
import type { AppError } from '@/core/errors';
import { bookingStatus, type Settled, type Tone } from '@/features/shared/status';
import { formatLongDate, formatMoney, formatShortDate, formatTime } from '@/utils/format';

// ─── Categories ────────────────────────────────────────────────────────────

export const DISCOVER_CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'private', label: 'Private Experiences' },
  { key: 'destinations', label: 'Destinations' },
  { key: 'dining', label: 'Dining' },
  { key: 'wine', label: 'Wine' },
  { key: 'wellness', label: 'Wellness' },
  { key: 'spa', label: 'Spa' },
  { key: 'marina', label: 'Marina' },
  { key: 'culture', label: 'Culture' },
  { key: 'shopping', label: 'Shopping' },
  { key: 'transport', label: 'Transportation' },
] as const;

export type DiscoverCategoryKey = (typeof DISCOVER_CATEGORIES)[number]['key'];

const PRIVATE_LENS: ExperienceCategory[] = ['private', 'culture', 'wine', 'excursion', 'wellness', 'shopping', 'marina'];

/** Which marketplace categories an experience belongs to. */
export function categoriesOf(e: Experience): DiscoverCategoryKey[] {
  const out: DiscoverCategoryKey[] = [];
  if (e.format === 'private' && PRIVATE_LENS.includes(e.category)) out.push('private');
  switch (e.category) {
    case 'dining':
      out.push('dining');
      break;
    case 'wine':
      out.push('wine');
      break;
    case 'wellness':
      out.push('wellness');
      break;
    case 'spa':
      out.push('spa');
      break;
    case 'marina':
      out.push('marina');
      break;
    case 'culture':
    case 'excursion':
    case 'entertainment':
    case 'event':
      out.push('culture');
      break;
    case 'shopping':
      out.push('shopping');
      break;
    case 'transfer':
      out.push('transport');
      break;
    case 'private':
      // Private yachting moments also belong with the marina.
      if (e.tags.some((t) => t === 'yachting' || t === 'boat' || t === 'sailing')) out.push('marina');
      break;
  }
  return out;
}

// ─── Interests ─────────────────────────────────────────────────────────────

export const INTERESTS = [
  { key: 'fine-dining', label: 'Fine dining', tags: ['fine-dining', 'tasting', 'chef'], match: /fine dining/i },
  { key: 'wine', label: 'Wine', tags: ['wine', 'red-wine'], match: /^wine/i },
  { key: 'culture', label: 'Culture', tags: ['culture', 'architecture', 'art', 'gardens', 'history'], match: /cultur/i },
  { key: 'wellbeing', label: 'Spa & wellbeing', tags: ['spa', 'massage', 'thalassotherapy', 'wellness', 'yoga'], match: /spa/i },
  { key: 'yachting', label: 'Yachting', tags: ['yachting', 'sailing', 'boat', 'swimming'], match: /yacht|sail/i },
] as const;

export type InterestKey = (typeof INTERESTS)[number]['key'];

// ─── Filters ───────────────────────────────────────────────────────────────

export interface DiscoverFilters {
  category: DiscoverCategoryKey;
  /** Port name, 'aboard', or 'all'. */
  port: string;
  /** ISO date or 'all'. */
  date: string;
  interests: InterestKey[];
  privateOnly: boolean;
  /** 'open' hides waitlist and fully booked. */
  availability: 'any' | 'open';
}

export const DEFAULT_FILTERS: DiscoverFilters = { category: 'all', port: 'all', date: 'all', interests: [], privateOnly: false, availability: 'any' };

/** Number of refinements applied beyond the category. */
export function activeFilterCount(f: DiscoverFilters): number {
  return Number(f.port !== 'all') + Number(f.date !== 'all') + f.interests.length + Number(f.privateOnly) + Number(f.availability !== 'any');
}

// ─── Inputs / output ───────────────────────────────────────────────────────

export interface DiscoverCoreData {
  overview: VoyageOverview;
  profile: GuestProfile;
  catalogue: Experience[];
  destinations: Destination[];
}

export interface DiscoverOptionalData {
  availability: Settled<ExperienceAvailability[]>;
  bookings: Settled<ExperienceBooking[]>;
  recommendations: Settled<Recommendation[]>;
}

export interface StatusModel {
  label: string;
  tone: Tone;
}

export interface ExperienceCardModel {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  destination: string;
  categoryLabel: string;
  categories: DiscoverCategoryKey[];
  durationLabel: string;
  availability: StatusModel & { detail?: string; nextTimes: string[]; status: AvailabilityStatus | 'unknown' };
  priceLabel: string;
  inclusionLabel: string;
  includes: string[];
  formatLabel: string;
  isPrivate: boolean;
  recommendation?: { reason: string; score: number };
  media: MediaAsset;
  reservation: StatusModel & { detail?: string; reserved: boolean };
  /** For filtering. */
  portKey: string;
  dates: string[];
  tags: string[];
}

export interface DestinationCardModel {
  id: string;
  name: string;
  country: string;
  standfirst: string;
  dateLabel: string;
  portKey: string;
  experienceCount: number;
  reservedCount: number;
  media: MediaAsset;
}

export interface FilterOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
}

export interface DiscoverModel {
  title: string;
  subtitle: string;
  cards: ExperienceCardModel[];
  recommended: ExperienceCardModel[];
  destinations: DestinationCardModel[];
  options: {
    ports: FilterOption[];
    dates: FilterOption[];
    interests: (FilterOption<InterestKey> & { yours: boolean })[];
  };
  errors: Partial<Record<'availability' | 'bookings' | 'recommendations', AppError>>;
}

// ─── Builder ───────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<ExperienceCategory, string> = {
  dining: 'Dining',
  spa: 'Spa',
  wellness: 'Wellness',
  excursion: 'Excursion',
  marina: 'Marina',
  entertainment: 'Evenings',
  transfer: 'Transportation',
  private: 'Private experience',
  wine: 'Wine',
  shopping: 'Shopping',
  culture: 'Culture',
  event: 'Event',
};

const AVAILABILITY: Record<AvailabilityStatus, StatusModel> = {
  available: { label: 'Available', tone: 'calm' },
  limited: { label: 'Limited availability', tone: 'pending' },
  waitlist: { label: 'Waitlist', tone: 'pending' },
  unavailable: { label: 'Fully booked', tone: 'attention' },
};

export function durationLabel(e: Experience): string {
  const m = e.durationMinutes;
  if (!m) return e.category === 'dining' ? 'An evening' : e.category === 'entertainment' ? 'Nightly' : 'At your pace';
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : h === 1 ? '1 hour' : `${h} hours`;
}

export function formatLabel(e: Experience): string {
  switch (e.format) {
    case 'private':
      return 'Private, for your party';
    case 'small-group':
      return e.capacity ? `Small group, up to ${e.capacity}` : 'Small group';
    case 'shared':
      return 'Shared with fellow guests';
    default:
      return e.capacity ? `Private, or a small group up to ${e.capacity}` : 'Private or small group';
  }
}

export function buildDiscoverModel(core: DiscoverCoreData, optional: DiscoverOptionalData, now: Date): DiscoverModel {
  const { overview, profile, catalogue, destinations } = core;
  const { voyage, yacht } = overview;
  const itinerary = voyage.itinerary;
  const availability = optional.availability.ok ? new Map(optional.availability.value.map((a) => [a.experienceId, a])) : new Map<string, ExperienceAvailability>();
  const bookings = optional.bookings.ok ? optional.bookings.value.filter((b) => b.status !== 'cancelled') : [];
  // Respect the guest's privacy choice: no personalised reasons when switched off.
  const personalised = profile.preferences.privacy?.personalisedRecommendations !== false;
  const recs = optional.recommendations.ok && personalised ? new Map(optional.recommendations.value.filter((r) => r.audience === 'guest' && r.experienceId).map((r) => [r.experienceId!, r])) : new Map<string, Recommendation>();
  const portById = new Map(itinerary.map((p) => [p.id, p]));

  const cards: ExperienceCardModel[] = catalogue.map((e) => {
    const port = e.portCallId ? portById.get(e.portCallId) : undefined;
    const avail = availability.get(e.id);
    const futureSlots = (avail?.slots ?? []).filter((s) => Date.parse(s.start) >= now.getTime());
    const openSlots = futureSlots.filter((s) => s.remaining > 0);
    const booking = bookings.find((b) => b.experienceId === e.id);
    const rec = recs.get(e.id);
    const dates = [...new Set((avail?.slots ?? []).map((s) => s.start.slice(0, 10)).concat(port ? [port.date] : []))].sort();
    const status = avail?.status;

    const reservation: ExperienceCardModel['reservation'] = booking
      ? {
          ...bookingStatus(booking),
          label: booking.status === 'confirmed' ? 'Reserved' : bookingStatus(booking).label,
          detail: `${formatLongDate(booking.start)} · ${formatTime(booking.start)}`,
          reserved: true,
        }
      : status === 'unavailable'
        ? { label: 'Ask your concierge', tone: 'pending', detail: 'We may still be able to arrange it', reserved: false }
        : status === 'waitlist'
          ? { label: 'On request', tone: 'pending', reserved: false }
          : { label: e.inclusive ? 'Not yet reserved' : 'Available to request', tone: 'pending', reserved: false };

    return {
      id: e.id,
      title: e.title,
      subtitle: e.subtitle,
      description: e.description,
      destination: e.destination ?? port?.portName ?? `Aboard ${yacht.name}`,
      categoryLabel: CATEGORY_LABEL[e.category],
      categories: categoriesOf(e),
      durationLabel: durationLabel(e),
      availability: {
        ...(status ? AVAILABILITY[status] : { label: 'Availability on request', tone: 'pending' as Tone }),
        status: status ?? 'unknown',
        detail: avail?.note,
        nextTimes: openSlots.slice(0, 3).map((s) => `${formatShortDate(s.start)}, ${formatTime(s.start)}`),
      },
      priceLabel: e.inclusive ? 'Included' : e.price ? `From ${formatMoney(e.price.amountMinor, e.price.currency)}` : 'Price on request',
      inclusionLabel: e.inclusive ? 'Included in your voyage' : 'At additional cost',
      includes: e.includes ?? [],
      formatLabel: formatLabel(e),
      isPrivate: e.format === 'private' || e.format === 'private-or-group',
      recommendation: rec ? { reason: rec.rationale, score: rec.score } : undefined,
      media: e.hero,
      reservation,
      portKey: port?.portName ?? 'aboard',
      dates,
      tags: e.tags,
    };
  });

  // Recommended first, then what's open, then alphabetical.
  const rank = (c: ExperienceCardModel) => (c.recommendation?.score ?? 0) + (c.availability.status === 'unavailable' ? -0.5 : 0);
  cards.sort((a, b) => rank(b) - rank(a) || a.title.localeCompare(b.title));

  const recommended = cards
    .filter((c) => c.recommendation && !c.reservation.reserved && c.availability.status !== 'unavailable' && !c.categories.includes('transport'))
    .slice(0, 6);

  // Filter options.
  const portNames = [...new Set(itinerary.filter((p) => p.type !== 'sea').map((p) => p.portName))];
  const ports: FilterOption[] = [
    { value: 'all', label: 'All ports' },
    ...portNames.map((n) => {
      const days = itinerary.filter((p) => p.portName === n);
      return { value: n, label: n.replace(/ \(.*\)$/, ''), hint: days.map((d) => formatShortDate(d.date)).join(', ') };
    }),
    { value: 'aboard', label: `Aboard ${yacht.name}` },
  ];
  const dates: FilterOption[] = [
    { value: 'all', label: 'Any day' },
    ...itinerary.map((p) => ({ value: p.date, label: formatShortDate(p.date), hint: p.type === 'sea' ? 'At sea' : p.portName.replace(/ \(.*\)$/, '') })),
  ];
  const interests = INTERESTS.map((i) => ({ value: i.key, label: i.label, yours: profile.preferences.activityInterests.some((a) => i.match.test(a)) }));

  const destinationCards: DestinationCardModel[] = destinations.map((d) => {
    const port = d.portCallId ? portById.get(d.portCallId) : undefined;
    const name = port?.portName ?? d.name;
    const here = cards.filter((c) => c.portKey === name && !c.categories.includes('transport'));
    const days = itinerary.filter((p) => p.portName === name);
    return {
      id: d.id,
      name: d.name,
      country: d.country,
      standfirst: d.standfirst,
      dateLabel: days.map((p) => `Day ${p.day}`).join(' & ') + (days[0] ? ` · ${formatShortDate(days[0].date)}` : ''),
      portKey: name,
      experienceCount: here.length,
      reservedCount: here.filter((c) => c.reservation.reserved).length,
      media: d.hero,
    };
  });

  return {
    title: `${voyage.name}, curated`,
    subtitle: `${portNames.length} ports and your yacht. Chosen moments, arranged around you.`,
    cards,
    recommended,
    destinations: destinationCards,
    options: { ports, dates, interests },
    errors: {
      ...(!optional.availability.ok ? { availability: optional.availability.error } : {}),
      ...(!optional.bookings.ok ? { bookings: optional.bookings.error } : {}),
      ...(!optional.recommendations.ok ? { recommendations: optional.recommendations.error } : {}),
    },
  };
}

export function applyDiscoverFilters(cards: ExperienceCardModel[], f: DiscoverFilters): ExperienceCardModel[] {
  const interestTags = new Set(INTERESTS.filter((i) => f.interests.includes(i.key)).flatMap((i) => i.tags as readonly string[]));
  return cards.filter(
    (c) =>
      (f.category === 'all' || f.category === 'destinations' || c.categories.includes(f.category)) &&
      (f.port === 'all' || c.portKey === f.port) &&
      (f.date === 'all' || c.dates.includes(f.date)) &&
      (interestTags.size === 0 || c.tags.some((t) => interestTags.has(t))) &&
      (!f.privateOnly || c.isPrivate) &&
      (f.availability === 'any' || c.availability.status === 'available' || c.availability.status === 'limited' || c.reservation.reserved),
  );
}
