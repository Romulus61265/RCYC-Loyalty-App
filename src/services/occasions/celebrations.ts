/**
 * Special-occasion orchestration: detect a celebration that falls during the
 * voyage, then plan it with a playbook of steps. Pure (no I/O, no clock but
 * the `now` passed in), so every implementation and test shares it.
 *
 *   detectCelebrations(input) → DetectedCelebration[]      (one per occasion)
 *   planCelebration(c, input) → message + steps             (proposals only)
 *
 * Reusable: each kind (birthday, anniversary, honeymoon, milestone voyage,
 * Bonvoy milestone) is a detector plus a playbook — the ordered steps it
 * offers and its message. The step builders are shared. Adding a kind means
 * adding a detector and a playbook entry.
 *
 * Never transactional: a plan only proposes. Nothing is requested, booked or
 * charged unless the guest approves a step (OccasionService.approveStep).
 * What is already booked or requested is shown as in hand, not offered again.
 */
import type {
  CelebrationKind,
  CelebrationPlan,
  CelebrationStep,
  CelebrationStepKind,
  DetectedCelebration,
  Experience,
  ExperienceAvailability,
  ExperienceBooking,
  GuestPreferences,
  GuestRelationship,
  GuestServiceRequest,
  LoyaltyMembership,
  PortCall,
  SpecialOccasion,
  TravelCompanion,
  Voyage,
} from '@/domain';
import { formatLongDate, formatMoney } from '@/utils/format';

export interface CelebrationInput {
  now: Date;
  guest: { id: string; firstName: string; preferredName?: string };
  companions: TravelCompanion[];
  occasions: SpecialOccasion[];
  preferences: GuestPreferences;
  membership: LoyaltyMembership | null;
  relationship?: GuestRelationship;
  voyage: Voyage;
  yachtName: string;
  ambassador: { firstName: string; title: string };
  catalogue: Experience[];
  availability: ExperienceAvailability[];
  bookings: ExperienceBooking[];
  /** Active and past requests (to recognise what is already in hand). */
  requests: GuestServiceRequest[];
}

// ─── Playbooks ─────────────────────────────────────────────────────────────

export const PLAYBOOKS: Record<CelebrationKind, CelebrationStepKind[]> = {
  anniversary: ['private-dining', 'wine', 'suite-amenity', 'private-shore', 'spa', 'concierge'],
  honeymoon: ['private-dining', 'spa', 'suite-amenity', 'private-shore', 'wine', 'concierge'],
  birthday: ['private-dining', 'suite-amenity', 'private-shore', 'concierge'],
  'milestone-voyage': ['captain', 'suite-amenity', 'wine', 'concierge'],
  'bonvoy-milestone': ['suite-amenity', 'private-dining', 'concierge'],
};

const HEADINGS: Record<CelebrationStepKind, string> = {
  'private-dining': 'Private dining',
  wine: 'Wine & the sommelier',
  'suite-amenity': 'In your suite',
  'private-shore': 'Ashore, privately',
  spa: 'The spa, together',
  captain: 'With the Captain',
  concierge: 'Concierge assistance',
};

/** Voyages and nights worth marking. */
const VOYAGE_MILESTONES = [5, 10, 15, 20, 25, 30, 40, 50];
const NIGHT_MILESTONES = [50, 100, 150, 200, 250, 300, 365, 500, 750, 1000];
const SHORE = new Set(['excursion', 'culture', 'wine', 'private', 'wellness', 'shopping', 'marina']);

// ─── Words ─────────────────────────────────────────────────────────────────

const UNITS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORD_UNITS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth'];
const ORD_TENS = ['', '', 'twentieth', 'thirtieth', 'fortieth', 'fiftieth', 'sixtieth', 'seventieth', 'eightieth', 'ninetieth'];

/** "twenty", "twenty-five" (1–99; digits beyond). */
export function numberWord(n: number): string {
  if (n < 20) return UNITS[n] ?? String(n);
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${UNITS[n % 10]}` : ''}`;
  return String(n);
}
/** "fifth", "twentieth", "twenty-fifth"; "100th" beyond. */
export function ordinalWord(n: number): string {
  if (n < 20) return ORD_UNITS[n] ?? `${n}th`;
  if (n < 100) return n % 10 ? `${TENS[Math.floor(n / 10)]}-${ORD_UNITS[n % 10]}` : ORD_TENS[n / 10]!;
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

// ─── Detection ─────────────────────────────────────────────────────────────

const today = (input: CelebrationInput) => input.now.toISOString().slice(0, 10);
const portOn = (v: Voyage, date: string): PortCall | undefined => v.itinerary.find((p) => p.date === date);

function where(input: CelebrationInput, date: string): Pick<DetectedCelebration, 'dayNumber' | 'port' | 'atSea'> {
  const p = portOn(input.voyage, date);
  if (!p) return { atSea: false };
  return p.type === 'sea' ? { dayNumber: p.day, atSea: true } : { dayNumber: p.day, port: p.portName, atSea: false };
}

/** This year's date of a recurring occasion, if it falls during the voyage. */
function duringVoyage(v: Voyage, date: string): string | undefined {
  const md = date.slice(5, 10);
  for (const year of new Set([v.startDate.slice(0, 4), v.endDate.slice(0, 4)])) {
    const d = `${year}-${md}`;
    if (d >= v.startDate && d <= v.endDate) return d;
  }
  return undefined;
}

export function detectCelebrations(input: CelebrationInput): DetectedCelebration[] {
  const v = input.voyage;
  const found: DetectedCelebration[] = [];
  const first = input.guest.preferredName ?? input.guest.firstName;
  const names = new Map<string, string>([[input.guest.id, first], ...input.companions.filter((c) => c.guestId).map((c) => [c.guestId!, c.firstName] as [string, string])]);

  // Birthdays, anniversaries, honeymoons the guest has shared (never private ones).
  for (const o of input.occasions) {
    if (o.recognition === 'private') continue;
    const kind: CelebrationKind | undefined = o.type === 'anniversary' ? 'anniversary' : o.type === 'birthday' ? 'birthday' : o.type === 'honeymoon' ? 'honeymoon' : undefined;
    if (!kind) continue;
    const date = kind === 'honeymoon' ? (o.date >= v.startDate && o.date <= v.endDate ? o.date : undefined) : duringVoyage(v, o.date);
    if (!date) continue;
    const ordinal = Number(/\b(\d{1,3})(?:st|nd|rd|th)\b/i.exec(o.label)?.[1]) || undefined;
    const people = o.personIds.map((id) => names.get(id)).filter((n): n is string => Boolean(n));
    found.push({ key: `${kind}:${o.id}`, kind, label: o.label, date, ...where(input, date), recognition: o.recognition, ...(ordinal ? { ordinal } : {}), people: people.length ? people : [first], source: 'guest-occasion', sourceId: o.id });
  }

  // A milestone voyage: the fifth, tenth… or a hundredth night with us.
  const rel = input.relationship;
  if (rel && v.itinerary.length) {
    const count = rel.voyagesCompleted + 1;
    const nights = Math.max(0, v.itinerary.length - 1);
    const night = NIGHT_MILESTONES.find((t) => rel.nightsSailed < t && t <= rel.nightsSailed + nights);
    const party = [first, ...input.companions.filter((c) => !c.isMinor).map((c) => c.firstName)];
    if (VOYAGE_MILESTONES.includes(count)) {
      const date = v.itinerary[0]!.date;
      found.push({ key: `milestone-voyage:voyage-${count}`, kind: 'milestone-voyage', label: `Your ${ordinalWord(count)} voyage with us`, date, ...where(input, date), recognition: 'celebrate', ordinal: count, people: party, source: 'voyage-history', sourceId: `voyage-${count}` });
    } else if (night) {
      const date = v.itinerary[night - rel.nightsSailed - 1]!.date;
      found.push({ key: `milestone-voyage:night-${night}`, kind: 'milestone-voyage', label: `Your ${ordinalWord(night)} night aboard with us`, date, ...where(input, date), recognition: 'celebrate', ordinal: night, people: party, source: 'voyage-history', sourceId: `night-${night}` });
    }
  }

  // A Bonvoy anniversary in five-year steps.
  const since = input.membership?.memberSince;
  if (since) {
    const date = duringVoyage(v, since);
    const years = date ? Number(date.slice(0, 4)) - Number(since.slice(0, 4)) : 0;
    if (date && years > 0 && years % 5 === 0) {
      found.push({ key: `bonvoy-milestone:years-${years}`, kind: 'bonvoy-milestone', label: `${cap(numberWord(years))} years with Marriott Bonvoy`, date, ...where(input, date), recognition: 'celebrate', ordinal: years, people: [first], source: 'bonvoy', sourceId: `years-${years}` });
    }
  }

  return found.filter((c) => c.date >= today(input)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.key < b.key ? -1 : 1));
}

// ─── Planning ──────────────────────────────────────────────────────────────

interface Ctx {
  c: DetectedCelebration;
  input: CelebrationInput;
  name: string;
  companion?: TravelCompanion;
  party: number;
  dateLong: string;
  /** May the crew be told what it is for? */
  sayWhy: boolean;
  bookings: ExperienceBooking[];
}

const active = (b: ExperienceBooking) => b.status !== 'cancelled' && b.status !== 'declined';
const timeOf = (iso: string) => iso.slice(11, 16);

function bookingState(b: ExperienceBooking): NonNullable<CelebrationStep['inHand']> {
  if (b.status === 'confirmed' || b.status === 'completed') return { label: 'Confirmed', tone: 'calm', bookingId: b.id };
  if (b.status === 'awaiting_guest') return { label: 'Awaiting your choice', tone: 'attention', bookingId: b.id };
  return { label: 'Being arranged', tone: 'pending', bookingId: b.id };
}

function requestState(r: GuestServiceRequest): NonNullable<CelebrationStep['inHand']> {
  if (r.awaitingGuest) return { label: 'Needs your reply', tone: 'attention', requestId: r.id };
  if (r.status === 'resolved' || r.status === 'closed') return { label: 'Arranged', tone: 'calm', requestId: r.id };
  if (r.status === 'submitted') return { label: 'Requested', tone: 'pending', requestId: r.id };
  return { label: 'Being arranged', tone: 'pending', requestId: r.id };
}

/** A request still counts unless it was withdrawn or could not be done. */
const counts = (r: GuestServiceRequest) => r.status !== 'closed' || r.timeline.some((t) => t.status === 'resolved');

function requestFor(ctx: Ctx, stepId: string, experienceId?: string): GuestServiceRequest | undefined {
  return ctx.input.requests.find((r) => counts(r) && (r.occasionStep === stepId || (experienceId !== undefined && r.experienceId === experienceId)));
}

function priceOf(e: Experience): { price: string; chargeable: boolean } {
  if (e.inclusive) return { price: 'Included', chargeable: false };
  if (e.price) return { price: formatMoney(e.price.amountMinor, e.price.currency), chargeable: true };
  return { price: 'Priced with you before anything is confirmed', chargeable: false };
}

/** An open slot that day that clashes with nothing booked. */
function slotOn(ctx: Ctx, e: Experience, date: string): string | undefined {
  const a = ctx.input.availability.find((x) => x.experienceId === e.id);
  if (!a || a.status === 'unavailable') return undefined;
  const need = e.format === 'private' ? 1 : ctx.party;
  const busy = ctx.bookings.map((b) => [Date.parse(b.start), b.end ? Date.parse(b.end) : Date.parse(b.start) + 2 * 3_600_000] as const);
  return a.slots
    .filter((s) => s.start.slice(0, 10) === date && s.remaining >= need && Date.parse(s.start) > ctx.input.now.getTime())
    .find((s) => {
      const start = Date.parse(s.start);
      const end = s.end ? Date.parse(s.end) : start + (e.durationMinutes ?? 90) * 60_000;
      return !busy.some(([bs, be]) => start < be && bs < end);
    })?.start;
}

function experienceStep(ctx: Ctx, kind: CelebrationStepKind, e: Experience, date: string, detail: string): CelebrationStep {
  const id = `${ctx.c.key}:${kind}`;
  const booking = ctx.bookings.find((b) => b.experienceId === e.id && b.start.slice(0, 10) === date) ?? ctx.bookings.find((b) => b.experienceId === e.id);
  const destination = e.destination ?? (ctx.c.port ? `Aboard ${ctx.input.yachtName} in ${ctx.c.port}` : `Aboard ${ctx.input.yachtName}`);
  const base = { id, kind, heading: HEADINGS[kind], title: e.title, detail, date, destination, experienceId: e.id };
  if (booking) return { ...base, date: booking.start.slice(0, 10), time: timeOf(booking.start), state: 'in-hand', inHand: bookingState(booking), chargeable: false };
  const request = requestFor(ctx, id, e.id);
  if (request) return { ...base, state: 'in-hand', inHand: requestState(request), chargeable: false };
  const start = slotOn(ctx, e, date);
  const { price, chargeable } = priceOf(e);
  if (start) {
    return { ...base, time: timeOf(start), state: 'suggested', proposal: { kind: 'request-experience', experienceId: e.id, start, partySize: ctx.party }, actionLabel: `Request ${timeOf(start)}`, price, chargeable };
  }
  return {
    ...base,
    state: 'suggested',
    proposal: { kind: 'service-request', category: kind === 'private-dining' ? 'dining' : kind === 'spa' ? 'spa' : 'excursion', description: `${e.title} on ${ctx.dateLong}${ctx.c.port ? `, in ${ctx.c.port}` : ''}, for ${ctx.party === 1 ? 'one' : numberWord(ctx.party)}${ctx.sayWhy ? `, for our ${ctx.c.label.toLowerCase()}` : ''}. Is it possible?`, priority: 'routine' },
    actionLabel: `Ask ${ctx.input.ambassador.firstName} about it`,
    price: e.inclusive ? 'Included' : 'Priced with you before anything is confirmed',
    chargeable: false,
  };
}

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
/** The subtitle and the first sentence of the description. */
const describe = (e: Experience) => [sentence(e.subtitle), /^[^.!?]+[.!?]/.exec(e.description ?? '')?.[0] ?? ''].filter(Boolean).join(' ');

function privateDining(ctx: Ctx): CelebrationStep | null {
  const { c, input } = ctx;
  const dining = input.catalogue.filter((e) => e.category === 'dining');
  // Already arranged that day, privately?
  const booked = ctx.bookings.find((b) => b.category === 'dining' && b.start.slice(0, 10) === c.date && dining.some((e) => e.id === b.experienceId && (e.tags.includes('occasion') || e.format === 'private')));
  const e = booked ? dining.find((x) => x.id === booked.experienceId)! : (dining.find((x) => x.tags.includes('occasion') && x.format === 'private') ?? dining.find((x) => x.format === 'private'));
  if (!e) return conciergeAsk(ctx, 'private-dining', 'A private dinner', `A private table for ${ctx.party === 2 ? 'two' : numberWord(ctx.party)} on ${ctx.dateLong}, wherever you would like it.`, 'dining');
  return experienceStep(ctx, 'private-dining', e, c.date, describe(e));
}

/** Their favourite wine, from beverage preferences ("Red wine — Barolo, Brunello…"). */
function favouriteWine(p: GuestPreferences): string | undefined {
  for (const w of p.beverage.wine) {
    const named = w.split('—')[1]?.split(',')[0]?.trim();
    if (named) return named;
  }
  return undefined;
}

function wine(ctx: Ctx): CelebrationStep | null {
  const { c, input } = ctx;
  const id = `${c.key}:wine`;
  const request = requestFor(ctx, id);
  const fav = favouriteWine(input.preferences);
  const champagne = input.preferences.beverage.wine.some((w) => /champagne/i.test(w));
  const minors = input.companions.some((x) => x.isMinor);
  const year = c.kind === 'anniversary' && c.ordinal ? Number(c.date.slice(0, 4)) - c.ordinal : undefined;
  const alcoholFree = !fav && !champagne && input.preferences.beverage.nonAlcoholic.length > 0;
  const bottle = alcoholFree
    ? `the sommelier’s alcohol-free pairing`
    : c.kind === 'honeymoon' && champagne
      ? 'a vintage Champagne'
      : fav
        ? `a ${year ? `${year} ` : ''}${fav}`
        : 'a bottle chosen with the sommelier';
  const title = cap(`${bottle}, with the sommelier`);
  const why = year ? ` from ${year}, the year you married` : '';
  if (request) return { id, kind: 'wine', heading: HEADINGS.wine, title, detail: request.resolutionNotes ?? 'The head sommelier has it in hand.', date: c.date, state: 'in-hand', inHand: requestState(request), chargeable: false };
  return {
    id,
    kind: 'wine',
    heading: HEADINGS.wine,
    title,
    detail: `${cap(alcoholFree ? bottle : fav && year ? `a ${fav}${why}` : bottle)}, decanted at the table by the head sommelier on ${ctx.dateLong}.`,
    date: c.date,
    state: 'suggested',
    proposal: {
      kind: 'service-request',
      category: 'dining',
      description: `${cap(bottle)}${ctx.sayWhy ? ` for our ${c.label.toLowerCase()}` : ''}, opened by the sommelier at dinner on ${ctx.dateLong}.${minors ? ' Alcohol-free for the young ones, please.' : ''}`,
      priority: 'routine',
    },
    actionLabel: 'Ask the sommelier',
    price: 'The sommelier will confirm the bottle and its price with you first',
    chargeable: false,
  };
}

function suiteAmenity(ctx: Ctx): CelebrationStep | null {
  const { c, input } = ctx;
  const id = `${c.key}:suite-amenity`;
  const request = requestFor(ctx, id);
  const p = input.preferences;
  const champagne = p.beverage.wine.some((w) => /champagne/i.test(w)) && !input.companions.some((x) => x.isMinor);
  const toast = champagne ? 'Champagne on ice' : p.beverage.nonAlcoholic[0] ? `${cap(p.beverage.nonAlcoholic[0])} on ice` : 'Something to toast with';
  const free = [...p.dietary.restrictions, ...p.dietary.allergies.map((a) => `${a.allergen}-free`)];
  const extra = c.kind === 'birthday' ? `, and a small cake${free.length ? ` (${list(free)})` : ''}` : c.kind === 'bonvoy-milestone' || c.kind === 'milestone-voyage' ? ', and a note from the Captain' : ', and flowers';
  const quietly = c.recognition === 'discreet';
  const when = c.kind === 'honeymoon' || c.kind === 'milestone-voyage' ? `on ${ctx.dateLong}` : `on the morning of ${ctx.dateLong}`;
  const title = `${toast}${extra}`;
  const base = { id, kind: 'suite-amenity' as const, heading: HEADINGS['suite-amenity'], title, date: c.date };
  const detail = quietly ? `Set out ${when}, quietly: no card and no fuss, just as you asked.` : `Waiting in your suite ${when}.`;
  if (request) return { ...base, detail: request.resolutionNotes ?? detail, state: 'in-hand', inHand: requestState(request), chargeable: false };
  return {
    ...base,
    detail,
    state: 'suggested',
    proposal: {
      kind: 'service-request',
      category: 'suite',
      description: `${title} in our suite ${when}${ctx.sayWhy ? ` (${c.label.toLowerCase()})` : ''}.${quietly ? ' Quietly, please: no card.' : ''}`,
      priority: 'routine',
    },
    actionLabel: `Ask ${input.ambassador.firstName} to arrange it`,
    price: 'Your Suite Ambassador will confirm any cost first',
    chargeable: false,
  };
}

function privateShore(ctx: Ctx): CelebrationStep | null {
  const { c, input } = ctx;
  if (c.atSea || !c.port) return null;
  const portIds = new Set(input.voyage.itinerary.filter((p) => p.date === c.date).map((p) => p.id));
  const ashore = input.catalogue.filter((e) => e.portCallId && portIds.has(e.portCallId) && SHORE.has(e.category) && (e.format === 'private' || e.privateAvailable));
  if (!ashore.length) return conciergeAsk(ctx, 'private-shore', `A private afternoon in ${c.port}`, `A guide and a car, arranged around your day in ${c.port}.`, 'excursion');
  const booked = ashore.find((e) => ctx.bookings.some((b) => b.experienceId === e.id));
  const ranked = [...ashore].sort((a, b) => Number(b.tags.includes('occasion')) - Number(a.tags.includes('occasion')) || Number(b.format === 'private') - Number(a.format === 'private'));
  const e = booked ?? ranked.find((x) => slotOn(ctx, x, c.date)) ?? ranked[0]!;
  return experienceStep(ctx, 'private-shore', e, c.date, describe(e));
}

function spa(ctx: Ctx): CelebrationStep | null {
  const { c, input } = ctx;
  if (!ctx.companion) return null;
  const e = input.catalogue.find((x) => x.category === 'spa' && x.tags.includes('couples'));
  if (!e) return null;
  return experienceStep(ctx, 'spa', e, c.date, describe(e));
}

function captain(ctx: Ctx): CelebrationStep | null {
  const e = ctx.input.catalogue.find((x) => x.id.endsWith('bridge') || /bridge/i.test(x.title));
  if (!e) return null;
  // Any time on the voyage: the first open slot from the milestone on.
  const dates = ctx.input.voyage.itinerary.map((p) => p.date).filter((d) => d >= ctx.c.date);
  const date = dates.find((d) => slotOn(ctx, e, d)) ?? ctx.c.date;
  return experienceStep(ctx, 'captain', e, date, `${describe(e)} The Captain would be glad to welcome you.`);
}

function conciergeAsk(ctx: Ctx, kind: CelebrationStepKind, title: string, detail: string, category: 'dining' | 'excursion' | 'concierge'): CelebrationStep {
  const id = `${ctx.c.key}:${kind}`;
  const request = requestFor(ctx, id);
  const base = { id, kind, heading: HEADINGS[kind], title, detail, date: ctx.c.date };
  if (request) return { ...base, ...(request.resolutionNotes ? { detail: request.resolutionNotes } : {}), state: 'in-hand', inHand: requestState(request), chargeable: false };
  return {
    ...base,
    state: 'suggested',
    proposal: { kind: 'service-request', category, description: `${title} on ${ctx.dateLong}${ctx.sayWhy ? `, for our ${ctx.c.label.toLowerCase()}` : ''}.`, priority: 'routine' },
    actionLabel: `Ask ${ctx.input.ambassador.firstName} to arrange it`,
    price: 'Priced with you before anything is confirmed',
    chargeable: false,
  };
}

function concierge(ctx: Ctx): CelebrationStep {
  const { c, input } = ctx;
  const a = input.ambassador;
  const id = `${c.key}:concierge`;
  const request = requestFor(ctx, id);
  const base = { id, kind: 'concierge' as const, heading: HEADINGS.concierge, title: `${a.firstName}, your ${a.title}`, date: c.date };
  const detail = `${a.firstName} can bring the day together, from a quiet table to a car ashore, and will confirm every detail with you.`;
  if (request) return { ...base, detail, state: 'in-hand', inHand: requestState(request), chargeable: false };
  return {
    ...base,
    detail,
    state: 'suggested',
    proposal: { kind: 'service-request', category: 'concierge', description: `Please help us plan ${ctx.dateLong}${ctx.sayWhy ? ` (${c.label.toLowerCase()})` : ''}. We would like to talk it through with you.`, priority: 'routine' },
    actionLabel: `Ask ${a.firstName} to plan it with you`,
    chargeable: false,
  };
}

const BUILDERS: Record<CelebrationStepKind, (ctx: Ctx) => CelebrationStep | null> = {
  'private-dining': privateDining,
  wine,
  'suite-amenity': suiteAmenity,
  'private-shore': privateShore,
  spa,
  captain,
  concierge,
};

/** "your second day in Monte Carlo", "a day at sea", "embarkation day in Barcelona". */
function placePhrase(input: CelebrationInput, c: DetectedCelebration): string {
  if (c.atSea) return ', a day at sea';
  if (!c.port) return '';
  const days = input.voyage.itinerary.filter((p) => p.portName === c.port && p.date <= c.date);
  const p = portOn(input.voyage, c.date);
  if (p?.type === 'embark') return `, the day you embark in ${c.port}`;
  return days.length > 1 ? `, your ${ordinalWord(days.length)} day in ${c.port}` : `, in ${c.port}`;
}

function message(ctx: Ctx): CelebrationPlan['message'] {
  const { c, input, name } = ctx;
  const a = input.ambassador;
  const eyebrow = `${ctx.dateLong} · ${c.atSea ? 'At sea' : (c.port ?? input.yachtName)}`;
  const place = placePhrase(input, c);
  const withWhom = ctx.companion ? ` with ${ctx.companion.firstName}` : '';
  const quietly = c.recognition === 'discreet' ? 'We have kept it between us, as you asked: the crew will mark it quietly, and only where you would like.' : 'The whole crew would love to make it a day to remember.';
  const close = 'A few ideas for the day, some already in hand. Nothing is requested or charged unless you say so.';
  const fromAmbassador = `${a.firstName}, your ${a.title}`;
  switch (c.kind) {
    case 'anniversary':
      return { eyebrow, title: c.ordinal ? `${cap(numberWord(c.ordinal))} years` : 'Your anniversary', body: [`${name}, your ${c.label.toLowerCase()} falls on ${ctx.dateLong}${place}.`, quietly, close.replace('for the day', `for the day${withWhom}`)], signature: fromAmbassador };
    case 'birthday':
      return { eyebrow, title: `Happy birthday, ${c.people[0] ?? name}`, body: [`Your birthday falls on ${ctx.dateLong}${place}.`, quietly, close], signature: fromAmbassador };
    case 'honeymoon':
      return { eyebrow, title: 'Congratulations', body: [`${name}, your honeymoon is with us${place ? place.replace(/^, /, ', beginning ') : ''}.`, quietly, close.replace('for the day', 'for your time together')], signature: fromAmbassador };
    case 'milestone-voyage':
      return { eyebrow, title: c.label, body: [`${name}, ${c.label.charAt(0).toLowerCase()}${c.label.slice(1)}${c.source === 'voyage-history' && c.sourceId.startsWith('voyage') ? ` begins on ${ctx.dateLong}` : ` falls on ${ctx.dateLong}`}${place}. Thank you for coming back to us.`, 'The Captain and crew would like to mark it, in whatever way suits you.', close], signature: `The Captain and crew of ${input.yachtName}` };
    case 'bonvoy-milestone':
      return { eyebrow, title: c.label, body: [`${name}, on ${ctx.dateLong} you will have been with Marriott Bonvoy for ${numberWord(c.ordinal ?? 0)} years${place}.`, 'We would like to say thank you.', close], signature: fromAmbassador };
  }
}

export function planCelebration(c: DetectedCelebration, input: CelebrationInput): CelebrationPlan {
  const companion = input.companions.find((x) => !x.isMinor && c.people.includes(x.firstName)) ?? input.companions.find((x) => !x.isMinor && /spouse|partner/.test(x.relationship));
  const ctx: Ctx = {
    c,
    input,
    name: input.guest.preferredName ?? input.guest.firstName,
    companion,
    party: 1 + input.companions.length,
    dateLong: formatLongDate(c.date),
    sayWhy: input.preferences.privacy.shareOccasionsWithCrew !== false,
    bookings: input.bookings.filter(active),
  };
  // With personalised recommendations off, only the message and a person.
  const kinds = input.preferences.privacy.personalisedRecommendations === false ? (['concierge'] as CelebrationStepKind[]) : PLAYBOOKS[c.kind];
  const steps = kinds.map((k) => BUILDERS[k](ctx)).filter((s): s is CelebrationStep => s !== null);
  return {
    celebration: c,
    message: message(ctx),
    steps,
    assurance: 'Nothing here is booked or charged until you approve it, and anything with a cost is confirmed with you first.',
  };
}
