/**
 * The post-voyage recap: rules over the voyage's own data. Pure.
 *
 * Only what took place becomes a memory: a booking that is completed, or
 * still confirmed (or being arranged) once its time has passed. The source
 * systems mark completion; the mock never does. Private occasions are never
 * mentioned. Nothing here is invented: no points, no miles, no photographs.
 */
import type {
  CrewToThank,
  Destination,
  Experience,
  ExperienceBooking,
  GuestPreferences,
  GuestServiceRequest,
  JourneyPhase,
  LoyaltyMembership,
  RecapDay,
  RecapDestination,
  RecapMemory,
  SpecialOccasion,
  Voyage,
  VoyageFeedback,
  VoyageInspiration,
  VoyageRecap,
  VoyageRecommendation,
} from '@/domain';
import { formatDateRange, formatLongDate, formatShortDate } from '@/utils/format';

export const POST_VOYAGE_PHASES: JourneyPhase[] = ['return-home', 'remember', 'rebook'];
export const isVoyageComplete = (phase: JourneyPhase) => POST_VOYAGE_PHASES.includes(phase);

export interface RecapInput {
  now: Date;
  guest: { id: string; firstName: string; companions: string[] };
  occasions: SpecialOccasion[];
  voyage: Voyage;
  yachtName: string;
  suite: string;
  reservationId: string;
  ambassador: { name: string; firstName: string; title: string };
  bookings: ExperienceBooking[];
  catalogue: Experience[];
  destinations: Destination[];
  requests: GuestServiceRequest[];
  membership: LoyaltyMembership | null;
  pastVoyages: Pick<Voyage, 'region' | 'endDate'>[];
  preferences: Pick<GuestPreferences, 'activityInterests' | 'preferredDestinations' | 'dining' | 'excursions'>;
  inspirations: VoyageInspiration[];
  feedback: VoyageFeedback;
}

/** Took place: completed, or confirmed (or being arranged) and over. */
export function happened(b: ExperienceBooking, now: Date): boolean {
  if (b.status === 'completed') return true;
  return (b.status === 'confirmed' || b.status === 'in_progress') && Date.parse(b.end ?? b.start) < now.getTime();
}

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen'];
const words = (n: number) => NUMBER_WORDS[n] ?? String(n);
const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

function memoriesOf(input: RecapInput): RecapMemory[] {
  const { now, catalogue } = input;
  const out: RecapMemory[] = [];
  const places = new Map(input.voyage.itinerary.map((p) => [p.date, p.type === 'sea' ? 'at sea' : p.portName]));
  for (const o of input.occasions) {
    if (o.recognition === 'private' || o.date < input.voyage.startDate || o.date > input.voyage.endDate) continue;
    const place = places.get(o.date);
    out.push({
      id: `occasion:${o.id}`,
      kind: 'occasion',
      title: o.label.charAt(0).toUpperCase() + o.label.slice(1),
      line: [place && place !== 'at sea' ? `In ${place}` : place === 'at sea' ? 'At sea' : '', input.guest.companions.length ? `with ${input.guest.companions.join(' and ')}` : ''].filter(Boolean).join(', ') || formatLongDate(o.date),
      date: o.date,
    });
  }
  for (const b of input.bookings) {
    if (b.category === 'transfer' || !happened(b, now)) continue;
    const x = catalogue.find((e) => e.id === b.experienceId);
    out.push({
      id: `booking:${b.id}`,
      kind: b.category === 'dining' ? 'dining' : 'experience',
      title: b.title,
      line: x?.subtitle ?? b.venue.split(',')[0] ?? b.venue,
      date: b.start.slice(0, 10),
      time: b.start.slice(11, 16),
      experienceId: b.experienceId,
    });
  }
  // Occasions first on their day, then in the order they happened.
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'occasion' ? -1 : b.kind === 'occasion' ? 1 : (a.time ?? '').localeCompare(b.time ?? '')));
}

function daysOf(input: RecapInput, memories: RecapMemory[]): RecapDay[] {
  return input.voyage.itinerary.map((p) => ({
    dayNumber: p.day,
    date: p.date,
    place: p.type === 'sea' ? 'At sea' : p.portName,
    memories: memories.filter((m) => m.date === p.date),
  }));
}

function destinationsOf(input: RecapInput): RecapDestination[] {
  const out: (RecapDestination & { dates: string[] })[] = [];
  for (const p of input.voyage.itinerary) {
    if (p.type === 'sea') continue;
    const seen = out.find((d) => d.portName === p.portName);
    if (seen) {
      seen.dates.push(p.date);
      continue;
    }
    const standfirst = input.destinations.find((d) => d.portCallId === p.id || d.name === p.portName)?.standfirst;
    out.push({ portName: p.portName, country: p.country, when: '', dates: [p.date], ...(standfirst ? { standfirst } : {}) });
  }
  return out.map(({ dates, ...d }) => ({
    ...d,
    when: dates.length === 1 ? formatShortDate(dates[0]!) : `${formatShortDate(dates[0]!).split(' ')[0]} – ${formatShortDate(dates[dates.length - 1]!)}`,
  }));
}

/** What the guest seemed to love, as interest weights. */
export function interestsOf(input: Pick<RecapInput, 'bookings' | 'catalogue' | 'now' | 'preferences'>, favourites: RecapMemory[]): Map<string, number> {
  const w = new Map<string, number>();
  const add = (tag: string, n: number) => w.set(tag, (w.get(tag) ?? 0) + n);
  for (const b of input.bookings) {
    if (!happened(b, input.now)) continue;
    // Dinner every evening is routine; a choice ashore says more.
    for (const t of input.catalogue.find((e) => e.id === b.experienceId)?.tags ?? []) add(t, b.category === 'dining' ? 0.5 : 1);
  }
  for (const m of favourites) for (const t of input.catalogue.find((e) => e.id === m.experienceId)?.tags ?? []) add(t, 2);
  const INTEREST: Record<string, string[]> = { 'Fine dining': ['fine-dining'], Wine: ['wine'], 'Private cultural experiences': ['private', 'culture'], Spa: ['spa'], 'Yachting & sailing': ['yachting', 'sailing'] };
  for (const i of input.preferences.activityInterests ?? []) for (const t of INTEREST[i] ?? []) add(t, 1);
  return w;
}

const loose = (a: string, b: string) => a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());

/**
 * Next voyages, ranked by what the guest loved: shared interests, the
 * places they say they love, and a gentle step away from regions just sailed.
 */
export function recommendVoyages(input: RecapInput, favourites: RecapMemory[], limit = 3, memories: RecapMemory[] = favourites): VoyageRecommendation[] {
  const tagsOf = (m: RecapMemory) => input.catalogue.find((e) => e.id === m.experienceId)?.tags ?? [];
  // The guest's own moment behind an interest: a favourite first, then anything that took place (not a meal).
  const momentFor = (tag: string) => favourites.find((m) => tagsOf(m).includes(tag)) ?? memories.find((m) => m.kind === 'experience' && tagsOf(m).includes(tag));
  const w = interestsOf(input, favourites);
  const recent = [input.voyage, ...input.pastVoyages].filter((v) => Date.parse(v.endDate) > input.now.getTime() - 4 * 365 * 86_400_000).map((v) => v.region);
  const scored = input.inspirations
    .filter((i) => Date.parse(i.startDate) > input.now.getTime())
    .map((i) => {
      let score = i.tags.reduce((s, t) => s + (w.get(t) ?? 0), 0);
      if ((input.preferences.preferredDestinations ?? []).some((p) => loose(p, i.region))) score += 2;
      if (i.region === input.voyage.region) score -= 2;
      else if (recent.includes(i.region)) score -= 3;
      // The strongest of the guest's interests this voyage answers.
      const hook = Object.keys(i.hooks)
        .filter((t) => w.has(t))
        .sort((a, b) => (w.get(b) ?? 0) - (w.get(a) ?? 0) || a.localeCompare(b))[0];
      return { i, score, reason: hook ? i.hooks[hook]! : i.standfirst, because: hook ? momentFor(hook)?.title : undefined };
    })
    .sort((a, b) => b.score - a.score || a.i.startDate.localeCompare(b.i.startDate));
  return scored.slice(0, limit).map(({ i, reason, because }) => ({
    inspirationId: i.id,
    name: i.name,
    region: i.region,
    when: `${formatDateRange(i.startDate, i.endDate)} · ${i.nights} nights · ${i.yachtName}`,
    ports: i.ports,
    reason,
    ...(because ? { because } : {}),
    standfirst: i.standfirst,
    highlight: i.highlight,
    hero: i.hero,
  }));
}

/** The people to thank: the Suite Ambassador, the named crew who looked after requests, the teams behind what took place. */
function crewOf(input: RecapInput): CrewToThank[] {
  const out: CrewToThank[] = [{ id: 'ambassador', name: input.ambassador.name, role: input.ambassador.title }];
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  for (const r of input.requests) {
    const person = r.assignedTeam.person;
    if (!person || !person.includes(',')) continue;
    const [name, role] = person.split(',').map((x) => x.trim()) as [string, string];
    if (name === input.ambassador.name || out.some((c) => c.name === name)) continue;
    out.push({ id: slug(name), name, role });
  }
  const did = (cats: string[]) => input.bookings.some((b) => cats.includes(b.category) && happened(b, input.now));
  const venues = [...new Set(input.bookings.filter((b) => b.category === 'dining' && happened(b, input.now)).map((b) => b.venue.split(',')[0]!.trim()))].slice(0, 3);
  if (venues.length) out.push({ id: 'restaurants', name: venues.length === 1 ? `The team at ${venues[0]}` : 'The restaurant teams', role: venues.length === 1 ? 'Dining' : venues.join(', ').replace(/, ([^,]*)$/, ' and $1') });
  if (did(['spa', 'wellness'])) out.push({ id: 'spa', name: 'The spa team', role: 'Deck 4' });
  if (did(['private', 'marina'])) out.push({ id: 'deck', name: 'The marina and deck crew', role: 'Tenders, launches and the marina platform' });
  return out;
}

function thankYouOf(input: RecapInput): VoyageRecap['thankYou'] {
  const { guest, ambassador } = input;
  const occasion = input.occasions.find((o) => o.recognition !== 'private' && o.date >= input.voyage.startDate && o.date <= input.voyage.endDate);
  const place = occasion ? input.voyage.itinerary.find((p) => p.date === occasion.date) : undefined;
  const body = [
    `Dear ${guest.firstName}${guest.companions.length ? ` and ${guest.companions.join(' and ')}` : ''},`,
    `Thank you for sailing with us aboard ${input.yachtName}. It was a pleasure to look after you.`,
  ];
  if (occasion) {
    const label = occasion.label.charAt(0).toLowerCase() + occasion.label.slice(1);
    body.push(
      occasion.recognition === 'discreet'
        ? `It was a privilege to help mark your ${label}${place && place.type !== 'sea' ? ` in ${place.portName}` : ''}, quietly, as you wished.`
        : `Celebrating your ${label} with you${place && place.type !== 'sea' ? ` in ${place.portName}` : ''} was a privilege.`,
    );
  }
  body.push('Your preferences stay with us, so the next voyage can begin where this one ended. If there is anything I can do from here, I am only a message away.');
  return { title: `A note from ${ambassador.firstName}`, body, signature: `${ambassador.name}, ${ambassador.title}` };
}

export function buildRecap(input: RecapInput): VoyageRecap {
  const memories = memoriesOf(input);
  const destinations = destinationsOf(input);
  const countries = new Set(destinations.map((d) => d.country)).size;
  const chosen = input.feedback.favourites.map((id) => memories.find((m) => m.id === id)).filter((m): m is RecapMemory => Boolean(m));
  // Until the guest says: the occasion, what was arranged for it, then the most personal of the rest.
  const weight = (m: RecapMemory) => {
    if (m.kind === 'occasion') return 1e9;
    const x = input.catalogue.find((e) => e.id === m.experienceId);
    if (!x || x.format !== 'private') return 0;
    return (x.tags.includes('occasion') ? 1e8 : 0) + (x.price?.amountMinor ?? 0);
  };
  const suggested = memories
    .filter((m) => weight(m) > 0)
    .sort((a, b) => weight(b) - weight(a) || a.date.localeCompare(b.date))
    .slice(0, 3);
  const favourites = chosen.length ? chosen : suggested;
  const recommendations = recommendVoyages(input, favourites, 3, memories);
  const top = recommendations[0];
  const prefs = input.preferences;
  const remembered = [prefs.dining?.tablePreference ? `a ${prefs.dining.tablePreference} table` : '', prefs.excursions?.style === 'private' ? 'private guides ashore' : ''].filter(Boolean);
  const voyageNumber = input.pastVoyages.length + 1;

  return {
    reservationId: input.reservationId,
    voyageId: input.voyage.id,
    welcome: {
      eyebrow: `${input.voyage.name} · ${formatDateRange(input.voyage.startDate, input.voyage.endDate)}`,
      title: 'Welcome home.',
      line: `${input.guest.firstName}, we hope the journey home was a gentle one. Here is your voyage, as we will remember it.`,
    },
    summary: {
      voyageName: input.voyage.name,
      dates: formatDateRange(input.voyage.startDate, input.voyage.endDate),
      line: `${words(input.voyage.nights)} nights, ${words(destinations.length).toLowerCase()} ports and ${words(countries).toLowerCase()} countries aboard ${input.yachtName}, in ${input.suite}.`,
      ...(voyageNumber > 1 ? { voyageNumber } : {}),
    },
    days: daysOf(input, memories),
    destinations,
    favourites: { chosen: chosen.length > 0, memories: favourites },
    bonvoy: {
      ...(input.membership ? { tierLabel: input.membership.tierLabel } : {}),
      ...(input.membership?.lifetimeStatus ? { lifetimeStatus: input.membership.lifetimeStatus } : {}),
      note: 'Nights and points from this voyage will appear here once Marriott Bonvoy has posted them.',
      connected: false,
    },
    thankYou: thankYouOf(input),
    recommendations,
    inspiration: top
      ? {
          eyebrow: 'Next voyage inspiration',
          title: top.name,
          standfirst: top.standfirst,
          voyage: top,
          closing: `Your preferences travel with you${remembered.length ? `: ${remembered.join(' and ')}` : ''}${voyageNumber > 1 ? `, for what would be your ${ORDINALS[voyageNumber + 1] ?? 'next'} voyage with us` : ''}.`,
        }
      : null,
    crew: crewOf(input),
    feedback: input.feedback,
  };
}

export const emptyFeedback = (guestId: string, reservationId: string, at: string): VoyageFeedback => ({
  guestId,
  reservationId,
  favourites: [],
  words: [],
  thanks: [],
  followUp: false,
  status: 'draft',
  version: 0,
  updatedAt: at,
});
