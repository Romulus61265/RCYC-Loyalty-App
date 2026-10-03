/**
 * Development dataset integrity check.  Run: `npm run check:fixtures`
 *
 * Verifies that the fictional dataset is internally consistent (references,
 * times, totals), clearly marked as fictional, conforms to the product brief,
 * and that every suggested concierge question routes to the intended answer.
 * Exits non-zero on any failure, so it can gate CI.
 */
import { devDataset as ds } from '@/data/fixtures';
import { MockConciergeAI } from '@/services/mock/MockConciergeAI';
import type { ConciergeIntent, PortCall } from '@/domain';

const failures: string[] = [];
let passed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail ? ` — ${detail}` : ''}`);
}
const ms = (iso: string) => Date.parse(iso);
const missing = <T>(items: T[], has: (t: T) => boolean) => items.filter((i) => !has(i));

const { guest, voyage, experiences, concierge, communication, personalization } = ds;
const itinerary = voyage.voyage.itinerary;
const portById = new Map(itinerary.map((p) => [p.id, p]));
const expById = new Map(experiences.catalogue.map((e) => [e.id, e]));
const bookingById = new Map(experiences.bookings.map((b) => [b.id, b]));
const party = new Set(voyage.reservation.partyGuestIds);

// ── 1 · Clearly fictional & separated ─────────────────────────────────────
check('meta.fictional is true', ds.meta.fictional === true);
check('meta restricts consumers to mock services', ds.meta.allowedConsumers === 'mock-services-only');
const allIds = JSON.stringify(ds).match(/"id":"([^"]+)"/g)?.map((m) => m.slice(6, -1)) ?? [];
const nonDevIds = allIds.filter((id) => !id.startsWith('dev_'));
check('every record id is dev_-prefixed', nonDevIds.length === 0, nonDevIds.slice(0, 5).join(', '));
check('e-mail values use the reserved example.com domain', guest.profile.guest.emailMasked.endsWith('@example.com'));
check('every integration record is sourced from "mock"', [guest.profile.guest, guest.membership, voyage.voyage, voyage.reservation, ...voyage.pastVoyages].every((r) => r.source.system === 'mock'));

// ── 2 · Referential integrity ─────────────────────────────────────────────
check('bookings reference catalogue experiences', missing(experiences.bookings, (b) => expById.has(b.experienceId)).length === 0);
check('bookings belong to the reservation', experiences.bookings.every((b) => b.reservationId === voyage.reservation.id));
check('booking category matches its experience', missing(experiences.bookings, (b) => expById.get(b.experienceId)?.category === b.category).length === 0,
  missing(experiences.bookings, (b) => expById.get(b.experienceId)?.category === b.category).map((b) => b.id).join(', '));
check('catalogue port calls exist', missing(experiences.catalogue.filter((e) => e.portCallId), (e) => portById.has(e.portCallId!)).length === 0);
check('collections reference catalogue items', experiences.collections.every((c) => c.experienceIds.every((id) => expById.has(id))));
check('destinations reference port calls', experiences.destinations.every((d) => !d.portCallId || portById.has(d.portCallId)));
check('recommendations reference catalogue items', personalization.recommendations.every((r) => !r.experienceId || expById.has(r.experienceId)));
check('schedule days reference port calls', experiences.daySchedules.every((d) => portById.has(d.portCallId)));
const scheduleBookingRefs = experiences.daySchedules.flatMap((d) => d.items.filter((i) => i.bookingId));
check('schedule booking items reference bookings', scheduleBookingRefs.every((i) => bookingById.has(i.bookingId!)));
check('schedule booking times match the booking', scheduleBookingRefs.every((i) => bookingById.get(i.bookingId!)?.start === i.start),
  scheduleBookingRefs.filter((i) => bookingById.get(i.bookingId!)?.start !== i.start).map((i) => i.id).join(', '));
check('every booking appears in the daily programme', experiences.bookings.every((b) => scheduleBookingRefs.some((i) => i.bookingId === b.id)));
check('documents belong to the travelling party', voyage.documents.every((d) => party.has(d.guestId)));
check('occasions reference the travelling party', guest.profile.occasions.every((o) => o.personIds.every((p) => party.has(p))));
check('flights belong to the reservation', voyage.flights.every((f) => f.reservationId === voyage.reservation.id));
check('reservation points at the yacht, suite and voyage', voyage.reservation.voyageId === voyage.voyage.id && voyage.reservation.suiteId === voyage.suite.id && voyage.voyage.yachtId === voyage.yacht.id);
check('concierge requests belong to the reservation', concierge.requests.every((r) => r.reservationId === voyage.reservation.id));
const knownVoyages = new Set([voyage.voyage.id, ...voyage.pastVoyages.map((v) => v.id)]);
check('signals reference known voyages', personalization.signals.every((s) => !s.voyageId || knownVoyages.has(s.voyageId)));
check('notifications target the lead guest', communication.notifications.every((n) => n.guestId === guest.profile.guest.id));

// ── 3 · Itinerary shape ───────────────────────────────────────────────────
check('itinerary days are consecutive from 1', itinerary.every((p, i) => p.day === i + 1));
check('itinerary dates are consecutive', itinerary.every((p, i) => i === 0 || ms(`${p.date}T00:00:00Z`) - ms(`${itinerary[i - 1]!.date}T00:00:00Z`) === 86_400_000));
check('nights = days − 1 = 7', voyage.voyage.nights === itinerary.length - 1 && voyage.voyage.nights === 7);
check('voyage start/end dates match itinerary', voyage.voyage.startDate === itinerary[0]?.date && voyage.voyage.endDate === itinerary.at(-1)?.date);
const route = [...new Set(itinerary.filter((p) => p.type !== 'sea').map((p) => p.portName.replace(/ \(.*\)$/, '')))];
check('route is Barcelona → Palma → Saint-Tropez → Monte Carlo → Portofino → Rome',
  JSON.stringify(route) === JSON.stringify(['Barcelona', 'Palma de Mallorca', 'Saint-Tropez', 'Monte Carlo', 'Portofino', 'Rome']), route.join(' → '));
check('every day has a programme', experiences.daySchedules.length === itinerary.length);

// ── 4 · Times ─────────────────────────────────────────────────────────────
const vStart = ms(`${voyage.voyage.startDate}T00:00:00+02:00`);
const vEnd = ms(`${voyage.voyage.endDate}T23:59:59+02:00`);
check('bookings fall within the voyage dates', experiences.bookings.every((b) => ms(b.start) >= vStart && ms(b.start) <= vEnd));
check('bookings end after they start', experiences.bookings.every((b) => !b.end || ms(b.end) > ms(b.start)));

/** Shore time for a port day: from arrival (or the previous overnight) to all-aboard (or next day's). */
function shoreWindow(p: PortCall): [number, number] {
  const idx = itinerary.indexOf(p);
  const from = p.arrival ?? itinerary[idx - 1]?.arrival ?? `${p.date}T00:00:00+02:00`;
  const to = p.allAboard ?? itinerary[idx + 1]?.allAboard ?? `${p.date}T23:59:00+02:00`;
  return [ms(from), ms(to)];
}
const ashore = experiences.bookings.filter((b) => {
  const pc = expById.get(b.experienceId)?.portCallId;
  return pc && portById.get(pc)?.type !== 'embark' && portById.get(pc)?.type !== 'disembark' && b.category !== 'transfer';
});
const outsideWindow = ashore.filter((b) => {
  const [from, to] = shoreWindow(portById.get(expById.get(b.experienceId)!.portCallId!)!);
  return ms(b.start) < from || ms(b.end ?? b.start) > to;
});
check('shore experiences sit between arrival and all-aboard', outsideWindow.length === 0, outsideWindow.map((b) => b.id).join(', '));
const portOfBooking = experiences.bookings.filter((b) => expById.get(b.experienceId)?.portCallId).filter((b) => portById.get(expById.get(b.experienceId)!.portCallId!)!.date !== b.start.slice(0, 10));
check('port experiences are booked on that port day', portOfBooking.length === 0, portOfBooking.map((b) => b.id).join(', '));

const timed = experiences.bookings.filter((b) => b.category !== 'transfer').map((b) => ({ id: b.id, s: ms(b.start), e: ms(b.end ?? b.start) + (b.end ? 0 : 120 * 60_000) })).sort((a, b) => a.s - b.s);
const overlaps = timed.slice(1).flatMap((b, i) => (b.s < timed[i]!.e ? [`${timed[i]!.id} ↔ ${b.id}`] : []));
check('no two party bookings overlap (dinners assumed 2h)', overlaps.length === 0, overlaps.join(', '));

const inbound = voyage.flights.find((f) => f.direction === 'inbound');
const outbound = voyage.flights.find((f) => f.direction === 'outbound');
const firstTransfer = experiences.bookings.find((b) => b.id === 'dev_bkg_transfer_bcn');
const lastTransfer = experiences.bookings.find((b) => b.id === 'dev_bkg_transfer_fco');
check('inbound flight originates at the home airport', inbound?.origin === guest.profile.guest.homeAirport);
check('outbound flight returns to the home airport', outbound?.destination === guest.profile.guest.homeAirport);
check('arrival transfer starts ≥ 45 min after landing', !!inbound && !!firstTransfer && ms(firstTransfer.start) - ms(inbound.arrival) >= 45 * 60_000);
check('departure transfer reaches the airport ≥ 2h 30m before the flight', !!outbound && !!lastTransfer?.end && ms(outbound.departure) - ms(lastTransfer.end) >= 150 * 60_000);
check('flight durations are plausible (7–12h)', voyage.flights.every((f) => { const h = (ms(f.arrival) - ms(f.departure)) / 3_600_000; return h >= 7 && h <= 12; }));
check('embarkation window is after the private morning', !!firstTransfer?.end && ms(voyage.embarkation.arrivalWindowStart) >= ms(firstTransfer.end));
check('reference "now" is before embarkation', ms(ds.meta.referenceNow) < ms(voyage.embarkation.arrivalWindowStart));
check('delivered notifications are in the past; scheduled ones in the future',
  communication.notifications.every((n) => (n.deliveredAt ? ms(n.deliveredAt) <= ms(ds.meta.referenceNow) : ms(n.scheduledFor) > ms(ds.meta.referenceNow))));
check('alerts expire after they were created', communication.alerts.every((a) => !a.expiresAt || ms(a.expiresAt) > ms(a.createdAt)));
check('concierge requests were created before "now"', concierge.requests.every((r) => ms(r.createdAt) <= ms(ds.meta.referenceNow) && ms(r.updatedAt) >= ms(r.createdAt)));

// ── 4b · Availability & formats ───────────────────────────────────────────
const availById = new Map(experiences.availability.map((a) => [a.experienceId, a]));
check('every experience has availability', experiences.catalogue.every((e) => availById.has(e.id)), experiences.catalogue.filter((e) => !availById.has(e.id)).map((e) => e.id).join(', '));
check('availability references catalogue experiences', experiences.availability.every((a) => expById.has(a.experienceId)));
check('fully booked means no slots; waitlist means no open places', experiences.availability.every((a) => (a.status !== 'unavailable' || a.slots.length === 0) && (a.status !== 'waitlist' || a.slots.every((s) => s.remaining === 0))));
const slotIssues = experiences.availability.flatMap((a) => {
  const e = expById.get(a.experienceId);
  const pc = e?.portCallId ? portById.get(e.portCallId) : undefined;
  if (!pc || pc.type === 'embark' || pc.type === 'disembark' || e?.category === 'transfer') return [];
  const [from, to] = shoreWindow(pc);
  // An overnight port offers the same experience on either day.
  const sameNameDays = itinerary.filter((p) => p.portName === pc.portName);
  return a.slots.filter((s) => !sameNameDays.some((p) => p.date === s.start.slice(0, 10)) || (sameNameDays.length === 1 && (ms(s.start) < from || ms(s.end ?? s.start) > to))).map((s) => `${a.experienceId}@${s.start}`);
});
check('port slots fall on the port day, within the shore window', slotIssues.length === 0, slotIssues.join(', '));
check('slot end times keep the local +02:00 offset', experiences.availability.every((a) => a.slots.every((s) => !s.end || s.end.endsWith('+02:00'))));
check('booked experiences have a slot at the booked time (except bespoke)', experiences.bookings.every((b) => {
  const a = availById.get(b.experienceId);
  return !a || a.slots.length === 0 || a.slots.some((s) => s.start === b.start) || b.category === 'dining' || b.category === 'transfer';
}), experiences.bookings.filter((b) => { const a = availById.get(b.experienceId); return a && a.slots.length > 0 && !a.slots.some((s) => s.start === b.start) && b.category !== 'dining' && b.category !== 'transfer'; }).map((b) => b.id).join(', '));
check('private-format experiences are offered privately', experiences.catalogue.every((e) => e.format !== 'private' || e.privateAvailable));
check('Wellness category is stocked', experiences.catalogue.filter((e) => e.category === 'wellness').length >= 3);
check('positive past-voyage signals carry a memory phrase', personalization.signals.filter((s) => s.kind.endsWith('-history') && (s.rating ?? 0) >= 4 && s.voyageId && s.voyageId !== voyage.voyage.id).every((s) => !!s.memory));

// ── 5 · Totals ────────────────────────────────────────────────────────────
check('3 completed voyages', guest.relationship.voyagesCompleted === 3 && voyage.pastVoyages.length === 3);
check('nights sailed equals past voyage nights', guest.relationship.nightsSailed === voyage.pastVoyages.reduce((n, v) => n + v.nights, 0));
check('first voyage date matches history', guest.relationship.firstVoyageDate === [...voyage.pastVoyages].sort((a, b) => a.startDate.localeCompare(b.startDate))[0]?.startDate);

// ── 6 · Conformance to the brief ──────────────────────────────────────────
const p = guest.profile.preferences;
const lower = (xs: string[]) => xs.join(' | ').toLowerCase();
check('name is Alexander Laurent', `${guest.profile.guest.firstName} ${guest.profile.guest.lastName}` === 'Alexander Laurent');
check('Bonvoy status is Titanium Elite', guest.membership.tier === 'titanium' && guest.membership.tierLabel === 'Titanium Elite');
check('home airport is Miami (MIA)', guest.profile.guest.homeAirport === 'MIA');
check('interests: fine dining, wine, private cultural, spa, yachting', ['fine dining', 'wine', 'private cultural', 'spa', 'yachting'].every((k) => lower(p.activityInterests).includes(k)));
check('prefers Mediterranean cuisine', lower(p.dining.cuisines).includes('mediterranean'));
check('prefers window dining', p.dining.tablePreference === 'window');
check('prefers sparkling water', lower(p.beverage.nonAlcoholic).includes('sparkling water'));
check('prefers red wine', lower(p.beverage.wine).includes('red wine'));
check('feather-free pillows', (p.suite.pillow ?? '').toLowerCase().includes('feather-free'));
check('private excursions', p.excursions.style === 'private');
const shoreExcursions = experiences.bookings.filter((b) => ['culture', 'private', 'wine', 'excursion'].includes(b.category) && expById.get(b.experienceId)?.portCallId);
check('every booked shore excursion is private', shoreExcursions.every((b) => expById.get(b.experienceId)?.privateAvailable), shoreExcursions.filter((b) => !expById.get(b.experienceId)?.privateAvailable).map((b) => b.id).join(', '));
const anniversary = guest.profile.occasions.find((o) => o.type === 'anniversary');
check('wedding anniversary occurs during the voyage', !!anniversary && anniversary.date >= voyage.voyage.startDate && anniversary.date <= voyage.voyage.endDate);
check('yacht is Evrima', voyage.yacht.name === 'Evrima');
check('suite is a Grand Suite', voyage.suite.name === 'Grand Suite');
// Counter seating and the private anniversary terrace are deliberate exceptions.
const NOT_WINDOW = new Set(['dev_exp_chefs_counter', 'dev_exp_anniversary_terrace']);
const windowDinners = experiences.bookings.filter((b) => b.category === 'dining' && !NOT_WINDOW.has(b.experienceId));
check('restaurant dinners are at window tables', windowDinners.every((b) => /window/i.test(b.note ?? '')), windowDinners.filter((b) => !/window/i.test(b.note ?? '')).map((b) => b.id).join(', '));
const counts = (c: string) => experiences.bookings.filter((b) => b.category === c).length;
check('has dining, spa, transfer and excursion bookings', counts('dining') >= 5 && counts('spa') >= 2 && counts('transfer') >= 2 && shoreExcursions.length >= 4,
  `dining ${counts('dining')}, spa ${counts('spa')}, transfers ${counts('transfer')}, excursions ${shoreExcursions.length}`);
check('guest-audience and crew-audience recommendations both present', personalization.recommendations.some((r) => r.audience === 'guest') && personalization.recommendations.some((r) => r.audience === 'crew'));

// ── 7 · Concierge routing for suggested questions ─────────────────────────
const expected: ConciergeIntent[] = ['schedule.query', 'dining.modify', 'experience.discover', 'transport.arrange', 'loyalty.benefits', 'occasion.plan'];
const ai = new MockConciergeAI();
const context = { guestRef: 'dev', preferredName: 'Alexander', phase: 'prepare' as const, tierLabel: 'Titanium Elite', upcomingBookingIds: [], occasionsThisVoyage: [], locale: 'en-US' };

async function main() {
  for (const [i, question] of concierge.suggestedQuestions.entries()) {
    const res = await ai.respond({ conversationId: 'dev_cnv', body: question, context, history: [] });
    const intent = res.messages[0]?.intent;
    check(`concierge: "${question}" → ${expected[i]}`, intent === expected[i], `got ${intent}`);
    check(`concierge reply to "${question}" has no unresolved values`, !/undefined|NaN|\[object/.test(res.messages[0]?.body ?? ''), res.messages[0]?.body.slice(0, 120));
  }

  const total = passed + failures.length;
  if (failures.length) {
    console.error(`\n${failures.join('\n')}\n\n${failures.length} of ${total} checks failed.`);
    process.exit(1);
  }
  console.log(`✔ ${ds.meta.datasetId}: all ${total} checks passed.`);
}

void main();
