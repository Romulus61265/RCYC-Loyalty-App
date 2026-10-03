/**
 * The mock concierge's answers. Each is a pure function of the guest's
 * snapshot (itinerary, bookings, availability, preferences, recognition,
 * requests) and the message, so the replies change when the data does and
 * every behaviour is testable (scripts/check-concierge.ts).
 *
 * Answers never act. They offer actions (as cards the guest can tap), or ask
 * the orchestrating service to escalate or to perform an action the guest has
 * just confirmed in words.
 */
import type {
  ConciergeAction,
  ConciergeAttachment,
  ConciergeIntent,
  ConciergeMessage,
  EscalationRequest,
  EscalationTarget,
  Experience,
  ExperienceBooking,
  GuestContext,
  PortCall,
  ServiceRequest,
} from '@/domain';
import { ordinalWord } from '@/services/shared/recognition';
import { formatLongDate, formatMoney, formatShortDate, formatTime, greeting } from '@/utils/format';
import { classify, dayIn, keywords, pendingActions, portIn, timeIn, type DayRef } from './language';
import {
  bookingsOn,
  busy,
  companionName,
  dayOn,
  experienceById,
  freeSlots,
  guestName,
  localDate,
  partyFor,
  portOn,
  type ConciergeSnapshot,
} from './snapshot';

export interface Answer {
  intent: ConciergeIntent;
  body: string;
  attachments?: ConciergeAttachment[];
  suggestions?: string[];
  confidence: number;
  escalate?: { to: EscalationTarget; reason: EscalationRequest['reason'] };
  /** The guest confirmed an offered action in words; the service performs it. */
  perform?: ConciergeAction;
}

// ─── Small helpers ─────────────────────────────────────────────────────────

const bullet = (lines: string[]) => lines.map((l) => `• ${l}`).join('\n');
const paragraphs = (...parts: (string | false | undefined | null)[]) => parts.filter((p): p is string => Boolean(p && p.trim())).join('\n\n');
const list = (items: string[], joiner = 'and') => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${joiner} ${items[items.length - 1]}`);
const venueName = (b: Pick<ExperienceBooking, 'venue' | 'title'>) => b.venue.split(',')[0]?.trim() || b.title;
const OPEN_STATUSES: ServiceRequest['status'][] = ['received', 'in_progress', 'awaiting_guest', 'confirmed'];
const SHORE: Experience['category'][] = ['excursion', 'culture', 'wine', 'private', 'wellness', 'marina', 'shopping'];

/** "has been received", "is being arranged"… for sentences about a request. */
function statusPhrase(st: ServiceRequest['status']): string {
  return st === 'received' ? 'has been received' : st === 'awaiting_guest' ? 'is waiting for your choice' : `is ${STATUS_WORDS[st]}`;
}

/** "; you will hear by …" only while that moment is still ahead. */
function nextUpdate(s: ConciergeSnapshot, r: ServiceRequest, lead = '; you will hear by'): string {
  return r.nextUpdateBy && Date.parse(r.nextUpdateBy) > s.now.getTime() ? `${lead} ${formatLongDate(r.nextUpdateBy)}` : '';
}

export const STATUS_WORDS: Record<ServiceRequest['status'], string> = {
  received: 'received',
  in_progress: 'being arranged',
  awaiting_guest: 'awaiting your choice',
  confirmed: 'confirmed',
  completed: 'completed',
  declined: 'not possible',
  cancelled: 'cancelled',
};

function statusNote(b: ExperienceBooking): string {
  if (b.status === 'in_progress') return ' (being arranged)';
  if (b.status === 'received') return ' (requested)';
  if (b.status === 'awaiting_guest') return ' (awaiting your choice)';
  return '';
}

/** ", at your window table" when the booking holds the guest's preferred table. */
function tableNote(s: ConciergeSnapshot, b: ExperienceBooking): string {
  const pref = s.profile.preferences.dining.tablePreference;
  if (b.category !== 'dining' || !pref || pref === 'no-preference') return '';
  const words = { window: 'window', terrace: 'terrace', 'quiet-corner': 'quiet', 'chefs-table': "chef's" }[pref];
  return b.note && new RegExp(words.split(' ')[0]!, 'i').test(b.note) ? `, at your ${words} table` : '';
}

const bookingLine = (s: ConciergeSnapshot, b: ExperienceBooking) => `${formatTime(b.start)} — ${b.title}${tableNote(s, b)}${statusNote(b)}`;

function reasonFor(s: ConciergeSnapshot, experienceId: string): string | undefined {
  return s.recommendations.find((r) => r.experienceId === experienceId)?.rationale;
}

/** Recommendation order first (personalised), then catalogue order. */
function ranked(s: ConciergeSnapshot, exps: Experience[]): Experience[] {
  const score = (e: Experience) => s.recommendations.find((r) => r.experienceId === e.id)?.score ?? -1;
  return exps.map((e, i) => ({ e, i })).sort((a, b) => score(b.e) - score(a.e) || a.i - b.i).map((x) => x.e);
}

/** Respects how the guest likes to explore: private only, and not longer than they like ashore. */
function suits(s: ConciergeSnapshot, e: Experience): boolean {
  const ex = s.profile.preferences.excursions;
  if (ex.style === 'private' && SHORE.includes(e.category) && e.portCallId && (e.format === 'small-group' || e.format === 'shared')) return false;
  if (ex.maxDurationMinutes && e.portCallId && (e.durationMinutes ?? 0) > ex.maxDurationMinutes) return false;
  return true;
}

const isBooked = (s: ConciergeSnapshot, experienceId: string) => s.bookings.some((b) => b.experienceId === experienceId && b.status !== 'cancelled' && b.status !== 'declined');
const isOpenRequestFor = (s: ConciergeSnapshot, experienceId: string) => s.requests.some((r) => r.experienceId === experienceId && OPEN_STATUSES.includes(r.status) && r.status !== 'confirmed');

/** Slots ordered so the guest's preferred time of day comes first (spa and wellness). */
function preferredSlots(s: ConciergeSnapshot, e: Experience, date: string) {
  const slots = freeSlots(s, e.id, date, partyFor(s, e));
  const pref = s.profile.preferences.spa.preferredTime;
  if (!pref || (e.category !== 'spa' && e.category !== 'wellness')) return slots;
  const fits = (iso: string) => {
    const h = Number(iso.slice(11, 13));
    return pref === 'morning' ? h < 12 : pref === 'afternoon' ? h >= 12 && h < 17 : h >= 17;
  };
  return [...slots.filter((x) => fits(x.start)), ...slots.filter((x) => !fits(x.start))];
}

function reserveLabel(s: ConciergeSnapshot, e: Experience, start: string): string {
  const status = s.availability.find((a) => a.experienceId === e.id)?.status;
  return `${e.inclusive && status === 'available' ? 'Reserve' : 'Request'} ${formatTime(start)}`;
}

function experienceMeta(e: Experience): string {
  const format = { private: 'Private', 'small-group': 'Small group', shared: 'Shared', 'private-or-group': 'Private on request' }[e.format];
  const duration = e.durationMinutes ? (e.durationMinutes >= 60 ? `${Math.round((e.durationMinutes / 60) * 2) / 2} h` : `${e.durationMinutes} min`) : undefined;
  const price = e.inclusive ? 'Included' : e.price ? formatMoney(e.price.amountMinor, e.price.currency) : undefined;
  return [duration, format, price].filter(Boolean).join(' · ');
}

/** An action card offering an experience on a date (up to two times). */
function offerCard(s: ConciergeSnapshot, e: Experience, date: string, max = 2, first?: string): ConciergeAttachment | null {
  const all = preferredSlots(s, e, date);
  const lead = first ? all.filter((x) => x.start === first) : [];
  const slots = [...lead, ...all.filter((x) => x.start !== first)].slice(0, max).sort((a, b) => a.start.localeCompare(b.start));
  if (!slots.length) return null;
  return {
    kind: 'actions',
    title: e.title,
    detail: [formatLongDate(date), experienceMeta(e)].join(' · '),
    subject: { experienceId: e.id },
    actions: slots.map((slot) => ({ kind: 'request-experience', label: reserveLabel(s, e, slot.start), experienceId: e.id, start: slot.start, partySize: partyFor(s, e) })),
  };
}

const escalateCard = (s: ConciergeSnapshot, title: string, detail?: string): ConciergeAttachment => ({
  kind: 'actions',
  title,
  detail,
  actions: [
    { kind: 'escalate', label: `Ask ${s.ambassador.firstName}`, to: 'suite-ambassador', reason: 'guest-request' },
    { kind: 'escalate', label: 'The concierge team', to: 'concierge-team', reason: 'guest-request' },
  ],
});

const aboard = (s: ConciergeSnapshot) => s.now.getTime() >= Date.parse(s.overview.embarkation.arrivalWindowStart) - 12 * 3_600_000;
const beforeVoyage = (s: ConciergeSnapshot) => localDate(s, s.now) < s.overview.voyage.startDate;
const afterVoyage = (s: ConciergeSnapshot) => localDate(s, s.now) > s.overview.voyage.endDate;
const teamMember = (s: ConciergeSnapshot) => (beforeVoyage(s) || afterVoyage(s) ? s.team.shoreside : s.team.aboard);

// ─── Schedule ──────────────────────────────────────────────────────────────

function portLine(s: ConciergeSnapshot, p: PortCall): string {
  const yacht = s.overview.yacht.name;
  const aa = p.allAboard ? `; all aboard is at ${formatTime(p.allAboard)}` : '';
  switch (p.type) {
    case 'embark':
      return `you embark in ${p.portName}: your arrival window at ${s.overview.embarkation.terminalName} opens at ${formatTime(s.overview.embarkation.arrivalWindowStart)}, and ${yacht} sails at ${p.departure ? formatTime(p.departure) : 'sunset'}.`;
    case 'sea':
      return `${yacht} is at sea all day.`;
    case 'tender':
      return `${yacht} is at anchor off ${p.portName}${p.arrival ? ` from ${formatTime(p.arrival)}` : ''}, ashore by tender${aa}.`;
    case 'overnight':
      return `${yacht} is overnight in ${p.portName}${p.arrival ? `, alongside from ${formatTime(p.arrival)}` : ''}.`;
    case 'disembark':
      return `you disembark in ${p.portName}${p.arrival ? `; ${yacht} arrives at ${formatTime(p.arrival)}` : ''}.`;
    default:
      return p.arrival ? `${yacht} is alongside in ${p.portName} from ${formatTime(p.arrival)}${aa}.` : `${yacht} remains in ${p.portName}${aa}.`;
  }
}

/** Unbooked experiences that fit the day, the guest's free time and their preferences, best first. */
function ideasFor(s: ConciergeSnapshot, date: string, port: PortCall | undefined): Experience[] {
  const portIds = new Set(s.overview.voyage.itinerary.filter((p) => port && p.portName === port.portName).map((p) => p.id));
  const suggestedToday = new Set((dayOn(s, date)?.items ?? []).filter((i) => i.kind === 'recommendation').map((i) => i.title.toLowerCase()));
  const candidates = s.catalogue.filter(
    (e) =>
      (!e.portCallId || portIds.has(e.portCallId)) &&
      !['dining', 'transfer', 'entertainment', 'event'].includes(e.category) &&
      !isBooked(s, e.id) &&
      !isOpenRequestFor(s, e.id) &&
      suits(s, e) &&
      preferredSlots(s, e, date).length > 0,
  );
  // The day's own suggestions (curated in the programme) come first.
  return ranked(s, candidates).sort((a, b) => Number(suggestedToday.has(b.title.toLowerCase())) - Number(suggestedToday.has(a.title.toLowerCase())));
}

/** A dinner offer at the guest's usual time when the evening is open. */
function dinnerOffer(s: ConciergeSnapshot, date: string): { line: string; card: ConciergeAttachment } | null {
  const { preferredTime, tablePreference } = s.profile.preferences.dining;
  const restaurants = s.catalogue.filter((e) => e.category === 'dining' && e.inclusive);
  const target = preferredTime ?? '20:00';
  let best: { e: Experience; start: string; diff: number } | null = null;
  for (const e of restaurants) {
    for (const slot of freeSlots(s, e.id, date, partyFor(s, e))) {
      const diff = Math.abs(Number(slot.start.slice(11, 13)) * 60 + Number(slot.start.slice(14, 16)) - (Number(target.slice(0, 2)) * 60 + Number(target.slice(3, 5))));
      if (!best || diff < best.diff) best = { e, start: slot.start, diff };
    }
  }
  if (!best) return null;
  const table = tablePreference === 'window' ? 'a window table' : tablePreference === 'terrace' ? 'a terrace table' : 'a table';
  return {
    line: `Dinner isn't arranged yet. I can hold ${table} at ${best.e.title} at ${formatTime(best.start)}${preferredTime && best.diff === 0 ? ', your usual time' : ''}.`,
    card: {
      kind: 'actions',
      title: `Dinner at ${best.e.title}`,
      detail: `${formatLongDate(date)} · ${best.e.subtitle}`,
      subject: { experienceId: best.e.id },
      actions: [{ kind: 'request-experience', label: `Reserve ${formatTime(best.start)}`, experienceId: best.e.id, start: best.start, partySize: partyFor(s, best.e) }],
    },
  };
}

function freeTimeNote(s: ConciergeSnapshot, date: string): string | undefined {
  const offset = s.overview.embarkation.arrivalWindowStart.slice(-6);
  const taken = bookingsOn(s, date).map(busy);
  const free = (from: string, to: string) => {
    const a = Date.parse(`${date}T${from}:00${offset}`);
    const b = Date.parse(`${date}T${to}:00${offset}`);
    return !taken.some(([x, y]) => x < b && a < y);
  };
  if (free('13:30', '18:00')) return 'Your afternoon is free.';
  if (free('08:00', '12:30')) return 'Your morning is free.';
  return undefined;
}

function nextDayPrompt(date: string): string {
  const next = new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return `What is planned for ${formatLongDate(next)}?`;
}

export function scheduleAnswer(s: ConciergeSnapshot, body: string): Answer {
  const advice = /\b(should (i|we)|recommend|suggest\w*|ideas?|what (can|could) (i|we))\b/i.test(body);
  const ref: DayRef = dayIn(body, s) ?? (aboard(s) && !afterVoyage(s) ? { date: localDate(s, s.now), how: 'today' } : { date: localDate(s, s.now, 1), how: 'tomorrow' });
  const day = dayOn(s, ref.date);
  if (!day) return offVoyageDay(s, ref);

  const port = portOn(s, ref.date);
  const label = ref.how === 'today' ? `Today, ${formatLongDate(ref.date)}` : ref.how === 'tomorrow' ? `Tomorrow, ${formatLongDate(ref.date)}` : `On ${formatLongDate(ref.date)}`;
  const intro = `${label}, ${port ? portLine(s, port) : 'you are aboard.'}`;
  const arranged = bookingsOn(s, ref.date).sort((a, b) => a.start.localeCompare(b.start));
  const bookedTitles = new Set(arranged.map((b) => b.title.toLowerCase()));
  const programme = day.items.filter((i) => (i.kind === 'ship-event' || i.kind === 'port') && !i.bookingId && !bookedTitles.has(i.title.toLowerCase()));
  // Pick ideas that don't clash with each other either.
  const picked: { e: Experience; start: string }[] = [];
  for (const e of ideasFor(s, ref.date, port)) {
    if (picked.length >= (advice ? 3 : 2)) break;
    const slot = preferredSlots(s, e, ref.date).find((x) => {
      const span: [number, number] = [Date.parse(x.start), x.end ? Date.parse(x.end) : Date.parse(x.start) + (e.durationMinutes ?? 90) * 60_000];
      return !picked.some((p) => {
        const pe = p.e.durationMinutes ?? 90;
        return span[0] < Date.parse(p.start) + pe * 60_000 + 30 * 60_000 && Date.parse(p.start) < span[1] + 30 * 60_000;
      });
    });
    if (slot) picked.push({ e, start: slot.start });
  }
  const dinner = arranged.some((b) => b.category === 'dining') || port?.type === 'disembark' ? null : dinnerOffer(s, ref.date);
  const occasion = s.profile.occasions.find((o) => o.date === ref.date);

  // Chosen by rank, told in time order.
  const ideaLines = [...picked]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(({ e, start }) => {
      const why = reasonFor(s, e.id);
      return `${formatTime(start)} — ${e.title}${why ? `. ${why}` : `: ${e.subtitle.charAt(0).toLowerCase()}${e.subtitle.slice(1)}`}`;
    });
  const arrangedBlock = arranged.length ? `Already arranged:\n${bullet(arranged.map((b) => bookingLine(s, b)))}` : 'Nothing is booked yet.';
  const programmeBlock = programme.length ? `Aboard:\n${bullet(programme.map((i) => `${formatTime(i.start)} — ${i.title}`))}` : undefined;
  const free = freeTimeNote(s, ref.date);
  const ideasBlock = ideaLines.length
    ? `${advice ? 'I would suggest' : `${free ? `${free} ` : ''}Should you wish`}${s.recommendations.length ? ', chosen with you in mind' : ''}:\n${bullet(ideaLines)}`
    : undefined;
  const practical = [
    occasion ? `It is your ${occasion.label.charAt(0).toLowerCase()}${occasion.label.slice(1)}; ${s.ambassador.firstName} has the day in hand.` : undefined,
    day.sunset ? `Sunset is at ${formatTime(day.sunset)}.` : undefined,
    day.dressCode ? `Dress code this evening: ${day.dressCode.toLowerCase()}.` : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  const body_ = advice
    ? paragraphs(intro, ideasBlock, arrangedBlock, dinner?.line, practical)
    : paragraphs(intro, arrangedBlock, programmeBlock, dinner?.line, ideasBlock, practical);

  const cards = [...picked.map((p) => offerCard(s, p.e, ref.date, 2, p.start)), dinner?.card].filter((c): c is ConciergeAttachment => Boolean(c));
  return {
    intent: 'schedule.query',
    body: body_,
    attachments: [{ kind: 'schedule', dayNumber: day.dayNumber }, ...cards],
    suggestions: [arranged.some((b) => b.category === 'dining') ? 'Move my dinner reservation.' : undefined, ref.date < s.overview.voyage.endDate ? nextDayPrompt(ref.date) : undefined, port && port.type !== 'sea' ? 'Arrange transportation.' : undefined].filter(
      (x): x is string => Boolean(x),
    ),
    confidence: 0.93,
  };
}

/** A day before or after the voyage: what needs the guest, and what is next. */
function offVoyageDay(s: ConciergeSnapshot, ref: DayRef): Answer {
  const { voyage, documents, flights, embarkation } = s.overview;
  const label = ref.how === 'today' ? `Today, ${formatLongDate(ref.date)}` : ref.how === 'tomorrow' ? `Tomorrow, ${formatLongDate(ref.date)}` : formatLongDate(ref.date);
  const firstDay = s.days.find((d) => d.date === voyage.startDate);
  if (ref.date > voyage.endDate) {
    const home = flights.find((f) => f.direction === 'outbound');
    return {
      intent: 'schedule.query',
      body: paragraphs(`${label}: your voyage aboard ${s.overview.yacht.name} has ended.`, home && home.departure.slice(0, 10) === ref.date ? `${home.flightNumber} leaves ${home.origin} at ${formatTime(home.departure)}.` : undefined, `Whenever you are ready to plan the next one, I would be delighted to help.`),
      suggestions: ['What benefits do I have?'],
      confidence: 0.85,
    };
  }
  const dueThatDay = documents.filter((d) => d.status === 'required' && d.dueBy === ref.date);
  const flightsThatDay = flights.filter((f) => f.departure.slice(0, 10) === ref.date);
  const nextDue = documents.filter((d) => d.status === 'required' && d.dueBy && d.dueBy >= localDate(s, s.now)).sort((a, b) => (a.dueBy ?? '').localeCompare(b.dueBy ?? ''))[0];
  const inbound = flights.find((f) => f.direction === 'inbound');
  const things = [
    ...dueThatDay.map((d) => `${d.label} is due`),
    ...flightsThatDay.map((f) => `${formatTime(f.departure)} — ${f.carrier} ${f.flightNumber}, ${f.origin} to ${f.destination}${f.trackedForTransfer ? '; your driver tracks it' : ''}`),
  ];
  const home = s.profile.guest.homeCity?.split(',')[0];
  const first = firstDay?.items.filter((i) => i.kind === 'booking').slice(0, 2).map((i) => i.title.charAt(0).toLowerCase() + i.title.slice(1));
  const cards: ConciergeAttachment[] = [];
  if (nextDue) cards.push({ kind: 'actions', title: nextDue.label, detail: `Due by ${formatLongDate(nextDue.dueBy!)} · about two minutes`, actions: [{ kind: 'open', label: 'Complete now', route: '/voyage?section=documents' }] });
  if (firstDay) cards.push({ kind: 'schedule', dayNumber: firstDay.dayNumber });
  return {
    intent: 'schedule.query',
    body: paragraphs(
      things.length ? `${label}:\n${bullet(things)}` : `${label}, you are still at home${home ? ` in ${home}` : ''}, and nothing needs you.`,
      nextDue && !dueThatDay.includes(nextDue) ? `One small thing: your ${nextDue.label.toLowerCase()} is due by ${formatLongDate(nextDue.dueBy!)}. It takes about two minutes.` : undefined,
      inbound && inbound.departure.slice(0, 10) > ref.date ? `Your journey begins on ${formatLongDate(inbound.departure)}: ${inbound.flightNumber} leaves ${inbound.origin === s.profile.guest.homeAirport && home ? home : inbound.origin} at ${formatTime(inbound.departure)}.` : undefined,
      firstDay && first?.length ? `On your first day, ${formatLongDate(voyage.startDate)}, ${list(first)}, then embarkation from ${formatTime(embarkation.arrivalWindowStart)}.` : undefined,
    ),
    attachments: cards,
    suggestions: ['What is planned for my first day?', 'Arrange transportation.'],
    confidence: 0.9,
  };
}

// ─── Dining ────────────────────────────────────────────────────────────────

export function diningAnswer(s: ConciergeSnapshot, body: string): Answer {
  const ref = dayIn(body, s);
  const wanted = timeIn(body);
  const dinners = s.bookings.filter((b) => b.category === 'dining' && b.status !== 'cancelled' && b.status !== 'declined').sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = dinners.filter((b) => Date.parse(b.start) > s.now.getTime());
  const target = ref ? dinners.find((b) => b.start.slice(0, 10) === ref.date) : upcoming[0];

  if (!target) {
    const date = ref?.date ?? localDate(s, s.now);
    const offer = dinnerOffer(s, date);
    return {
      intent: 'dining.modify',
      body: paragraphs(ref ? `You have no dinner reservation on ${formatLongDate(date)}.` : 'You have no dinner reservations ahead.', offer?.line ?? 'Shall I ask the restaurants what they can offer?'),
      attachments: offer ? [offer.card] : [],
      confidence: 0.85,
    };
  }

  const exp = experienceById(s, target.experienceId);
  const when = `${formatLongDate(target.start)} at ${formatTime(target.start)}`;
  const others = upcoming.filter((b) => b.id !== target.id).slice(0, 2);

  // Private dinners are composed by a person, not moved from a list of slots.
  if (target.status === 'in_progress' || exp?.format === 'private') {
    return {
      intent: 'dining.modify',
      body: paragraphs(`${target.title} on ${when} is being arranged personally by ${s.ambassador.firstName}${target.note ? `: ${target.note.charAt(0).toLowerCase()}${target.note.slice(1)}` : '.'}`, `I'll ask ${s.ambassador.firstName} to change it with you, so nothing about the evening is lost.`),
      attachments: [
        {
          kind: 'actions',
          title: target.title,
          detail: `${formatLongDate(target.start)} · ${formatTime(target.start)}`,
          subject: { bookingId: target.id },
          actions: [
            { kind: 'escalate', label: `Ask ${s.ambassador.firstName}`, to: 'suite-ambassador', reason: 'guest-request' },
            { kind: 'service-request', label: 'Send a note', type: 'dining-change', summary: `Change the time of ${target.title.toLowerCase()}, ${formatShortDate(target.start)}` },
          ],
        },
      ],
      confidence: 0.85,
    };
  }

  const party = target.partySize;
  const preferred = wanted ?? s.profile.preferences.dining.preferredTime ?? target.start.slice(11, 16);
  const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  const elsewhere = s.bookings.filter((b) => b.id !== target.id && b.start.slice(0, 10) === target.start.slice(0, 10) && b.status !== 'cancelled').map(busy);
  const options = (s.availability.find((a) => a.experienceId === target.experienceId)?.slots ?? [])
    .filter((x) => x.start.slice(0, 10) === target.start.slice(0, 10) && x.start !== target.start && x.remaining >= party && Math.abs(minutes(x.start.slice(11, 16)) - minutes(target.start.slice(11, 16))) <= 120)
    .filter((x) => {
      const start = Date.parse(x.start);
      return !elsewhere.some(([a, b]) => start < b && a < start + 2.5 * 3_600_000);
    })
    .sort((a, b) => Math.abs(minutes(a.start.slice(11, 16)) - minutes(preferred)) - Math.abs(minutes(b.start.slice(11, 16)) - minutes(preferred)))
    .slice(0, 3)
    .sort((a, b) => a.start.localeCompare(b.start));
  const venue = venueName(target);
  const table = tableNote(s, target).replace(', at your', 'your');
  const exact = wanted ? options.find((o) => o.start.slice(11, 16) === wanted) : undefined;

  const opening = `Of course. You are at ${venue} on ${when}${tableNote(s, target)}.`;
  const offer = exact
    ? `${wanted} is free at ${venue}${table ? `, and ${table} would be held` : ''}. Shall I move it?`
    : wanted
      ? `${wanted} isn't available at ${venue} that evening. ${options.length ? `I can offer ${list(options.map((o) => formatTime(o.start)), 'or')}.` : ''}`
      : options.length
        ? `I can move it to ${list(options.map((o) => formatTime(o.start)), 'or')}${table ? `, with ${table} held` : ''}.`
        : `${venue} is full at other times that evening. Shall I ask the maître d' to find a way?`;
  const card: ConciergeAttachment = {
    kind: 'actions',
    title: target.title,
    detail: `${formatLongDate(target.start)} · party of ${party}`,
    subject: { bookingId: target.id },
    actions: options.length
      ? options.map((o) => ({ kind: 'change-booking', label: `Move to ${formatTime(o.start)}`, bookingId: target.id, start: o.start }))
      : [{ kind: 'service-request', label: "Ask the maître d'", type: 'dining-change', summary: `Another time for ${target.title.toLowerCase()}, ${formatShortDate(target.start)}` }],
  };
  return {
    intent: 'dining.modify',
    body: paragraphs(opening, offer, others.length ? `If you meant another evening, tell me which: you also dine on ${list(others.map((b) => formatLongDate(b.start)))}.` : undefined),
    attachments: [card],
    suggestions: ['Keep it as it is', ...others.slice(0, 1).map((b) => `Move dinner on ${formatLongDate(b.start)}`)],
    confidence: 0.88,
  };
}

// ─── Discover ──────────────────────────────────────────────────────────────

export function discoverAnswer(s: ConciergeSnapshot, body: string): Answer {
  const today = localDate(s, s.now);
  const shoreDays = s.overview.voyage.itinerary.filter((p) => p.type !== 'sea' && p.date >= today);
  const port = portIn(body, s.overview.voyage.itinerary) ?? shoreDays.find((p) => p.type !== 'disembark') ?? shoreDays[0];
  if (!port) return { intent: 'experience.discover', body: 'Your voyage has no more ports ahead. I would be glad to help with anything aboard.', confidence: 0.6 };
  const calls = s.overview.voyage.itinerary.filter((p) => p.portName === port.portName);
  const privateOnly = /\b(private|exclusive|just us|alone)\b/i.test(body);
  const exps = ranked(
    s,
    s.catalogue.filter((e) => e.portCallId && calls.some((c) => c.id === e.portCallId) && e.category !== 'transfer' && (!privateOnly || e.format === 'private' || e.privateAvailable)),
  );
  const booked = exps.filter((e) => isBooked(s, e.id));
  const open = exps.filter((e) => !isBooked(s, e.id));
  const dates = list(calls.map((c) => formatLongDate(c.date)));
  const party = companionName(s) ? `for you and ${companionName(s)}` : 'for your party';

  const line = (e: Experience) => {
    const a = s.availability.find((x) => x.experienceId === e.id);
    const note = a?.status === 'unavailable' ? ' (fully booked; I can ask)' : a?.status === 'waitlist' ? ' (on request)' : a?.status === 'limited' ? ` (${a.note ?? 'few places left'})` : '';
    return `${e.title}: ${e.subtitle.charAt(0).toLowerCase()}${e.subtitle.slice(1)}${note}`;
  };
  const top = open[0];
  const topReason = top ? reasonFor(s, top.id) : undefined;
  const bookedLines = booked.map((e) => {
    const b = s.bookings.find((x) => x.experienceId === e.id)!;
    return `${e.title}, ${formatLongDate(b.start)} at ${formatTime(b.start)}`;
  });

  const cards: ConciergeAttachment[] = [];
  for (const e of open) {
    if (cards.length >= 3) break;
    const card = calls.map((c) => offerCard(s, e, c.date, 2)).find(Boolean);
    if (card) cards.push(card);
    else if (!isOpenRequestFor(s, e.id))
      cards.push({ kind: 'actions', title: e.title, detail: [dates, experienceMeta(e)].join(' · '), subject: { experienceId: e.id }, actions: [{ kind: 'service-request', label: 'Ask about availability', type: 'excursion', summary: `${e.title} in ${port.portName}: is there any availability?` }] });
  }
  return {
    intent: 'experience.discover',
    body: paragraphs(
      open.length ? `In ${port.portName} (${dates}), these can be arranged ${privateOnly ? `privately ${party}` : party}:\n${bullet(open.map(line))}` : `Everything ${privateOnly ? 'private ' : ''}in ${port.portName} is already yours.`,
      top && topReason ? `I would begin with ${top.title}. ${topReason}` : undefined,
      bookedLines.length ? `Already arranged: ${list(bookedLines)}.` : undefined,
    ),
    attachments: cards,
    suggestions: [`What is planned in ${port.portName}?`, 'Arrange transportation.'],
    confidence: 0.9,
  };
}

// ─── Transport ─────────────────────────────────────────────────────────────

export function transportAnswer(s: ConciergeSnapshot): Answer {
  const now = s.now.getTime();
  const prefs = s.profile.preferences.transportation;
  const transfers = s.bookings.filter((b) => b.category === 'transfer' && Date.parse(b.start) > now - 86_400_000 && b.status !== 'cancelled');
  const tracked = s.overview.flights.filter((f) => f.trackedForTransfer && Date.parse(f.arrival) > now);
  const today = localDate(s, s.now);
  // Days ashore ahead with no car among the plans.
  const carDays = s.overview.voyage.itinerary
    .filter((p) => p.date >= today && (p.type === 'port' || p.type === 'overnight' || p.type === 'tender'))
    .filter((p) => !bookingsOn(s, p.date).some((b) => /\bcar\b/i.test(b.venue)))
    .filter((p, i, all) => all.findIndex((x) => x.portName === p.portName) === i)
    .slice(0, 2);
  const heli = s.catalogue.find((e) => e.category === 'transfer' && /helicopter/i.test(e.title));
  const heliRequest = heli ? s.requests.find((r) => r.experienceId === heli.id && OPEN_STATUSES.includes(r.status)) : undefined;

  const cards: ConciergeAttachment[] = carDays.map((p) => ({
    kind: 'actions',
    title: `A private car in ${p.portName}`,
    detail: `${formatLongDate(p.date)}${p.arrival ? ` · from ${formatTime(p.arrival)}` : ''}${p.allAboard ? ` · back by ${formatTime(p.allAboard)}` : ''}`,
    actions: [
      {
        kind: 'service-request',
        label: 'Arrange it',
        type: 'transport',
        summary: `Private car in ${p.portName}, ${formatShortDate(p.date)}`,
        details: [prefs.arrivals === 'private-car' ? 'Private car' : prefs.arrivals === 'private-van' ? 'Private van' : 'Car', prefs.notes].filter(Boolean).join('. '),
      },
    ],
  }));
  if (heli && prefs.helicopterWelcome && !heliRequest) {
    cards.push({ kind: 'actions', title: heli.title, detail: [heli.subtitle, experienceMeta(heli)].join(' · '), subject: { experienceId: heli.id }, actions: [{ kind: 'service-request', label: 'Ask for it', type: 'transport', summary: `${heli.title}: ${heli.subtitle.toLowerCase()}` }] });
  }
  return {
    intent: 'transport.arrange',
    body: paragraphs(
      transfers.length ? `Happily. Already arranged:\n${bullet(transfers.map((t) => `${formatLongDate(t.start)}, ${formatTime(t.start)} — ${t.title} (${venueName(t)})`))}` : 'Happily. Nothing is arranged yet.',
      tracked.length ? `We are tracking ${list(tracked.map((f) => f.flightNumber))}; your driver adjusts if a flight is early or late.` : undefined,
      heliRequest ? `Your request for the ${heli!.title.toLowerCase()} ${statusPhrase(heliRequest.status)}${nextUpdate(s, heliRequest)}.` : undefined,
      carDays.length ? `For your days ashore, I can add a car${prefs.notes ? `, with your note: “${prefs.notes.replace(/[.\s]+$/, '')}”` : ''}.` : undefined,
    ),
    attachments: cards,
    suggestions: ['What is planned for tomorrow?'],
    confidence: 0.86,
  };
}

// ─── Benefits ──────────────────────────────────────────────────────────────

export function benefitsAnswer(s: ConciergeSnapshot): Answer {
  const { membership, relationship, privileges } = s.recognition;
  const ordinal = ordinalWord(relationship.voyagesCompleted + 1);
  const continuity = relationship.ambassadorName && relationship.ambassadorName === s.ambassador.name;
  return {
    intent: 'loyalty.benefits',
    body: paragraphs(
      `As a Marriott Bonvoy ${membership.tierLabel} member${membership.lifetimeStatus ? ` (${membership.lifetimeStatus})` : ''}, returning for your ${ordinal} voyage with us, this is yours aboard ${s.overview.voyage.name}:\n${bullet(privileges.map((p) => p.title))}`,
      continuity ? `${s.ambassador.firstName}, who has looked after you before, is your ${s.ambassador.title} again.` : undefined,
    ),
    attachments: [{ kind: 'privileges', privilegeIds: privileges.map((p) => p.id) }],
    suggestions: ['Help me celebrate my anniversary.', 'What is planned for tomorrow?'],
    confidence: 0.95,
  };
}

// ─── Occasions ─────────────────────────────────────────────────────────────

/** "birthday" for the guest's own, else the label ("20th wedding anniversary"). */
function occasionName(s: ConciergeSnapshot, o: ConciergeSnapshot['profile']['occasions'][number]): string {
  if (o.type === 'birthday' && o.personIds.length === 1 && o.personIds[0] === s.profile.guest.id) return 'birthday';
  return o.label.charAt(0).toLowerCase() + o.label.slice(1);
}

export function occasionAnswer(s: ConciergeSnapshot, body: string): Answer {
  const { startDate, endDate } = s.overview.voyage;
  const wantsBirthday = /birthday/i.test(body);
  const candidates = s.profile.occasions.filter((o) => (wantsBirthday ? o.type === 'birthday' : o.type !== 'birthday' || !/anniversary/i.test(body)));
  const occ = candidates.find((o) => o.date >= startDate && o.date <= endDate) ?? candidates[0];
  if (!occ) {
    return {
      intent: 'occasion.plan',
      body: `I would love to help. Tell me a little about the occasion, or I can ask ${s.ambassador.firstName} to plan it with you personally.`,
      attachments: [escalateCard(s, 'Plan it with a person')],
      confidence: 0.75,
    };
  }
  if (occ.date < startDate || occ.date > endDate) {
    return {
      intent: 'occasion.plan',
      body: `Your ${occasionName(s, occ)} is on ${formatLongDate(occ.date)}, after this voyage. Shall I ask ${s.ambassador.firstName} to note it for the future?`,
      attachments: [escalateCard(s, occ.label, formatLongDate(occ.date))],
      confidence: 0.8,
    };
  }
  const port = portOn(s, occ.date);
  const label = occasionName(s, occ);
  const days = Math.round((Date.parse(`${occ.date}T12:00:00Z`) - Date.parse(`${localDate(s, s.now)}T12:00:00Z`)) / 86_400_000);
  const that = bookingsOn(s, occ.date).sort((a, b) => a.start.localeCompare(b.start));
  // Requests about the day that aren't already shown as a booking above.
  const related = s.requests.filter((r) => OPEN_STATUSES.includes(r.status) && r.type === 'occasion' && !that.some((b) => b.id === r.bookingId));
  const companion = companionName(s);
  const tone =
    occ.recognition === 'discreet'
      ? 'quietly, as you prefer'
      : occ.recognition === 'private'
        ? 'and it stays between us unless you say otherwise'
        : 'with as much ceremony as you like';
  const shared = s.profile.preferences.privacy.shareOccasionsWithCrew;

  const ideas = ranked(
    s,
    s.catalogue.filter((e) => e.tags.includes('occasion') && !isBooked(s, e.id) && e.category !== 'dining'),
  )
    .map((e) => ({ e, card: offerCard(s, e, occ.date, 2) }))
    .filter((x): x is { e: Experience; card: ConciergeAttachment } => x.card !== null)
    .slice(0, 2);
  const flowers: ConciergeAttachment = {
    kind: 'actions',
    title: 'Flowers in the suite',
    detail: `${formatLongDate(occ.date)} · ${s.overview.suite.name} ${s.overview.suite.number}`,
    actions: [{ kind: 'service-request', label: 'Arrange flowers', type: 'occasion', summary: `Flowers in ${s.overview.suite.name} ${s.overview.suite.number} for the ${label}, ${formatShortDate(occ.date)}` }],
  };
  return {
    intent: 'occasion.plan',
    body: paragraphs(
      `Your ${label} is on ${formatLongDate(occ.date)}${port ? `, in ${port.portName}` : ''}${days > 0 ? `, ${days} ${days === 1 ? 'day' : 'days'} from now` : days === 0 ? ', today' : ''}. ${s.ambassador.firstName} is looking after it ${tone}.`,
      that.length ? `Already in place${companion ? ` for you and ${companion}` : ''}:\n${bullet(that.map((b) => bookingLine(s, b)))}` : undefined,
      related.length ? bullet(related.map((r) => `${r.summary}: ${STATUS_WORDS[r.status]}${nextUpdate(s, r, ', next update by')}`)) : undefined,
      ideas.length ? `A few more ideas:\n${bullet(ideas.map(({ e }) => `${e.title}. ${reasonFor(s, e.id) ?? e.subtitle}`))}` : undefined,
      shared ? undefined : `Your crew have not been told about the occasion (Privacy settings). Anything you ask for here goes to ${s.ambassador.firstName} only.`,
    ),
    attachments: [
      ...ideas.map((x) => x.card),
      flowers,
      {
        kind: 'actions',
        title: `Plan the day with ${s.ambassador.firstName}`,
        detail: `${s.ambassador.title} · in person or in this conversation`,
        actions: [{ kind: 'escalate', label: `Ask ${s.ambassador.firstName}`, to: 'suite-ambassador', reason: 'guest-request' }],
      },
    ],
    suggestions: [companion ? `Keep it a surprise for ${companion}` : 'Keep it a surprise', `What is planned for ${formatLongDate(occ.date)}?`],
    confidence: 0.86,
  };
}

// ─── Request status ────────────────────────────────────────────────────────

export function statusAnswer(s: ConciergeSnapshot, body: string): Answer {
  const words = keywords(body);
  const mentioned = s.requests.filter((r) => words.some((w) => `${r.summary} ${r.details ?? ''}`.toLowerCase().includes(w)));
  const open = s.requests.filter((r) => OPEN_STATUSES.includes(r.status));
  const shown = (mentioned.length ? mentioned : open).slice(0, 5);
  if (!shown.length) {
    return { intent: 'request.status', body: 'You have no requests open: everything you have asked for is complete.', suggestions: ['What is planned for tomorrow?'], confidence: 0.85 };
  }
  const TEAM: Record<ServiceRequest['assignedTeam'], string> = { 'shoreside-concierge': 'the shoreside concierge', 'suite-ambassador': s.ambassador.firstName, 'guest-services': 'Guest Services', medical: 'the Medical Centre', 'destination-services': 'Destination Services' };
  const who = (r: ServiceRequest) => `, with ${r.assignedTo ? r.assignedTo.split(',')[0] : TEAM[r.assignedTeam]}`;
  const overdue = shown.filter((r) => (r.status === 'received' || r.status === 'in_progress') && r.nextUpdateBy && Date.parse(r.nextUpdateBy) < s.now.getTime());
  const cards: ConciergeAttachment[] = shown.map((r) => ({ kind: 'service-request', requestId: r.id }));
  for (const r of shown.filter((x) => x.status === 'awaiting_guest' && x.experienceId)) {
    const e = experienceById(s, r.experienceId);
    const slot = e && (s.availability.find((a) => a.experienceId === e.id)?.slots ?? []).filter((x) => x.remaining > 0 && Date.parse(x.start) > s.now.getTime());
    if (e && slot?.length)
      cards.push({
        kind: 'actions',
        title: `${e.title}: choose a time`,
        detail: formatLongDate(slot[0]!.start),
        subject: { requestId: r.id, experienceId: e.id },
        actions: slot.slice(0, 3).map((x) => ({ kind: 'request-experience', label: formatTime(x.start), experienceId: e.id, start: x.start, partySize: partyFor(s, e), requestId: r.id })),
      });
  }
  return {
    intent: 'request.status',
    body: paragraphs(
      mentioned.length ? 'Here is where that stands:' : `You have ${open.length} ${open.length === 1 ? 'request' : 'requests'} open:`,
      bullet(shown.map((r) => `${r.summary}: ${STATUS_WORDS[r.status]}${who(r)}${nextUpdate(s, r, '; next update by')}`)),
      shown.some((r) => r.status === 'awaiting_guest') ? 'One is waiting for you: just choose below.' : undefined,
      overdue.length ? `${overdue.length === 1 ? 'That update is' : 'Those updates are'} overdue, and I am sorry. Shall I ask ${s.ambassador.firstName} to chase it?` : undefined,
    ),
    attachments: overdue.length
      ? [
          ...cards,
          { kind: 'actions', title: overdue.length === 1 ? overdue[0]!.summary : `${overdue.length} overdue updates`, detail: 'Overdue', subject: overdue.length === 1 ? { requestId: overdue[0]!.id } : undefined, actions: [{ kind: 'escalate', label: `Ask ${s.ambassador.firstName} to chase it`, to: 'suite-ambassador', reason: 'guest-request' }] },
        ]
      : cards,
    suggestions: ['What is planned for tomorrow?'],
    confidence: 0.88,
  };
}

// ─── People ────────────────────────────────────────────────────────────────

export function handoffAnswer(s: ConciergeSnapshot, to: EscalationTarget, reason: EscalationRequest['reason']): Answer {
  const amb = s.ambassador.firstName;
  const team = teamMember(s);
  const atHome = beforeVoyage(s) || afterVoyage(s);
  const body =
    to === 'medical'
      ? atHome
        ? `I am connecting you with ${s.team.medical.name} at the ${s.team.medical.title} now. If this is an emergency, please call your local emergency number first.`
        : `I am connecting you with ${s.team.medical.name} at the ${s.team.medical.title} now. If this is an emergency, press the red key on any suite telephone, and stay where you are.`
      : to === 'suite-ambassador'
        ? `Of course. I have asked ${amb} to join us. ${amb} will read everything we have discussed, so there is no need to repeat yourself.`
        : reason === 'complaint'
          ? `I am sorry. I have asked ${team.name.split(' ')[0]} from ${team.title} to speak with you personally, and ${amb} will know too.`
          : reason === 'low-confidence'
            ? `Let me bring in a person: ${team.name.split(' ')[0]} from ${team.title} will join us and can help at any hour.`
          : `Of course. ${team.name.split(' ')[0]} from ${team.title} will join us, a person rather than me, and can help at any hour.`;
  return { intent: to === 'medical' ? 'medical.assist' : 'human.handoff', body, confidence: 1, escalate: { to, reason } };
}

// ─── Opening ───────────────────────────────────────────────────────────────

/** Today's greeting and the requests worth settling now. */
export function openingAnswer(s: ConciergeSnapshot, prompts: string[]): Answer {
  const name = guestName(s);
  const today = localDate(s, s.now);
  const { voyage, embarkation } = s.overview;
  const port = portOn(s, today);
  const line = beforeVoyage(s)
    ? `Everything is in hand for ${voyage.itinerary[0]?.portName ?? 'embarkation'} on ${formatLongDate(voyage.startDate)}.`
    : afterVoyage(s)
      ? 'Welcome home. I hope the journey was a gentle one.'
      : port?.type === 'sea'
        ? `A day at sea aboard ${s.overview.yacht.name} today.`
        : port?.type === 'embark'
          ? `Welcome aboard ${s.overview.yacht.name}. Your arrival window opens at ${formatTime(embarkation.arrivalWindowStart)}.`
          : port
            ? `Welcome to ${port.portName}.`
            : `Welcome aboard ${s.overview.yacht.name}.`;
  const cards: ConciergeAttachment[] = [];
  for (const r of s.requests.filter((x) => x.status === 'awaiting_guest' && x.experienceId)) {
    const e = experienceById(s, r.experienceId);
    const slots = (s.availability.find((a) => a.experienceId === e?.id)?.slots ?? []).filter((x) => x.remaining > 0 && Date.parse(x.start) > s.now.getTime());
    if (e && slots.length)
      cards.push({
        kind: 'actions',
        title: r.summary,
        detail: 'Awaiting your choice',
        subject: { requestId: r.id, experienceId: e.id },
        actions: slots.slice(0, 3).map((x) => ({ kind: 'request-experience', label: formatTime(x.start), experienceId: e.id, start: x.start, partySize: partyFor(s, e), requestId: r.id })),
      });
  }
  const due = s.overview.documents.filter((d) => d.status === 'required' && d.dueBy && d.dueBy >= today).sort((a, b) => (a.dueBy ?? '').localeCompare(b.dueBy ?? ''))[0];
  if (due) cards.push({ kind: 'actions', title: due.label, detail: `Due by ${formatLongDate(due.dueBy!)} · about two minutes`, actions: [{ kind: 'open', label: 'Complete now', route: '/voyage?section=documents' }] });
  const pick = s.recommendations.map((r) => experienceById(s, r.experienceId)).find((e) => e && !isBooked(s, e.id) && !isOpenRequestFor(s, e.id) && suits(s, e) && s.days.some((d) => d.date >= today && preferredSlots(s, e, d.date).length));
  if (pick && cards.length < 3) {
    const day = s.days.find((d) => d.date >= today && preferredSlots(s, pick, d.date).length)!;
    const card = offerCard(s, pick, day.date, 2);
    if (card && card.kind === 'actions') cards.push({ ...card, detail: `${card.detail}${reasonFor(s, pick.id) ? ` · ${reasonFor(s, pick.id)}` : ''}` });
  }
  return {
    intent: 'general',
    body: paragraphs(`${greeting(s.now)}, ${name}. ${line} How may I help?`, cards.length ? 'A few things you may like to settle:' : undefined),
    attachments: cards.slice(0, 3),
    suggestions: prompts,
    confidence: 1,
  };
}

// ─── Router ────────────────────────────────────────────────────────────────

export function answer(s: ConciergeSnapshot, body: string, history: ConciergeMessage[], context: Pick<GuestContext, 'preferredName'>): Answer {
  const intent = classify(body, history, s.ambassador.firstName);
  switch (intent) {
    case 'medical.assist':
      return handoffAnswer(s, 'medical', 'medical');
    case 'human.handoff': {
      const toTeam = /\b(team|someone else|anyone|guest services|a person|a human|real person)\b/i.test(body) && !new RegExp(`\\b${s.ambassador.firstName}\\b|ambassador|butler`, 'i').test(body);
      return handoffAnswer(s, toTeam ? 'concierge-team' : 'suite-ambassador', 'guest-request');
    }
    case 'complaint':
      return handoffAnswer(s, 'concierge-team', 'complaint');
    case 'confirm.action': {
      const pending = pendingActions(history);
      const time = timeIn(body);
      const action = (time && pending.find((a) => 'start' in a && a.start.slice(11, 16) === time)) || pending[0];
      return { intent: 'general', body: '', confidence: 0.9, perform: action };
    }
    case 'dining.modify':
      return diningAnswer(s, body);
    case 'request.status':
      return statusAnswer(s, body);
    case 'occasion.plan':
      return occasionAnswer(s, body);
    case 'experience.discover':
      return discoverAnswer(s, body);
    case 'transport.arrange':
      return transportAnswer(s);
    case 'loyalty.benefits':
      return benefitsAnswer(s);
    case 'schedule.query':
      return scheduleAnswer(s, body);
    case 'gratitude':
      return { intent: 'gratitude', body: `It is my pleasure, ${context.preferredName}.`, confidence: 1 };
    case 'small-talk':
      return { intent: 'general', body: `${greeting(s.now)}, ${context.preferredName}. How may I help?`, confidence: 1 };
    default: {
      // A second miss in a row goes straight to a person.
      const lastAi = [...history].reverse().find((m) => m.author === 'ai');
      if (lastAi?.intent === 'general' && /pass it to/.test(lastAi.body)) return handoffAnswer(s, 'concierge-team', 'low-confidence');
      return {
        intent: 'general',
        body: `I want to be sure this is done properly. Shall I pass it to ${s.ambassador.firstName}, your ${s.ambassador.title}, or to the concierge team?`,
        attachments: [escalateCard(s, 'Speak with a person')],
        suggestions: ['What is planned for tomorrow?'],
        confidence: 0.4,
      };
    }
  }
}
