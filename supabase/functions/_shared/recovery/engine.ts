// Service recovery: the rules.
//
// Pure and deterministic: no I/O, no clock (the context carries `now`).
// The same disruption and context always give the same plan, so the app's
// notice and the server's recorded event agree to the word.
import type {
  Disruption,
  DisruptionCause,
  DisruptionKind,
  GuestDisruption,
  RecoveryAlternative,
  RecoveryAssessment,
  RecoveryBooking,
  RecoveryContext,
  RecoveryExperience,
  RecoveryOwner,
  RecoveryPlan,
  RecoveryRequest,
  RecoverySeverity,
  RecoveryStep,
} from './types.ts';
import { DISRUPTION_KINDS, SEVERITIES } from './types.ts';

export const ENGINE_VERSION = 'recovery-rules-v1';

const MIN = 60_000;
const ms = (iso: string) => Date.parse(iso);
const hhmm = (iso: string) => iso.slice(11, 16);
const dateOf = (iso: string) => iso.slice(0, 10);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Tuesday 18 May". */
export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[day]} ${d} ${MONTHS[m - 1]}`;
}

const SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };
export function money(p: { amountMinor: number; currency: string }): string {
  const whole = Math.round(p.amountMinor / 100);
  const n = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return SYMBOL[p.currency] ? `${SYMBOL[p.currency]}${n}` : `${n} ${p.currency}`;
}

/** An instant as ISO with the offset of `timeZone`. */
export function inZone(now: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  const offset = Math.round((Date.parse(`${local}Z`) - Math.floor(now.getTime() / 1000) * 1000) / MIN);
  const abs = Math.abs(offset);
  return `${local}${offset < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/**
 * "Now" in port time, so follow-up times read as the crew and guest read
 * them: where the yacht is today; before the voyage, the first port; after it, the last.
 */
export function voyageNow(now: Date, ports: { date: string; timeZone: string }[]): string {
  const today = now.toISOString().slice(0, 10);
  const here = ports.find((p) => p.date === today) ?? (ports[0] && today < ports[0].date ? ports[0] : ports[ports.length - 1]);
  return here ? inZone(now, here.timeZone) : now.toISOString();
}

export const isKind = (v: unknown): v is DisruptionKind => (DISRUPTION_KINDS as readonly unknown[]).includes(v);

const ACTIVE_BOOKING = (b: RecoveryBooking) => !['cancelled', 'declined'].includes(b.status);
const ACTIVE_REQUEST = (r: RecoveryRequest) => ['submitted', 'acknowledged', 'in_progress'].includes(r.status);

// ─── From operational events ───────────────────────────────────────────────

export interface JourneyEventLike {
  type: string;
  reservationId: string;
  guestIds: string[];
  occurredAt: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined);
const cause = (v: unknown, fallback: DisruptionCause): DisruptionCause =>
  ['weather', 'operational', 'supplier', 'safety', 'guest-feedback', 'unknown'].includes(v as string) ? (v as DisruptionCause) : fallback;

const EVENT_KINDS: Record<string, DisruptionKind> = {
  'transfer.delayed': 'transfer-delay',
  'dining.cancelled': 'dining-cancellation',
  'excursion.cancelled': 'excursion-cancellation',
  'suite.issue_reported': 'suite-issue',
  'itinerary.port_changed': 'port-change',
  'weather.disruption': 'weather-disruption',
  'service.missed': 'missed-service',
  'guest.complaint': 'guest-complaint',
};

/** Journey events that mean a disruption, as one; everything else is not one (null). */
export function fromJourneyEvent(e: JourneyEventLike): Disruption | null {
  const kind = EVENT_KINDS[e.type];
  if (!kind) return null;
  const p = e.payload ?? {};
  const guest = str(p.guestReason) ?? str(p.reason);
  const internal = str(p.internalReason);
  const details: NonNullable<Disruption['details']> = {};
  const delay = num(p.delayMinutes);
  if (delay !== undefined) details.delayMinutes = delay;
  const newTime = str(p.newPickupLocal) ?? str(p.newTime);
  if (newTime && /^\d{4}-\d{2}-\d{2}T/.test(newTime)) details.newTime = newTime;
  for (const k of ['fromPort', 'toPort', 'toPortCallId', 'date', 'quote'] as const) {
    const v = str(p[k]);
    if (v) details[k] = v;
  }
  const subject: Disruption['subject'] = {};
  for (const k of ['bookingId', 'experienceId', 'requestId', 'portCallId', 'title', 'venue'] as const) {
    const v = str(p[k]);
    if (v) subject[k] = v;
  }
  const start = str(p.startLocal) ?? str(p.start);
  if (start && /^\d{4}-\d{2}-\d{2}T/.test(start)) subject.start = start;
  const d: Disruption = {
    key: `event:${e.dedupeKey}`,
    kind,
    reservationId: e.reservationId,
    guestIds: e.guestIds ?? [],
    occurredAt: e.occurredAt,
    source: 'journey-event',
    cause: cause(p.cause, kind === 'weather-disruption' ? 'weather' : kind === 'guest-complaint' ? 'guest-feedback' : 'unknown'),
    subject,
  };
  if (guest || internal) d.reason = { ...(guest ? { guest } : {}), ...(internal ? { internal } : {}) };
  if (Object.keys(details).length) d.details = details;
  return d;
}

// ─── From the guest's own data ─────────────────────────────────────────────

/** Words that mean the guest is unhappy, not just asking. */
const COMPLAINT = /\b(disappoint\w*|unacceptable|complain\w*|not happy|unhappy|upset|rude|poor service|terrible|awful|let down|still waiting|no one came|nobody came|again\b.*\b(broken|wrong|late))/i;
const SUITE_FAULT = /\b(not working|broken|leak\w*|noise|noisy|smell\w*|too (hot|cold)|air[- ]?con\w*|shower|no hot water|won.t (close|open|lock)|difficult to close)\b/i;

/**
 * Disruptions visible in the guest's own requests: a promised update that did
 * not come (missed service), something wrong in the suite, and a request
 * that reads as a complaint. Keys are stable, so a scan can run often.
 */
export function detectDisruptions(ctx: RecoveryContext, reservationId: string, guestIds: string[]): Disruption[] {
  const now = ms(ctx.now);
  const out: Disruption[] = [];
  for (const r of ctx.requests) {
    // Raised from a recovery already: that recovery owns it.
    if (r.occasionStep?.startsWith('recovery:')) continue;
    const base = { reservationId, guestIds, source: 'detected' as const, subject: { requestId: r.id, title: r.title } };
    const text = `${r.title}\n${r.description}`;
    if (COMPLAINT.test(text)) {
      out.push({ ...base, key: `complaint:${r.id}`, kind: 'guest-complaint', occurredAt: r.createdAt, cause: 'guest-feedback', details: { quote: r.description.slice(0, 300) } });
    } else if (ACTIVE_REQUEST(r) && (r.category === 'maintenance' || (r.category === 'suite' && SUITE_FAULT.test(text)))) {
      out.push({ ...base, key: `suite:${r.id}`, kind: 'suite-issue', occurredAt: r.createdAt, cause: 'operational', details: { quote: r.description.slice(0, 300) } });
    }
    if (ACTIVE_REQUEST(r) && r.nextUpdateBy && ms(r.nextUpdateBy) < now) {
      out.push({ ...base, key: `missed:${r.id}:${r.nextUpdateBy}`, kind: 'missed-service', occurredAt: r.nextUpdateBy, cause: 'operational' });
    }
  }
  return out.sort((a, b) => ms(a.occurredAt) - ms(b.occurredAt) || (a.key < b.key ? -1 : 1));
}

// ─── Assessment ────────────────────────────────────────────────────────────

const SLA_MINUTES: Record<RecoverySeverity, number> = { low: 120, moderate: 60, high: 30, critical: 15 };

const OWNER: Record<DisruptionKind, RecoveryOwner> = {
  'transfer-delay': 'shore-operations',
  'dining-cancellation': 'restaurant-manager',
  'excursion-cancellation': 'shore-operations',
  'suite-issue': 'housekeeping',
  'port-change': 'guest-services-manager',
  'weather-disruption': 'concierge',
  'missed-service': 'suite-ambassador',
  'guest-complaint': 'guest-services-manager',
};

export const OWNER_LABEL: Record<RecoveryOwner, string> = {
  'suite-ambassador': 'Suite Ambassador',
  concierge: 'Concierge',
  'shore-operations': 'Shore Operations',
  'restaurant-manager': 'Restaurant Manager',
  housekeeping: 'Executive Housekeeper',
  'guest-services-manager': 'Guest Services Manager',
};

export const KIND_LABEL: Record<DisruptionKind, string> = {
  'transfer-delay': 'Transfer delay',
  'dining-cancellation': 'Dining cancellation',
  'excursion-cancellation': 'Excursion cancellation',
  'suite-issue': 'Suite issue',
  'port-change': 'Port change',
  'weather-disruption': 'Weather disruption',
  'missed-service': 'Missed service',
  'guest-complaint': 'Guest complaint',
};

const bump = (s: RecoverySeverity, by = 1): RecoverySeverity => SEVERITIES[Math.min(SEVERITIES.length - 1, SEVERITIES.indexOf(s) + by)]!;
export const atLeast = (s: RecoverySeverity, min: RecoverySeverity) => SEVERITIES.indexOf(s) >= SEVERITIES.indexOf(min);

interface Subject {
  booking?: RecoveryBooking;
  experience?: RecoveryExperience;
  request?: RecoveryRequest;
  title: string;
  date?: string;
  start?: string;
}

/**
 * The disruption with a snapshot of what it touches, taken from the guest's
 * data when it is recorded: a cancelled booking leaves the guest's lists, but
 * the notice still needs its title, time and place.
 */
export function withSubjectSnapshot(d: Disruption, ctx: RecoveryContext): Disruption {
  const b = d.subject.bookingId ? ctx.bookings.find((x) => x.id === d.subject.bookingId) : undefined;
  const r = d.subject.requestId ? ctx.requests.find((x) => x.id === d.subject.requestId) : undefined;
  if (!b && !r) return d;
  const subject = { ...d.subject };
  if (b) {
    subject.experienceId ??= b.experienceId;
    subject.title ??= b.title;
    subject.start ??= b.start;
    if (b.end) subject.end ??= b.end;
    if (b.venue) subject.venue ??= b.venue;
    subject.partySize ??= b.partySize;
  } else if (r) {
    subject.title ??= r.title;
    if (r.experienceId) subject.experienceId ??= r.experienceId;
  }
  return { ...d, subject };
}

function subjectOf(d: Disruption | GuestDisruption, ctx: RecoveryContext): Subject {
  const found = d.subject.bookingId ? ctx.bookings.find((b) => b.id === d.subject.bookingId) : undefined;
  // The snapshot wins: the same notice reads the same whether or not the booking is still listed.
  const booking: RecoveryBooking | undefined = d.subject.bookingId && (found || d.subject.start)
    ? {
        id: d.subject.bookingId,
        experienceId: d.subject.experienceId ?? found?.experienceId ?? '',
        title: d.subject.title ?? found?.title ?? FALLBACK_TITLE[d.kind],
        category: found?.category ?? '',
        venue: d.subject.venue ?? found?.venue ?? '',
        start: d.subject.start ?? found!.start,
        ...((d.subject.end ?? found?.end) ? { end: d.subject.end ?? found?.end } : {}),
        partySize: d.subject.partySize ?? found?.partySize ?? ctx.guest.partySize,
        status: found?.status ?? 'cancelled',
      }
    : undefined;
  const experienceId = d.subject.experienceId ?? booking?.experienceId;
  const experience = experienceId ? ctx.catalogue.find((x) => x.id === experienceId) : undefined;
  const request = d.subject.requestId ? ctx.requests.find((r) => r.id === d.subject.requestId) : undefined;
  const title = d.subject.title ?? booking?.title ?? experience?.title ?? request?.title ?? FALLBACK_TITLE[d.kind];
  const start = d.details?.newTime && d.kind !== 'transfer-delay' ? d.details.newTime : booking?.start;
  const date = d.details?.date ?? (start ? dateOf(start) : undefined) ?? (d.subject.portCallId ? ctx.itinerary.find((p) => p.id === d.subject.portCallId)?.date : undefined);
  return { booking, experience, request, title, date, start };
}

const FALLBACK_TITLE: Record<DisruptionKind, string> = {
  'transfer-delay': 'Your transfer',
  'dining-cancellation': 'Your dinner reservation',
  'excursion-cancellation': 'Your excursion',
  'suite-issue': 'Your suite',
  'port-change': 'The itinerary',
  'weather-disruption': 'The day’s plans',
  'missed-service': 'Your request',
  'guest-complaint': 'Your stay with us',
};

const isPrivateOrPaid = (s: Subject) => Boolean(s.experience && (s.experience.format === 'private' || !s.experience.inclusive));

export function assess(d: Disruption | GuestDisruption, ctx: RecoveryContext): RecoveryAssessment {
  const s = subjectOf(d, ctx);
  const factors: string[] = [];
  let severity: RecoverySeverity;
  switch (d.kind) {
    case 'transfer-delay': {
      const m = d.details?.delayMinutes ?? 0;
      severity = m >= 60 ? 'high' : m >= 30 ? 'moderate' : 'low';
      factors.push(m ? `${m} minutes late` : 'delay not yet known');
      break;
    }
    case 'excursion-cancellation':
    case 'weather-disruption':
      severity = isPrivateOrPaid(s) ? 'high' : 'moderate';
      factors.push(s.experience ? (isPrivateOrPaid(s) ? 'a private or paid experience was lost' : 'a shared experience was lost') : 'plans affected');
      break;
    case 'dining-cancellation':
      severity = isPrivateOrPaid(s) ? 'high' : 'moderate';
      factors.push('a dinner reservation was lost');
      break;
    case 'port-change':
      severity = 'high';
      factors.push('a port of call changed');
      break;
    case 'guest-complaint':
      severity = 'high';
      factors.push('the guest has said they are unhappy');
      break;
    case 'suite-issue':
      severity = 'moderate';
      factors.push('something in the suite is not right');
      break;
    case 'missed-service':
      severity = 'moderate';
      factors.push('a promised update was not given');
      break;
  }
  if (s.date && ctx.occasionDates.includes(s.date)) {
    severity = bump(severity);
    factors.push('it falls on a celebration day');
  }
  if (ctx.priorRecoveries >= 2) {
    severity = bump(severity);
    factors.push(`disruption number ${ctx.priorRecoveries + 1} this voyage`);
  }
  const from = Math.max(ms(ctx.now), ms(d.occurredAt));
  return {
    severity,
    factors,
    owner: OWNER[d.kind],
    escalate: atLeast(severity, 'high'),
    followUpBy: localIso(from + SLA_MINUTES[severity] * MIN, ctx.now),
  };
}

/** An instant written with the offset of `like` (so times read as local). */
function localIso(at: number, like: string): string {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(like);
  const offset = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  const local = new Date(at + offset * MIN).toISOString().slice(0, 19);
  return m ? `${local}${m[0]}` : `${local}Z`;
}

// ─── Alternatives ──────────────────────────────────────────────────────────

/** Experiences that cannot run when the weather is the cause. */
const ON_THE_WATER = ['sailing', 'boat', 'watersports', 'swimming', 'snorkelling'];
const onTheWater = (x: RecoveryExperience) => x.category === 'marina' || x.tags.some((t) => ON_THE_WATER.includes(t));

const GROUP: Record<string, string> = {
  private: 'ashore',
  excursion: 'ashore',
  culture: 'ashore',
  marina: 'ashore',
  wine: 'ashore',
  shopping: 'ashore',
  spa: 'wellbeing',
  wellness: 'wellbeing',
  dining: 'dining',
  entertainment: 'evening',
  event: 'evening',
  transfer: 'transfer',
};
const groupOf = (category: string) => GROUP[category] ?? category;
const isPrivate = (x: RecoveryExperience) => x.format === 'private' || x.format === 'private-or-group';

/** Book no closer than this to the start. */
const LEAD_MINUTES = 120;
const MAX_ALTERNATIVES = 3;

interface Candidate {
  x: RecoveryExperience;
  slot: { start: string; end?: string };
  score: number;
  sameDate: boolean;
  gap: number;
}

function alternativesFor(d: Disruption | GuestDisruption, s: Subject, ctx: RecoveryContext): RecoveryAlternative[] {
  const kind = d.kind;
  if (!['excursion-cancellation', 'dining-cancellation', 'weather-disruption', 'port-change'].includes(kind)) return [];
  // A weather notice with nothing of the guest's in it offers what is aboard that day.
  const aboardOnly = kind === 'weather-disruption' && !s.experience;
  const date = s.date;
  if (!date && (aboardOnly || kind === 'port-change')) return [];
  const portCallId = kind === 'port-change' ? d.details?.toPortCallId : undefined;
  if (kind === 'port-change' && !portCallId) return [];

  const now = ms(ctx.now);
  const partySize = s.booking?.partySize ?? ctx.guest.partySize;
  const keep = ctx.bookings.filter((b) => ACTIVE_BOOKING(b) && b.id !== s.booking?.id);
  // A restaurant can be booked again another evening; anything else, once.
  const taken = new Set([...keep.filter((b) => b.category !== 'dining').map((b) => b.experienceId), ...requestedExperiences(ctx)]);
  const diningOn = new Set(keep.filter((b) => b.category === 'dining').map((b) => `${b.experienceId}@${dateOf(b.start)}`));
  if (s.experience) taken.add(s.experience.id);
  const busy = keep.map((b) => [ms(b.start), b.end ? ms(b.end) : ms(b.start) + 120 * MIN] as const);
  const weather = d.cause === 'weather' || kind === 'weather-disruption';
  const original = s.experience;
  const originalStart = s.start ? ms(s.start) : undefined;

  const candidates: Candidate[] = [];
  for (const x of ctx.catalogue) {
    if (taken.has(x.id) || x.category === 'transfer') continue;
    if (kind === 'dining-cancellation' ? x.category !== 'dining' : x.category === 'dining') continue;
    if (aboardOnly && x.portCallId) continue;
    if (portCallId && x.portCallId !== portCallId) continue;
    const slots = ctx.availability.find((a) => a.experienceId === x.id)?.slots ?? [];
    let best: Candidate | undefined;
    for (const slot of slots) {
      const start = ms(slot.start);
      const end = slot.end ? ms(slot.end) : start + (x.durationMinutes ?? 120) * MIN;
      // A private slot is one party's; otherwise places are per person.
      if (slot.remaining < (isPrivate(x) ? 1 : partySize) || start < now + LEAD_MINUTES * MIN) continue;
      if (busy.some(([a, b]) => start < b && end > a)) continue;
      if (diningOn.has(`${x.id}@${dateOf(slot.start)}`)) continue;
      const sameDate = date !== undefined && dateOf(slot.start) === date;
      if ((aboardOnly || portCallId || kind === 'dining-cancellation') && !sameDate) continue;
      // Weather that cancelled one thing on the water cancels the others that day.
      if (weather && sameDate && onTheWater(x)) continue;
      const gap = originalStart !== undefined ? Math.abs(start - originalStart) / MIN : 0;
      if (kind === 'dining-cancellation' && gap > 90) continue;
      const c: Candidate = { x, slot, sameDate, gap, score: score(x, original, sameDate, gap) };
      if (!best || c.score > best.score || (c.score === best.score && c.gap < best.gap)) best = c;
    }
    if (best && best.score >= 4) candidates.push(best);
  }
  candidates.sort((a, b) => b.score - a.score || Number(b.sameDate) - Number(a.sameDate) || a.gap - b.gap || ms(a.slot.start) - ms(b.slot.start) || (a.x.id < b.x.id ? -1 : 1));

  // A choice, not three of a kind: one per kind of experience, except the original's.
  const picked: Candidate[] = [];
  const groups = new Set<string>();
  const own = original ? groupOf(original.category) : kind === 'dining-cancellation' ? 'dining' : undefined;
  for (const c of candidates) {
    const g = groupOf(c.x.category);
    if (g !== own && groups.has(g)) continue;
    groups.add(g);
    picked.push(c);
    if (picked.length === MAX_ALTERNATIVES - (kind === 'dining-cancellation' ? 1 : 0)) break;
  }

  const alts: RecoveryAlternative[] = picked.map((c) => {
    const time = hhmm(c.slot.start);
    const when = c.sameDate ? `The same day at ${time}` : `${dateLabel(dateOf(c.slot.start))} at ${time}`;
    const where = c.x.destination ? `in ${c.x.destination}` : 'aboard';
    return {
      id: `${d.key}:${c.x.id}`,
      title: c.x.title,
      detail: `${c.x.subtitle ? `${c.x.subtitle}. ` : ''}${when}, ${where}.`,
      date: dateOf(c.slot.start),
      time,
      destination: c.x.destination,
      experienceId: c.x.id,
      price: c.x.inclusive ? 'Included' : c.x.price ? money(c.x.price) : 'Priced on request',
      chargeable: !c.x.inclusive,
      proposal: { kind: 'request-experience', experienceId: c.x.id, start: c.slot.start, partySize },
      actionLabel: `Request ${time}`,
    };
  });

  if (kind === 'dining-cancellation' && date) {
    const time = s.start ? hhmm(s.start) : '20:00';
    alts.push({
      id: `${d.key}:in-suite`,
      title: 'Dinner in your suite',
      detail: `The same evening at ${time}, served on your terrace, from any of the restaurants’ menus.`,
      date,
      time,
      price: 'Included',
      chargeable: false,
      proposal: { kind: 'service-request', category: 'dining', description: `In-suite dinner on ${dateLabel(date)} at ${time}, in place of ${s.title}.`, priority: 'priority' },
      actionLabel: 'Arrange it',
    });
  }
  return alts;
}

/** Experiences the guest has already asked for. */
function requestedExperiences(ctx: RecoveryContext): string[] {
  return ctx.requests.filter((r) => ACTIVE_REQUEST(r) || r.status === 'resolved').flatMap((r) => (r.experienceId ? [r.experienceId] : []));
}

function score(x: RecoveryExperience, original: RecoveryExperience | undefined, sameDate: boolean, gap: number): number {
  let s = 0;
  if (sameDate) s += 3;
  if (original) {
    if (x.category === original.category) s += 3;
    else if (groupOf(x.category) === groupOf(original.category)) s += 2;
    s += Math.min(2, x.tags.filter((t) => t !== 'private' && original.tags.includes(t)).length);
    if (isPrivate(original) && isPrivate(x)) s += 2;
    if (original.durationMinutes && x.durationMinutes && Math.abs(x.durationMinutes - original.durationMinutes) <= original.durationMinutes / 2) s += 1;
  } else {
    // Nothing to compare with: what is private, then what is close in time.
    if (isPrivate(x)) s += 2;
    s += 1;
  }
  if (sameDate && gap <= 180) s += 1;
  return s;
}

// ─── The plan ──────────────────────────────────────────────────────────────

/** A booking's own title in quotes; a generic one ("Your excursion") in the sentence. */
const quoted = (s: Subject) => (s.booking || s.experience ? `“${s.title}”` : s.title.charAt(0).toLowerCase() + s.title.slice(1));

function message(d: Disruption | GuestDisruption, s: Subject, ctx: RecoveryContext, hasAlternatives: boolean): RecoveryPlan['message'] {
  const first = ctx.guest.firstName;
  const amb = ctx.ambassador.firstName;
  const on = s.date ? ` on ${dateLabel(s.date)}` : '';
  const at = s.start ? ` at ${hhmm(s.start)}` : '';
  const offer = hasAlternatives
    ? `${amb} has set aside a few comparable alternatives below, and would be glad to arrange something else entirely if you prefer.`
    : `${amb} is ready to help with anything you would like instead.`;
  const signature = `${amb}, ${ctx.ambassador.title}`;
  switch (d.kind) {
    case 'excursion-cancellation':
      return { eyebrow: 'A change to your plans', title: `${s.title} will not go ahead`, body: [`${first}, we are sorry to tell you that ${quoted(s)}${on} cannot take place as planned.`, offer], signature };
    case 'dining-cancellation': {
      const venue = s.booking?.venue.split(',')[0] ?? s.title;
      return { eyebrow: 'Your dinner', title: `A change to your table at ${venue}`, body: [`${first}, we are sorry: your table at ${venue}${on}${at} is no longer possible.`, offer], signature };
    }
    case 'transfer-delay': {
      const m = d.details?.delayMinutes;
      const title = m ? `Your transfer is running about ${Math.max(5, Math.round(m / 5) * 5)} minutes late` : 'Your transfer is running a little late';
      const body = [`${first}, your driver is running behind.${d.details?.newTime ? ` The new pick-up time is ${hhmm(d.details.newTime)}.` : ''}`, 'The yacht has been told, so there is no need to hurry. We are following the journey and will tell you at once if anything changes.'];
      return { eyebrow: 'Your transfer', title, body, signature };
    }
    case 'suite-issue':
      return { eyebrow: 'Your suite', title: 'We are attending to your suite', body: [`${first}, thank you for letting us know. We are sorry it is not as it should be.`, `${amb} has asked the team to see to it straight away, at a time that suits you.`], signature };
    case 'port-change': {
      const from = d.details?.fromPort ?? 'our planned port';
      const to = d.details?.toPort;
      const title = to ? `We will call at ${to} instead of ${from}` : `A change to our call at ${from}`;
      const affected = ctx.bookings.filter((b) => ACTIVE_BOOKING(b) && s.date && dateOf(b.start) === s.date && b.category !== 'dining' && !['spa', 'wellness'].includes(b.category));
      const lines = [`${first}, ${to ? `we will call at ${to} instead of ${from}` : `our call at ${from} will change`}${on}.`];
      if (affected.length) lines.push(affected.length === 1 ? `This changes ${affected[0]!.title.charAt(0).toLowerCase() + affected[0]!.title.slice(1)}. ${amb} is taking care of it.` : `This changes ${affected.length} of your plans that day. ${amb} is taking care of them.`);
      lines.push(offer);
      return { eyebrow: 'A change to the itinerary', title, body: lines, signature };
    }
    case 'weather-disruption': {
      const port = s.date ? ctx.itinerary.find((p) => p.date === s.date) : undefined;
      const where = port && port.type !== 'sea' ? ` in ${port.portName}` : '';
      return {
        eyebrow: 'The weather',
        title: s.experience ? `${s.title} will not go ahead` : `A note about the weather${where}`,
        body: [s.experience ? `${first}, we are sorry to tell you that the weather means ${quoted(s)}${on} cannot take place as planned.` : `${first}, the weather${where}${on} may change the day’s plans. Your safety and comfort come first.`, offer],
        signature,
      };
    }
    case 'missed-service': {
      const by = s.request?.nextUpdateBy ? ` by ${hhmm(s.request.nextUpdateBy)}` : '';
      return { eyebrow: 'Your request', title: 'We owe you an update', body: [`${first}, we promised you news of “${s.title}”${by}, and did not give it. We are sorry.`, `${amb} is looking into it now and will come back to you personally.`], signature };
    }
    case 'guest-complaint':
      return { eyebrow: 'Thank you for telling us', title: 'We are sorry we fell short', body: [`${first}, thank you for telling us. We are sorry that we did not get this right.`, `${amb} would like to come and see you, at a time that suits you, and make sure it is put right.`], signature };
  }
}

const ASSIST_CATEGORY: Record<DisruptionKind, string> = {
  'transfer-delay': 'transportation',
  'dining-cancellation': 'dining',
  'excursion-cancellation': 'excursion',
  'suite-issue': 'suite',
  'port-change': 'concierge',
  'weather-disruption': 'concierge',
  'missed-service': 'concierge',
  'guest-complaint': 'concierge',
};

/** The disruption without what only the crew may read. */
export function toGuestDisruption(d: Disruption): GuestDisruption {
  const { reason, details, guestIds: _g, ...rest } = d;
  const out: GuestDisruption = { ...rest };
  if (reason?.guest) out.reason = { guest: reason.guest };
  if (details) {
    const { quote: _q, ...safe } = details;
    if (Object.keys(safe).length) out.details = safe;
  }
  return out;
}

/**
 * The recovery for one disruption: inform calmly, explain (only when the
 * reason is known), present comparable alternatives, offer assistance, and
 * record it. Nothing is booked, charged or compensated here: alternatives are
 * proposals the guest may accept, and goodwill is a separate, authorised
 * decision (goodwill.ts).
 */
export function planRecovery(d: Disruption | GuestDisruption, ctx: RecoveryContext): RecoveryPlan {
  const s = subjectOf(d, ctx);
  const assessment = assess(d, ctx);
  const alternatives = alternativesFor(d, s, ctx);
  const msg = message(d, s, ctx, alternatives.length > 0);
  const explanation = d.reason?.guest;
  const amb = ctx.ambassador.firstName;
  const followUp = hhmm(assessment.followUpBy);

  const steps: RecoveryStep[] = [{ kind: 'inform', label: 'Inform the guest calmly', detail: msg.title, audience: 'guest', state: 'done' }];
  if (explanation) steps.push({ kind: 'explain', label: 'Explain the reason', detail: explanation, audience: 'guest', state: 'done' });
  if (alternatives.length) steps.push({ kind: 'alternatives', label: 'Present comparable alternatives', detail: alternatives.map((a) => a.title).join(' · '), audience: 'guest', state: 'done' });
  steps.push({ kind: 'assist', label: 'Offer concierge assistance', detail: `${amb} is ready to arrange anything the guest prefers.`, audience: 'guest', state: 'to-do' });
  steps.push({ kind: 'record', label: 'Record the service recovery event', detail: `${KIND_LABEL[d.kind]} · ${assessment.severity}`, audience: 'crew', state: 'done' });
  if (assessment.escalate) steps.push({ kind: 'escalate', label: 'Tell the Hotel Director', detail: assessment.factors.join('; '), audience: 'crew', state: 'to-do' });
  steps.push({ kind: 'follow-up', label: 'Follow up in person', detail: `${OWNER_LABEL[assessment.owner]}, by ${followUp}`, audience: 'crew', state: 'to-do' });

  const full = d as Disruption;
  const crewBrief = [
    `${KIND_LABEL[d.kind]}: ${s.title}${s.date ? `, ${dateLabel(s.date)}` : ''}${s.start ? ` ${hhmm(s.start)}` : ''}.`,
    `Severity ${assessment.severity}: ${assessment.factors.join('; ')}.`,
    full.reason?.internal || explanation ? `Reason: ${full.reason?.internal ?? explanation}` : 'Reason not yet known: do not speculate with the guest.',
    ...(full.details?.quote ? [`In the guest’s words: “${full.details.quote}”`] : []),
    `Owner: ${OWNER_LABEL[assessment.owner]}. A person follows up by ${followUp}.${assessment.escalate ? ' Tell the Hotel Director.' : ''}`,
    alternatives.length ? `Alternatives offered: ${alternatives.map((a) => `${a.title} (${a.date ? `${dateLabel(a.date)} ` : ''}${a.time ?? ''})`).join('; ')}.` : 'No alternatives offered.',
    'No compensation has been offered. Goodwill only through an approved rule, by the person it names.',
  ];

  return {
    disruption: full,
    subject: { title: s.title, ...(s.date ? { date: s.date } : {}), ...(s.start ? { start: s.start } : {}), ...(s.booking ? { bookingId: s.booking.id } : {}) },
    assessment,
    steps,
    message: msg,
    ...(explanation ? { explanation } : {}),
    alternatives,
    assistance: {
      label: `Ask ${amb}`,
      description: `${KIND_LABEL[d.kind]}: ${s.title}${s.date ? ` (${dateLabel(s.date)})` : ''}. Please help us with what we would like instead.`,
      category: ASSIST_CATEGORY[d.kind],
      priority: atLeast(assessment.severity, 'high') || d.kind === 'transfer-delay' ? 'priority' : 'routine',
    },
    assurance: alternatives.length ? 'Nothing is booked or charged until you say so. Whatever you choose, we will take care of the rest.' : 'We will take care of the rest, and keep you informed.',
    crewBrief,
    engineVersion: ENGINE_VERSION,
  };
}

/** The tag a request raised from a recovery notice carries (so it is never detected as a new disruption). */
export const recoveryTag = (noticeId: string, what: string) => `recovery:${noticeId}:${what}`.slice(0, 120);
