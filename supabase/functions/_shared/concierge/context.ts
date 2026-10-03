// Builds what the model sees from what the guest may see.
//
// Minimisation: only slices relevant to the message (topic + the days it
// refers to), only the preference groups that topic needs, dietary needs as
// allergen names only (no severity), no occasions the guest keeps private,
// no contact details, documents, payment, member numbers or other guests.
//
// Pseudonymisation: every record gets a short handle (B1, E3, P2, R1, A1).
// The model never sees database IDs; anything it references that isn't a
// known handle is, by construction, invented, and is rejected by the guard.
import type { HandleMap, ModelContext, OfferedAction, RawContext, RawExperience } from './types.ts';

export type Topic = 'dining' | 'spa' | 'shore' | 'transport' | 'occasion' | 'loyalty' | 'schedule' | 'requests' | 'general';

const TOPICS: [Topic, RegExp][] = [
  ['dining', /\b(dinner|lunch|breakfast|table|restaurant|eat|food|menu|chef|sommelier|wine)\b/i],
  ['spa', /\b(spa|massage|treatment|thalasso\w*|yoga|wellness|facial)\b/i],
  ['shore', /\b(private|experiences?|excursions?|tours?|ashore|visit|museum|walk|sail\w*|things to do|what can (we|i) do)\b/i],
  ['transport', /\b(transport\w*|cars?|driver|transfers?|helicopter|taxi|flights?|airport|pick ?up)\b/i],
  ['occasion', /\b(anniversary|birthday|celebrat\w*|surprise|honeymoon)\b/i],
  ['loyalty', /\b(benefits?|privileges?|bonvoy|status|tier|elite|perks?)\b/i],
  ['schedule', /\b(today|tonight|tomorrow|plan\w*|schedule|itinerary|programme|agenda|should (i|we) do)\b/i],
  ['requests', /\b(request|update|progress|news|status of|heard)\b/i],
];

export function topicsOf(text: string): Topic[] {
  const found = TOPICS.filter(([, r]) => r.test(text)).map(([t]) => t);
  return found.length ? found : ['general'];
}

const offsetMinutes = (iso: string) => {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(iso);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
};
const fmtOffset = (min: number) => `${min < 0 ? '-' : '+'}${String(Math.floor(Math.abs(min) / 60)).padStart(2, '0')}:${String(Math.abs(min) % 60).padStart(2, '0')}`;
const local = (ms: number, offset: number) => new Date(ms + offset * 60_000).toISOString().slice(0, 16);
const DAY = 86_400_000;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Where the guest is: at home before/after the voyage, in ship time during it. */
export function guestOffset(ctx: RawContext, now: Date): number {
  const ship = offsetMinutes(ctx.embarkationStart);
  const start = Date.parse(ctx.embarkationStart) - 12 * 3_600_000;
  const end = Date.parse(`${ctx.voyage.endDate}T18:00:00Z`);
  return now.getTime() >= start && now.getTime() <= end ? ship : offsetMinutes(`x${ctx.homeOffset}`);
}

/** The local dates a message refers to (today/tomorrow, "19 May", weekdays, day N, ports). */
export function daysReferenced(text: string, ctx: RawContext, now: Date): string[] {
  const t = text.toLowerCase();
  const off = guestOffset(ctx, now);
  const today = local(now.getTime(), off).slice(0, 10);
  const plus = (n: number) => local(now.getTime() + n * DAY, off).slice(0, 10);
  const out = new Set<string>();
  if (/\b(today|tonight|this (evening|afternoon|morning))\b/.test(t)) out.add(today);
  if (/\btomorrow\b/.test(t)) out.add(plus(1));
  const dayN = /\bday (\d{1,2})\b/.exec(t)?.[1];
  ctx.itinerary.filter((p) => dayN && p.day === Number(dayN)).forEach((p) => out.add(p.date));
  if (/\bsea day\b/.test(t)) ctx.itinerary.filter((p) => p.type === 'sea').forEach((p) => out.add(p.date));
  if (/\b(first day|embarkation)\b/.test(t)) out.add(ctx.voyage.startDate);
  for (const m of t.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?(?: of)? (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*|\bthe (\d{1,2})(?:st|nd|rd|th)\b/g)) {
    const d = Number(m[1] ?? m[3]);
    const month = m[2] ? MONTHS.indexOf(m[2]) + 1 : Number(ctx.voyage.startDate.slice(5, 7));
    out.add(`${ctx.voyage.startDate.slice(0, 4)}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  WEEKDAYS.forEach((w, idx) => {
    if (!new RegExp(`\\b${w}\\b`).test(t)) return;
    for (let i = 0; i < 7; i++) if (new Date(`${plus(i)}T12:00:00Z`).getUTCDay() === idx) return void out.add(plus(i));
  });
  ctx.itinerary.forEach((p) => {
    if (p.type !== 'sea' && t.includes(p.portName.toLowerCase().split(' (')[0]!)) out.add(p.date);
  });
  return [...out].sort();
}

function price(e: RawExperience): string | undefined {
  if (e.inclusive) return 'included';
  if (e.priceMinor === undefined) return undefined;
  const sym = e.currency === 'EUR' ? '€' : e.currency === 'USD' ? '$' : e.currency === 'GBP' ? '£' : `${e.currency} `;
  return `${sym}${Math.round(e.priceMinor / 100)}`;
}

/** The preference groups a topic needs; nothing else is sent. */
function preferencesFor(ctx: RawContext, topics: Topic[]): Record<string, unknown> {
  const p = ctx.preferences;
  const out: Record<string, unknown> = {};
  const any = (...t: Topic[]) => t.some((x) => topics.includes(x));
  if (any('dining', 'schedule', 'occasion', 'general')) {
    out.dining = { cuisines: p.dining?.cuisines, preferredTime: p.dining?.preferredTime, table: p.dining?.tablePreference };
  }
  if (any('dining')) {
    // Health-adjacent: allergen and restriction names only, never severity or notes.
    const allergens = (p.dietary?.allergies ?? []).map((a) => a.allergen).filter(Boolean);
    out.dietary = { restrictions: p.dietary?.restrictions ?? [], allergens };
    out.beverage = { wine: p.beverage?.wine, nonAlcoholic: p.beverage?.nonAlcoholic };
  }
  if (any('spa', 'schedule')) out.spa = { favourites: p.spa?.favouriteTreatments, pressure: p.spa?.pressure, preferredTime: p.spa?.preferredTime };
  if (any('shore', 'schedule', 'occasion')) {
    out.excursions = { style: p.excursions?.style, pace: p.excursions?.pace, maxDurationMinutes: p.excursions?.maxDurationMinutes };
    if (p.accessibility?.mobility && p.accessibility.mobility !== 'none') out.mobility = p.accessibility.mobility;
    if (p.accessibility?.tenderAssistance) out.tenderAssistance = true;
  }
  if (any('transport')) out.transport = { arrivals: p.transportation?.arrivals, helicopterWelcome: p.transportation?.helicopterWelcome };
  const personalised = p.privacy?.personalisedRecommendations !== false;
  if (personalised && any('shore', 'schedule', 'general', 'occasion', 'spa')) out.interests = p.activityInterests;
  out.personalisedRecommendations = personalised;
  return JSON.parse(JSON.stringify(out));
}

function describe(a: OfferedAction): string {
  switch (a.kind) {
    case 'change-booking':
      return `${a.label} (move booking to ${a.start.slice(0, 16)})`;
    case 'request-experience':
      return `${a.label} (request at ${a.start.slice(0, 16)} for ${a.partySize})`;
    case 'service-request':
      return `${a.label} (${a.summary})`;
    default:
      return `${a.label} (hand over to ${a.to})`;
  }
}

export function buildModelContext(ctx: RawContext, text: string, now: Date): { model: ModelContext; handles: HandleMap; topics: Topic[] } {
  const topics = topicsOf(text);
  const off = guestOffset(ctx, now);
  const today = local(now.getTime(), off).slice(0, 10);
  const window = new Set([today, local(now.getTime() + DAY, off).slice(0, 10), local(now.getTime() + 2 * DAY, off).slice(0, 10), ...daysReferenced(text, ctx, now)]);
  const slices = new Set<string>(['guest', 'voyage', 'itinerary']);
  const handles: HandleMap = { bookings: new Map(), experiences: new Map(), ports: new Map(), requests: new Map(), pending: new Map() };

  const itinerary = ctx.itinerary.map((p, i) => {
    const handle = `P${i + 1}`;
    handles.ports.set(handle, p);
    return { handle, day: p.day, date: p.date, port: p.portName, country: p.country, type: p.type, arrival: p.arrival?.slice(11, 16), departure: p.departure?.slice(0, 16), allAboard: p.allAboard?.slice(11, 16) };
  });

  const programme = ctx.days.filter((d) => window.has(d.date)).map((d) => ({ day: d.day, date: d.date, headline: d.headline, dressCode: d.dressCode, sunset: d.sunset?.slice(11, 16), items: d.items.slice(0, 10).map((i) => `${i.start.slice(11, 16)} ${i.title} (${i.location})`) }));
  if (programme.length) slices.add('programme');

  // Bookings in the window, plus the next one of each kind (to move "my dinner").
  const upcoming = ctx.bookings.filter((b) => Date.parse(b.start) > now.getTime() - 3 * 3_600_000 && b.status !== 'cancelled' && b.status !== 'declined');
  const nextOfKind = new Map<string, (typeof upcoming)[number]>();
  upcoming.forEach((b) => nextOfKind.has(b.category) || nextOfKind.set(b.category, b));
  const chosen = upcoming.filter((b) => window.has(b.start.slice(0, 10)) || nextOfKind.get(b.category) === b).slice(0, 20);
  const bookings = chosen.map((b, i) => {
    const handle = `B${i + 1}`;
    handles.bookings.set(handle, b);
    return { handle, title: b.title, category: b.category, venue: b.venue.split(',')[0]!, start: b.start.slice(0, 16), end: b.end?.slice(0, 16), partySize: b.partySize, status: b.status, note: b.note?.slice(0, 160) };
  });
  if (bookings.length) slices.add('bookings');

  // Experiences that can happen in the window or on a booked day in context (so a booking
  // can be moved), ashore on those days or aboard, most relevant first.
  const slotDays = new Set([...window, ...chosen.map((b) => b.start.slice(0, 10))]);
  const portIds = new Set(ctx.itinerary.filter((p) => slotDays.has(p.date)).map((p) => p.id));
  // Each topic adds its categories ("helicopter flight ashore" is both transport and shore).
  const narrow = topics.filter((t) => t === 'dining' || t === 'spa' || t === 'transport');
  const lower = text.toLowerCase();
  const named = (e: RawExperience) => e.title.toLowerCase().split(/[^a-zà-ÿ]+/).some((w) => w.length > 4 && lower.includes(w));
  const wanted = (e: RawExperience) =>
    named(e) ||
    (topics.includes('dining') && e.category === 'dining') ||
    (topics.includes('spa') && ['spa', 'wellness'].includes(e.category)) ||
    (topics.includes('transport') && e.category === 'transfer') ||
    ((topics.includes('shore') || !narrow.length) && e.category !== 'transfer');
  const experiences = ctx.catalogue
    .filter((e) => (!e.portCallId || portIds.has(e.portCallId)) && wanted(e))
    .sort((a, b) => Number(named(b)) - Number(named(a)))
    .slice(0, 12)
    .map((e, i) => {
      const handle = `E${i + 1}`;
      handles.experiences.set(handle, e);
      const slots = ctx.slots.filter((s) => s.experienceId === e.id && s.remaining > 0 && slotDays.has(s.start.slice(0, 10)) && Date.parse(s.start) > now.getTime()).slice(0, 4);
      return {
        handle,
        title: e.title,
        category: e.category,
        subtitle: e.subtitle,
        where: e.destination ?? `aboard ${ctx.voyage.yacht}`,
        durationMinutes: e.durationMinutes,
        price: price(e),
        format: e.format,
        availability: e.availability,
        openSlots: slots.map((s) => s.start.slice(0, 16)),
      };
    });
  if (experiences.length) slices.add('experiences');

  const prefs = preferencesFor(ctx, topics);
  slices.add(`preferences:${Object.keys(prefs).filter((k) => k !== 'personalisedRecommendations').join('+') || 'none'}`);

  const occasions = topics.some((t) => t === 'occasion' || t === 'schedule')
    ? ctx.occasions.filter((o) => o.recognition !== 'private' && o.date >= ctx.voyage.startDate && o.date <= ctx.voyage.endDate).map((o) => ({ type: o.type, date: o.date }))
    : [];
  if (occasions.length) slices.add('occasions');

  const openRequests = topics.some((t) => ['requests', 'transport', 'occasion', 'shore'].includes(t))
    ? ctx.openRequests.slice(0, 6).map((r, i) => {
        const handle = `R${i + 1}`;
        handles.requests.set(handle, r);
        return { handle, summary: r.summary, status: r.status };
      })
    : [];
  if (openRequests.length) slices.add('requests');

  const lastAi = [...ctx.history].reverse().find((m) => m.author !== 'guest');
  const pendingActions = (lastAi?.actions ?? []).filter((a) => a.kind !== 'escalate').slice(0, 6).map((a, i) => {
    const handle = `A${i + 1}`;
    handles.pending.set(handle, a);
    return { handle, description: describe(a) };
  });
  if (pendingActions.length) slices.add('pending-actions');

  const day = ctx.itinerary.find((p) => p.date === today);
  const phase = today < ctx.voyage.startDate ? 'before the voyage (at home)' : today > ctx.voyage.endDate ? 'after the voyage' : `aboard, day ${day?.day ?? '?'}${day && day.type !== 'sea' ? ` in ${day.portName}` : ' at sea'}`;

  return {
    topics,
    handles,
    model: {
      guest: { preferredName: ctx.preferredName, travellingWith: ctx.companionFirstNames, tier: topics.includes('loyalty') ? ctx.tierLabel : undefined },
      voyage: { name: ctx.voyage.name, yacht: ctx.voyage.yacht, dates: `${ctx.voyage.startDate} to ${ctx.voyage.endDate}`, phase, today, now: `${local(now.getTime(), off)}${fmtOffset(off)}` },
      itinerary,
      programme,
      bookings,
      experiences,
      preferences: prefs,
      occasions,
      openRequests,
      pendingActions,
      slices: [...slices],
    },
  };
}
