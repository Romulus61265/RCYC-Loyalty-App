// Deterministic, rules-based personalization engine (MVP).
//
// The same input always gives the same output: no clock unless one is
// passed, no randomness, and every list is ordered by ID before scoring, so
// the order of the inputs does not matter. Every recommendation can be
// explained: the rules that fired, the signals they used, and one
// guest-facing reason (the strongest rule's).
//
// Policy, applied after scoring:
//  • Nothing in the past, nothing already booked (unless asked for), nothing
//    that clashes with a booking, nothing unsuitable for the party (minors,
//    mobility).
//  • 'private' occasions are never used. With personalised recommendations
//    switched off, only the itinerary is used, with neutral reasons.
//  • The value segment is internal: it never changes a reason, never adds
//    score, and is stripped before anything reaches the guest app. It only
//    lets a Suite Ambassador arrange an occasion personally.
//  • Bonvoy status is a tie-breaker for private formats, never a reason.
//  • Diversity: at most `maxPerCategory` per category before the rest.
//
// Scores are relative (0–1) and internal. They rank and filter; they are
// never displayed.
import type {
  CatalogueItem,
  ItineraryDay,
  OpenSlot,
  Occasion,
  PersonalizationInput,
  PersonalizedRecommendation,
  PersonalizeOptions,
  RecommendationAction,
  ServiceRequestType,
  SourceSignal,
} from './types.ts';

export const ENGINE_VERSION = 'rules-v1';
/** Below this, a candidate is not worth suggesting. */
export const MIN_SCORE = 0.25;

interface Driver {
  rule: string;
  weight: number;
  /** Guest-facing sentence; the strongest one is used. */
  reason?: string;
  signals: SourceSignal[];
  /** Dates this rule would like it on (aboard experiences). */
  dates?: string[];
}

// ─── Small helpers ─────────────────────────────────────────────────────────

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Thursday 20 May". */
export function longDate(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
const dayOf = (iso: string) => iso.slice(0, 10);
const timeOf = (iso: string) => iso.slice(11, 16);
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const sig = (kind: SourceSignal['kind'], detail: string, ref?: string, visibility: SourceSignal['visibility'] = 'guest'): SourceSignal => (ref ? { kind, detail, ref, visibility } : { kind, detail, visibility });
const lower = (s: string) => s.toLowerCase();

/** Tags that say little about a guest on their own. */
const GENERIC_TAGS = new Set(['private', 'evening', 'morning', 'occasion']);
const SHORE_CATEGORIES = new Set(['excursion', 'culture', 'wine', 'private', 'wellness']);
const HIGH_TIERS = new Set(['platinum', 'titanium', 'ambassador']);
const HIGH_SEGMENTS = new Set(['distinguished', 'founding']);

/** Stated interests → the experience tags that express them. */
const INTEREST_TAGS: { match: RegExp; tags: string[]; phrase: string }[] = [
  { match: /fine dining/i, tags: ['fine-dining', 'tasting', 'chef'], phrase: 'fine dining' },
  { match: /^wine/i, tags: ['wine', 'red-wine'], phrase: 'wine' },
  { match: /cultur/i, tags: ['culture', 'architecture', 'art', 'gardens'], phrase: 'private cultural experiences' },
  { match: /spa/i, tags: ['spa', 'massage', 'thalassotherapy', 'wellness', 'yoga', 'recovery'], phrase: 'time in the spa' },
  { match: /yacht|sail/i, tags: ['yachting', 'sailing', 'boat'], phrase: 'life at sea' },
];

/** Destination interests → ports (by country or name). */
const REGIONS: { match: RegExp; port: (p: ItineraryDay) => boolean }[] = [
  { match: /french riviera|côte d.azur/i, port: (p) => p.country === 'France' || p.country === 'Monaco' },
  { match: /italian riviera|liguria/i, port: (p) => p.country === 'Italy' && /portofino|genoa|cinque|santa margherita/i.test(p.portName) },
  { match: /balearic/i, port: (p) => /mallorca|palma|ibiza|menorca/i.test(p.portName) },
  { match: /amalfi/i, port: (p) => /amalfi|positano|capri|sorrento/i.test(p.portName) },
];

function requestTypeFor(e: CatalogueItem): ServiceRequestType {
  if (e.category === 'dining') return 'general';
  if (e.category === 'transfer') return 'transport';
  return e.portCallId ? 'excursion' : 'general';
}

// ─── Engine ────────────────────────────────────────────────────────────────

export function personalize(input: PersonalizationInput, options: PersonalizeOptions = {}): PersonalizedRecommendation[] {
  const limit = options.limit ?? 10;
  const maxPerCategory = options.maxPerCategory ?? 2;
  const nowMs = options.now ? Date.parse(options.now) : Number.NEGATIVE_INFINITY;
  const today = options.now ? dayOf(options.now) : '';
  const prefs = input.preferences;
  const personal = prefs.personalisedRecommendations !== false;

  const itinerary = [...input.itinerary].sort((a, b) => a.day - b.day || byId(a, b));
  const portById = new Map(itinerary.map((p) => [p.id, p]));
  const dayByDate = new Map<string, ItineraryDay>();
  for (const p of itinerary) if (!dayByDate.has(p.date)) dayByDate.set(p.date, p);
  const upcomingDays = itinerary.filter((p) => p.date >= today);
  const seaDays = upcomingDays.filter((p) => p.type === 'sea');
  const voyages = new Map(input.previousVoyages.map((v) => [v.id, v]));
  const party = 1 + input.companions.length;
  const minors = input.companions.some((c) => c.isMinor);
  const companion = [...input.companions].filter((c) => !c.isMinor).sort((a, b) => (a.firstName < b.firstName ? -1 : 1))[0];
  const visited = new Set(input.destinationsVisited.map(lower));
  const yacht = input.voyage.yachtName;
  const soldOut = new Set(input.soldOut ?? []);

  // Current reservations: what is booked, and when the party is busy.
  const active = input.bookings.filter((b) => b.status !== 'cancelled' && b.status !== 'declined').sort(byId);
  const bookingFor = new Map(active.map((b) => [b.experienceId, b]));
  const busy = active.map((b) => {
    const start = Date.parse(b.start);
    return { start, end: b.end ? Date.parse(b.end) : start + (b.category === 'dining' ? 150 : 120) * 60_000, booking: b };
  });
  const diningDates = new Set(active.filter((b) => b.category === 'dining').map((b) => dayOf(b.start)));
  const daytimeBooked = new Set(active.filter((b) => b.category !== 'dining' && b.category !== 'transfer').map((b) => dayOf(b.start)));

  // Personal signals (none when the guest has switched personalisation off).
  const occasions: Occasion[] = personal
    ? input.occasions.filter((o) => o.recognition !== 'private' && o.date >= input.voyage.startDate && o.date <= input.voyage.endDate && o.date >= today).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : byId(a, b)))
    : [];
  const history = personal ? [...input.history].sort(byId) : [];
  const memories = history.filter((h) => h.memory && (h.rating ?? 5) >= 4 && h.voyageId && voyages.has(h.voyageId));
  const avoidGroups = history.some((h) => h.tags.includes('avoid') && h.tags.includes('small-group'));
  const wineLover = personal && (prefs.activityInterests.some((i) => /wine/i.test(i)) || prefs.wine.length > 0);
  const redWine = prefs.wine.some((w) => /red|barolo|brunello|bordeaux|saint-émilion|rioja/i.test(w));
  const spaHistory = history.filter((h) => h.kind === 'spa');
  const favourites = prefs.spa.favouriteTreatments.map(lower);
  const highTier = personal && input.bonvoy !== null && HIGH_TIERS.has(input.bonvoy.tier);
  const highSegment = personal && input.valueSegment !== undefined && HIGH_SEGMENTS.has(input.valueSegment);

  const clashes = (s: OpenSlot, e: CatalogueItem) => {
    const start = Date.parse(s.start);
    const end = s.end ? Date.parse(s.end) : start + (e.durationMinutes ?? 90) * 60_000;
    return busy.some((b) => start < b.end && b.start < end);
  };
  const preferredHour = (e: CatalogueItem): number | undefined => {
    if (e.category === 'dining' && prefs.dining.preferredTime) return minutes(prefs.dining.preferredTime);
    if ((e.category === 'spa' || e.category === 'wellness') && prefs.spa.preferredTime) return { morning: 600, afternoon: 900, evening: 1080 }[prefs.spa.preferredTime];
    return undefined;
  };
  /** The first open, non-clashing slot, on the given dates in order when there are any. */
  const slotFor = (e: CatalogueItem, dates?: string[]): OpenSlot | undefined => {
    const need = e.format === 'private' ? 1 : party;
    const hour = preferredHour(e);
    const open = input.slots
      .filter((s) => s.experienceId === e.id && s.remaining >= need && Date.parse(s.start) > nowMs && (!dates || dates.includes(dayOf(s.start))) && !clashes(s, e))
      .sort((a, b) => {
        const da = dates ? dates.indexOf(dayOf(a.start)) : 0;
        const db = dates ? dates.indexOf(dayOf(b.start)) : 0;
        const ha = hour === undefined ? 0 : Math.abs(minutes(timeOf(a.start)) - hour);
        const hb = hour === undefined ? 0 : Math.abs(minutes(timeOf(b.start)) - hour);
        return da - db || ha - hb || (a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
      });
    return open[0];
  };

  const results: PersonalizedRecommendation[] = [];

  for (const e of [...input.catalogue].sort(byId)) {
    // ── Candidates ──
    if (e.category === 'transfer') continue;
    if (minors && e.category === 'wine') continue;
    if ((prefs.mobility === 'wheelchair' || prefs.mobility === 'wheelchair-distances') && e.tags.includes('walking')) continue;
    if (prefs.mobility === 'short-walks' && e.tags.includes('walking') && (e.durationMinutes ?? 0) > 120) continue;
    const booking = bookingFor.get(e.id);
    if (booking && !options.includeBooked) continue;
    // Sold out: not a next-best suggestion (still explained when every card is).
    if (!booking && soldOut.has(e.id) && !options.includeBooked) continue;
    const port = e.portCallId ? portById.get(e.portCallId) : undefined;
    if (e.portCallId && !port) continue; // not on this itinerary
    if (port && port.date < today) continue;

    const tags = new Set(e.tags);
    const meaningful = e.tags.filter((t) => !GENERIC_TAGS.has(t));
    const drivers: Driver[] = [];
    let penalty = 0;
    const penalties: string[] = [];

    if (!personal) {
      // Itinerary only, neutral words.
      if (port && port.type !== 'sea') {
        drivers.push({ rule: 'itinerary', weight: 0.3, reason: `In ${port.portName} on ${longDate(port.date)}.`, signals: [sig('current-itinerary', `${port.portName}, day ${port.day}`, port.id)] });
      }
    } else {
      // 1 · A special occasion during the voyage, on the day where possible.
      const occasion = tags.has('occasion') ? occasions[0] : undefined;
      if (occasion) {
        const there = dayByDate.get(occasion.date);
        const sameDay = !port || port.date === occasion.date || (there !== undefined && port.portName === there.portName);
        const signals = [sig('special-occasion', `${occasion.type}, ${occasion.date}`, occasion.id)];
        if (there) signals.push(sig('current-itinerary', `${there.type === 'sea' ? 'At sea' : there.portName}, ${occasion.date}`, there.id));
        const romantic = occasion.type === 'anniversary' || occasion.type === 'honeymoon';
        drivers.push({
          rule: 'occasion',
          weight: (sameDay ? 0.5 : 0.3) + (romantic && e.category === 'dining' ? 0.1 : 0),
          reason: `For your ${occasion.label} on ${longDate(occasion.date)}${there && sameDay && there.type !== 'sea' ? `, in ${there.portName}` : ''}.`,
          signals,
          dates: [occasion.date],
        });
      }

      // 2 · Something they loved on a previous voyage.
      const best = memories
        .map((h) => ({ h, overlap: h.tags.filter((t) => !GENERIC_TAGS.has(t) && tags.has(t)).length, sameCategory: h.category === e.category }))
        .filter((m) => m.overlap > 0)
        .sort((a, b) => b.overlap - a.overlap || Number(b.sameCategory) - Number(a.sameCategory) || b.h.weight - a.h.weight || byId(a.h, b.h))[0];
      if (best) {
        const v = voyages.get(best.h.voyageId!)!;
        drivers.push({
          rule: 'history',
          weight: 0.35 + 0.1 * Math.min(best.overlap, 3) * best.h.weight,
          reason: `Recommended because you enjoyed ${best.h.memory} on your ${v.region} voyage in ${v.startDate.slice(0, 4)}.`,
          signals: [sig('previous-voyages', `${v.name}`, v.id), sig(best.h.kind === 'spa' ? 'spa-preferences' : best.h.kind === 'dining' ? 'dining-preferences' : 'excursion-history', best.h.memory!, best.h.id)],
        });
      }

      // 3 · Wine, where the itinerary has vineyards (or aboard, with the sommelier).
      if (wineLover && (e.category === 'wine' || (tags.has('wine') && e.category !== 'dining'))) {
        const ashore = port && port.type !== 'sea';
        drivers.push({
          rule: 'wine-destination',
          weight: (ashore ? 0.3 : 0.2) + (redWine && tags.has('red-wine') ? 0.05 : 0),
          reason: ashore ? (/vineyard|winery|estate/i.test(e.title) ? `For your love of wine: a private visit to the vineyards of ${port!.portName}.` : `For your love of wine, in ${port!.portName}.`) : 'Chosen for your love of great wine.',
          signals: [sig('dining-preferences', redWine ? 'Red wine' : 'Wine'), ...(ashore ? [sig('current-itinerary', `${port!.portName}, day ${port!.day}`, port!.id)] : [])],
        });
      }

      // 4 · Spa history or favourites, on a sea day.
      if ((e.category === 'spa' || e.category === 'wellness') && !port) {
        const favourite = prefs.spa.favouriteTreatments.find((f) => meaningful.some((t) => lower(f).includes(t)) || lower(f).includes(lower(e.title)));
        const past = spaHistory.find((h) => h.tags.some((t) => !GENERIC_TAGS.has(t) && tags.has(t)));
        if (favourite || past || favourites.length) {
          const seaSlot = favourite || past ? slotFor(e, seaDays.map((d) => d.date)) : undefined;
          const sea = seaSlot ? dayByDate.get(dayOf(seaSlot.start)) : undefined;
          const signals = [sig('spa-preferences', favourite ?? past?.memory ?? 'Spa', past?.id)];
          if (sea) {
            signals.push(sig('current-itinerary', `Sea day, ${sea.date}`, sea.id));
            drivers.push({
              rule: 'spa-sea-day',
              weight: 0.45,
              reason: `${longDate(sea.date)} is a day at sea: ${past?.memory ? `time for a treatment like ${past.memory}` : `an unhurried day for the ${e.title}`}.`,
              signals,
              dates: [sea.date],
            });
          } else if (favourite || past) {
            drivers.push({ rule: 'spa-preference', weight: 0.25, reason: 'Chosen to complement your time in the spa.', signals });
          }
          if (prefs.spa.pressure === 'firm' && tags.has('massage')) drivers.push({ rule: 'spa-pressure', weight: 0.05, signals: [sig('spa-preferences', 'Firm pressure')] });
        }
      }

      // 5 · The person they travel with.
      if (companion) {
        const shared = companion.interests.filter((i) => tags.has(i));
        if (shared.length) {
          const list = companion.interests.filter((i) => i !== 'couple');
          drivers.push({
            rule: 'companion',
            weight: 0.3,
            reason: `${companion.firstName} loves ${list.join(' and ')}. We thought of you both.`,
            signals: [sig('travel-companion', `${companion.firstName}: ${shared.join(', ')}`)],
          });
        } else if (tags.has('couples') && /spouse|partner/.test(companion.relationship)) {
          drivers.push({ rule: 'companion', weight: 0.15, reason: `Side by side with ${companion.firstName}.`, signals: [sig('travel-companion', `${companion.firstName}, ${companion.relationship}`)] });
        }
      }

      // 6 · Dining preferences, on an evening that is still free.
      if (e.category === 'dining') {
        const freeEvenings = upcomingDays.map((d) => d.date).filter((d) => !diningDates.has(d));
        const cuisine = prefs.dining.cuisines.find((c) => tags.has(lower(c)));
        const window = prefs.dining.tablePreference === 'window' && tags.has('window');
        if ((cuisine || window) && freeEvenings.length) {
          const slot = slotFor(e, freeEvenings);
          if (slot) {
            const signals = [sig('dining-preferences', [cuisine, window ? 'Window table' : ''].filter(Boolean).join(', ')), sig('current-reservations', `Free evening, ${dayOf(slot.start)}`)];
            drivers.push({
              rule: 'dining-preference',
              weight: (window ? 0.15 : 0) + (cuisine ? 0.12 : 0),
              reason: window ? 'Your window table is held here each evening.' : `For your love of ${cuisine} cooking.`,
              signals,
              dates: [dayOf(slot.start)],
            });
          }
        }
      }

      // 7 · Stated interests and destination interests.
      const interest = INTEREST_TAGS.find((i) => prefs.activityInterests.some((a) => i.match.test(a)) && i.tags.some((t) => tags.has(t)));
      if (interest && !drivers.some((d) => d.rule === 'wine-destination' && interest.phrase === 'wine')) {
        drivers.push({
          rule: 'interest',
          weight: 0.2,
          reason: e.category === 'wellness' ? 'Chosen to complement your time in the spa.' : `Because ${interest.phrase} is one of your passions.`,
          signals: [sig('destination-interests', interest.phrase)],
        });
      }
      if (port && port.type !== 'sea') {
        const region = prefs.preferredDestinations.find((d) => REGIONS.some((r) => r.match.test(d) && r.port(port)));
        if (region) drivers.push({ rule: 'destination', weight: 0.08, reason: `${port.portName}, on the ${region}.`, signals: [sig('destination-interests', region)] });
        if (!visited.has(lower(port.portName)) && !visited.has(lower(port.portName.split(' ')[0]!))) {
          drivers.push({ rule: 'first-visit', weight: 0.05, reason: `Your first time in ${port.portName}.`, signals: [sig('previous-voyages', `First visit to ${port.portName}`)] });
        }
        // An open day ashore (current reservations).
        if (!daytimeBooked.has(port.date)) drivers.push({ rule: 'open-day', weight: 0.05, reason: `Your day in ${port.portName} is still unplanned.`, signals: [sig('current-reservations', `Nothing booked, ${port.date}`)] });
      }

      // 8 · Excursion preferences and history.
      if (prefs.excursions.style === 'private' && e.format === 'private' && SHORE_CATEGORIES.has(e.category)) {
        drivers.push({ rule: 'private-style', weight: 0.12, reason: 'Private, as you prefer: just the two of you and your guide.', signals: [sig('excursion-history', 'Prefers private')] });
      }
      if (avoidGroups && SHORE_CATEGORIES.has(e.category) && (e.format === 'small-group' || e.format === 'shared')) {
        penalty += 0.3;
        penalties.push('penalty:group-after-crowded');
      }
      if (prefs.excursions.maxDurationMinutes && port && (e.durationMinutes ?? 0) > prefs.excursions.maxDurationMinutes) {
        penalty += 0.15;
        penalties.push('penalty:duration');
      }
    }

    if (!drivers.some((d) => d.reason)) continue;

    // 9 · Bonvoy status: a tie-breaker for private formats, never a reason.
    if (highTier && e.format === 'private') drivers.push({ rule: 'bonvoy', weight: 0.03, signals: [sig('bonvoy-status', input.bonvoy!.tier)] });

    const score = Math.max(0, Math.min(1, Number((drivers.reduce((s, d) => s + d.weight, 0) - penalty).toFixed(3))));
    if (score < MIN_SCORE) continue;

    // ── When, where, and what the guest can do ──
    const ranked = [...drivers].sort((a, b) => b.weight - a.weight); // stable: rule order breaks ties
    const primary = ranked.find((d) => d.reason)!;
    const wanted = ranked.flatMap((d) => d.dates ?? []);
    let slot: OpenSlot | undefined;
    let date: string;
    if (booking) date = dayOf(booking.start);
    else if (port) {
      slot = slotFor(e, [port.date]);
      date = port.date;
    } else {
      slot = (wanted.length ? slotFor(e, [...new Set(wanted)]) : undefined) ?? slotFor(e, upcomingDays.map((d) => d.date));
      date = slot ? dayOf(slot.start) : (wanted[0] ?? upcomingDays[0]?.date ?? input.voyage.startDate);
    }
    const day = dayByDate.get(date);
    const destination = port ? port.portName : day && day.type !== 'sea' ? `Aboard ${yacht} in ${day.portName}` : day ? `Aboard ${yacht}, at sea` : `Aboard ${yacht}`;

    const signals = dedupe(drivers.flatMap((d) => d.signals));
    const occasionDriven = primary.rule === 'occasion';
    let action: RecommendationAction;
    if (booking) action = { kind: 'open', label: 'See it in your calendar', route: '/voyage?section=calendar' };
    else if (occasionDriven && highSegment) {
      // A personal touch: the Suite Ambassador arranges it rather than a booking form.
      signals.push(sig('value-segment', 'Customer value segment', undefined, 'internal'));
      const o = occasions[0]!;
      action = { kind: 'service-request', label: 'Ask your Suite Ambassador to arrange it', type: 'occasion', summary: `${e.title} for our ${o.label}, ${longDate(date)}`.slice(0, 200) };
    } else if (slot) {
      action = { kind: 'request-experience', label: `Request ${timeOf(slot.start)}`, experienceId: e.id, start: slot.start, partySize: e.format === 'private' ? party : Math.min(party, slot.remaining) };
    } else {
      action = { kind: 'service-request', label: 'Ask the concierge', type: requestTypeFor(e), summary: `${e.title}, ${longDate(date)}`.slice(0, 200) };
    }

    results.push({
      id: `rec_${e.id}`,
      recommendation: e.title,
      experienceId: e.id,
      category: e.category,
      reason: primary.reason!,
      relevanceScore: score,
      voyageDate: date,
      ...(day ? { dayNumber: day.day } : {}),
      destination,
      action,
      sourceSignals: signals,
      rules: [...new Set([...drivers.map((d) => d.rule), ...penalties])],
      booked: Boolean(booking),
    });
  }

  results.sort((a, b) => b.relevanceScore - a.relevanceScore || (a.voyageDate < b.voyageDate ? -1 : a.voyageDate > b.voyageDate ? 1 : 0) || (a.id < b.id ? -1 : 1));
  return diversify(results, limit, maxPerCategory);
}

function dedupe(signals: SourceSignal[]): SourceSignal[] {
  const seen = new Set<string>();
  return signals.filter((s) => {
    const key = `${s.kind}|${s.detail}|${s.ref ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Highest first, at most `perCategory` of a kind until the others are used. */
function diversify(sorted: PersonalizedRecommendation[], limit: number, perCategory: number): PersonalizedRecommendation[] {
  const picked: PersonalizedRecommendation[] = [];
  const held: PersonalizedRecommendation[] = [];
  const count = new Map<string, number>();
  for (const r of sorted) {
    if (picked.length >= limit) break;
    const n = count.get(r.category) ?? 0;
    if (n < perCategory) {
      picked.push(r);
      count.set(r.category, n + 1);
    } else held.push(r);
  }
  // Then the rest, in rank order, after the varied set.
  for (const r of held) {
    if (picked.length >= limit) break;
    picked.push(r);
  }
  return picked;
}

/** What may leave the server for the guest app: internal signals removed. */
export function toGuestSafe(list: PersonalizedRecommendation[]): PersonalizedRecommendation[] {
  return list.map((r) => ({ ...r, sourceSignals: r.sourceSignals.filter((s) => s.visibility === 'guest') }));
}
