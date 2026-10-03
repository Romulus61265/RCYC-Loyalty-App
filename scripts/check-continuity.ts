/// <reference types="node" />
/**
 * Shoreside-to-yacht continuity checks.  Run: `npm run check:continuity`
 *
 * The demonstration: AA 7412 to Barcelona, two hours late, for a Titanium
 * Elite guest in Grand Suite 612 with a private transfer and an embarkation
 * window. The rules (new pick-up, plans en route, the window, all aboard),
 * the words the guest reads, the events and their causation, idempotency,
 * honest outcomes (done only when its owner confirmed it), and the mock
 * pipeline end to end: MockTravelDisruptionService → orchestrator → the
 * transfer, the embarkation and Home.
 */
import { devDataset as d, IDS } from '@/data/fixtures';
import { arrivalCard, buildArrivalModel } from '@/features/continuity/arrivalModel';
import { buildHomeViewModel } from '@/features/home/homeModel';
import { buildArrivalContext } from '@/services/continuity/buildArrivalContext';
import { MockContinuityService } from '@/services/mock/MockContinuityService';
import { MockExperienceService } from '@/services/mock/MockExperienceService';
import { MockLoyaltyService } from '@/services/mock/MockLoyaltyService';
import { MockGuestRecordSource } from '@/services/mock/MockMiscServices';
import { MOCK_FLIGHT_SOURCE, MockTravelDisruptionService } from '@/services/mock/MockTravelDisruptionService';
import { MockVoyageService } from '@/services/mock/MockVoyageService';
import { RepositoryGuestProfileService } from '@/services/profile/RepositoryGuestProfileService';
import { MemoryKeyValueStore } from '@/services/repositories/KeyValueStore';
import { LocalPreferencesRepository } from '@/services/repositories/PreferencesRepository';
import { aboutDuration, continuityEvents, ENGINE_VERSION, planArrival, shift, toArrivalUpdate } from '../supabase/functions/_shared/continuity/engine';
import { handleFlightUpdate, type ContinuityPorts } from '../supabase/functions/_shared/continuity/orchestrator';
import type { ActionOutcome, ArrivalContext, ArrivalUpdate, ExecutedAction, FlightStatusUpdate } from '../supabase/functions/_shared/continuity/types';

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : `\n    ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}`}`);
};

const R = IDS.reservation;
const G = IDS.guest;
const NOW = new Date('2027-05-15T07:30:00+02:00');

function services(now = NOW) {
  const clock = { now: () => now };
  const profile = new RepositoryGuestProfileService(new MockGuestRecordSource(), new LocalPreferencesRepository(new MemoryKeyValueStore()));
  const voyage = new MockVoyageService();
  const experience = new MockExperienceService();
  const loyalty = new MockLoyaltyService();
  const travel = new MockTravelDisruptionService(d.voyage.flights, clock);
  return { profile, voyage, experience, loyalty, travel, clock };
}

const obs = (minutes: number, extra: Partial<FlightStatusUpdate> = {}): FlightStatusUpdate => ({
  observationId: `obs_${minutes}`,
  flightNumber: 'AA 7412',
  departureDate: '2027-05-14',
  status: 'delayed',
  scheduledArrival: '2027-05-15T09:10:00+02:00',
  estimatedArrival: shift('2027-05-15T09:10:00+02:00', minutes),
  observedAt: '2027-05-15T05:30:00.000Z',
  source: 'test',
  simulated: true,
  ...extra,
});

/** Runs the rules with every port answering `outcome`. */
const executedWith = (plan: NonNullable<ReturnType<typeof planArrival>>, outcome: (kind: string) => ActionOutcome): ExecutedAction[] => plan.actions.map((a) => ({ action: a, outcome: outcome(a.kind), by: 'x' }));
const mockOutcome = (k: string): ActionOutcome => (k === 'retime-transfer' ? 'confirmed' : k === 'request-experience-change' ? 'requested' : 'notified');

async function main() {
  const s = services();
  const ctx = (await buildArrivalContext(s, G, R, obs(120), NOW))!;

  // ─── Helpers ─────────────────────────────────────────────────────────────
  check('shift keeps the offset', shift('2027-05-15T09:10:00+02:00', 120) === '2027-05-15T11:10:00+02:00' && shift('2027-05-14T23:30:00-04:00', 45) === '2027-05-15T00:15:00-04:00');
  check('durations read as people say them', aboutDuration(120) === 'about 2 hours' && aboutDuration(47) === 'about 45 minutes' && aboutDuration(95) === 'about 1 hour 35 minutes');
  check('engine version', ENGINE_VERSION === 'continuity-rules-v1');

  // ─── The guest's arrival day ─────────────────────────────────────────────
  check('context: the guest, Titanium Elite, Grand Suite 612', ctx.guest.firstName === 'Alexander' && ctx.guest.tier === 'Titanium Elite' && ctx.guest.suiteName === 'Grand Suite 612', ctx.guest);
  check('context: the private transfer meeting AA 7412', ctx.transfer?.bookingId === 'dev_bkg_transfer_bcn' && ctx.transfer.start === '2027-05-15T10:00:00+02:00' && ctx.flight.flightNumber === 'AA 7412');
  check('context: the Sagrada Família visit is on the way to the yacht', ctx.enRoute.length === 1 && ctx.enRoute[0]?.bookingId === 'dev_bkg_sagrada');
  check('context: the embarkation window', ctx.embarkation.windowStart === '2027-05-15T13:30:00+02:00' && ctx.embarkation.windowEnd === '2027-05-15T14:00:00+02:00' && ctx.embarkation.allAboard === '2027-05-15T19:00:00+02:00');

  // ─── The rules: two hours late ───────────────────────────────────────────
  const plan = planArrival(obs(120), ctx)!;
  check('two hours late', plan.delayMinutes === 120 && plan.newArrival === '2027-05-15T11:10:00+02:00' && !plan.minor);
  check('new pick-up keeps the 50 minutes after landing', plan.newPickup === '2027-05-15T12:00:00+02:00', plan.newPickup);
  check('actions: transfer, the visit en route, the embarkation team', plan.actions.map((a) => a.kind).join() === 'retime-transfer,request-experience-change,notify-embarkation', plan.actions);
  const re = plan.actions[0] as Extract<(typeof plan.actions)[number], { kind: 'retime-transfer' }>;
  check('the transfer moves, end and all', re.start === '2027-05-15T12:00:00+02:00' && re.end === '2027-05-15T15:30:00+02:00');
  check('the visit is asked to move by the same', (plan.actions[1] as { start: string }).start === '2027-05-15T12:45:00+02:00');
  check('at the terminal by about 15:30; the window moves to 15:30–16:00', plan.atTerminal === '2027-05-15T15:30:00+02:00' && plan.window?.start === '2027-05-15T15:30:00+02:00' && plan.window.end === '2027-05-15T16:00:00+02:00');
  check('luggage follows by the same', (plan.actions[2] as { luggageDeliveredBy?: string }).luggageDeliveredBy === '2027-05-15T17:30:00+02:00');
  check('all aboard is not at risk', !plan.allAboardAtRisk);
  check('one plan per flight and estimate', plan.key === 'arrival:dev_flt_in:2027-05-15T11:10:00+02:00');
  check('deterministic', JSON.stringify(planArrival(obs(120), ctx)) === JSON.stringify(plan));

  // Other cases.
  const minor = planArrival(obs(15), ctx)!;
  check('a short delay changes nothing: the driver waits', minor.minor && minor.actions.length === 0);
  check('not this guest’s flight', planArrival(obs(120, { flightNumber: 'BA 480' }), ctx) === null);
  check('no estimate, nothing to plan', planArrival(obs(120, { estimatedArrival: undefined }), ctx) === null);
  const odd = planArrival(obs(37), ctx)!;
  check('pick-up rounds up to five minutes', odd.newPickup === '2027-05-15T10:40:00+02:00', odd.newPickup);
  const tight: ArrivalContext = { ...ctx, transfer: { ...ctx.transfer!, start: '2027-05-15T09:20:00+02:00' } };
  check('never meets sooner than 45 minutes after landing', planArrival(obs(120), tight)!.newPickup === '2027-05-15T11:55:00+02:00', planArrival(obs(120), tight)!.newPickup);
  const long = planArrival(obs(300), ctx)!;
  check('five hours late: all aboard at risk, a person calls', long.allAboardAtRisk && long.actions.some((a) => a.kind === 'alert-crew' && a.reason === 'all-aboard-at-risk'));
  const noTransfer = planArrival(obs(120), { ...ctx, transfer: undefined, enRoute: [] })!;
  check('no transfer booked: the crew offer one', noTransfer.actions.length === 1 && noTransfer.actions[0]?.kind === 'alert-crew' && (noTransfer.actions[0] as { reason: string }).reason === 'no-transfer');
  const cancelled = planArrival(obs(0, { status: 'cancelled', estimatedArrival: undefined }), ctx)!;
  check('a cancelled flight goes to a person', cancelled.actions[0]?.kind === 'alert-crew' && cancelled.allAboardAtRisk);
  const early = planArrival(obs(25), { ...ctx, enRoute: [] })!;
  check('a delay that still fits the window keeps it, and still tells the gangway', early.window?.start === ctx.embarkation.windowStart && early.actions.some((a) => a.kind === 'notify-embarkation'));

  // ─── What the guest reads ────────────────────────────────────────────────
  const u = toArrivalUpdate(plan, executedWith(plan, mockOutcome), ctx, obs(120), { id: 'a1', createdAt: NOW.toISOString() });
  check('headline, exactly', u.headline === "We've adjusted your arrival arrangements.", u.headline);
  check('the six steps, in order', u.steps.map((x) => x.label).join(' | ') === 'Inbound flight delay detected | Private transfer updated | Embarkation team notified | New transfer time | Updated arrival estimate | Concierge available', u.steps.map((x) => x.label));
  const step = (k: string) => u.steps.find((x) => x.kind === k)!;
  check('flight: number, city, new time, how late', step('flight-delay').detail === 'AA 7412 from Miami is now expected at 11:10, about 2 hours later than planned.', step('flight-delay').detail);
  check('transfer: from and to', step('transfer-updated').detail === 'Your driver will meet you at 12:00 instead of 10:00, and is following the flight.' && step('transfer-updated').state === 'done');
  check('embarkation: the new window, and the suite', step('embarkation-notified').detail === 'They now expect you between 15:30 and 16:00. Grand Suite 612 will be ready when you arrive.');
  check('new transfer time: 12:00 at arrivals', step('transfer-time').value === '12:00' && step('transfer-time').detail.includes('Terminal 1 arrivals'));
  check('arrival estimate: 15:30, and time to spare', step('arrival-estimate').value === '15:30' && /All aboard is at 19:00, so there is time to spare\./.test(step('arrival-estimate').detail));
  check('concierge: Elena', step('concierge').detail === 'Elena is following your flight and is here if you would like anything changed.');
  check('the visit en route: requested, not done', u.alsoAffected.length === 1 && u.alsoAffected[0]!.state === 'pending' && u.alsoAffected[0]!.detail === 'We have asked to move it to 12:45, after you land. The team will confirm.');
  check('marked simulated', u.simulated);
  const guestText = JSON.stringify(u);
  check('nothing the guest reads names a supplier, a feed or a status tier claim', !/FlightAware|OAG|Cirium|supplier|integration|API|Titanium/i.test(guestText.replace(/"source":"[^"]*"/, '')), guestText);
  check('no exclamation marks', !/!/.test(u.headline + u.intro + u.steps.map((x) => x.detail).join('')));

  // Honest outcomes: nothing is "done" until its owner says so.
  const asked = toArrivalUpdate(plan, executedWith(plan, () => 'requested'), ctx, obs(120), { id: 'a2', createdAt: NOW.toISOString() });
  check('only requested: the headline says so', asked.headline === "We're adjusting your arrival arrangements." && /we will tell you as each change is confirmed/.test(asked.intro));
  check('only requested: the transfer step says so', asked.steps.find((x) => x.kind === 'transfer-updated')?.label === 'Private transfer being updated' && asked.steps.find((x) => x.kind === 'transfer-updated')?.state === 'pending' && /They will confirm/.test(asked.steps.find((x) => x.kind === 'transfer-updated')!.detail));
  check('only requested: the embarkation step says so', asked.steps.find((x) => x.kind === 'embarkation-notified')?.label === 'Embarkation team being told');
  const atRisk = toArrivalUpdate(long, executedWith(long, mockOutcome), ctx, obs(300), { id: 'a3', createdAt: NOW.toISOString() });
  check('all aboard at risk: Elena will call', atRisk.attention === 'Elena will call you to plan the rest of the day.' && /close to all aboard/.test(atRisk.steps.find((x) => x.kind === 'arrival-estimate')!.detail));
  const small = toArrivalUpdate(minor, [], ctx, obs(15), { id: 'a4', createdAt: NOW.toISOString() });
  check('a short delay: calm, two lines', small.headline === 'Your flight is running a little late' && small.steps.length === 2);

  // ─── Events ──────────────────────────────────────────────────────────────
  const events = continuityEvents(plan, executedWith(plan, mockOutcome), ctx, obs(120));
  check('events: the delay, then what it caused', events.map((e) => e.type).join() === 'flight.delayed,transfer.rescheduled,experience.change_requested,embarkation.changed', events.map((e) => e.type));
  check('events: all correlated to the observation', events.every((e) => e.correlationId === 'obs_120'));
  check('events: each caused by the delay', events.slice(1).every((e) => e.causationId === events[0]!.dedupeKey));
  check('events: unique keys', new Set(events.map((e) => e.dedupeKey)).size === events.length);
  check('events: the embarkation team hears of the tier and the suite', events[3]?.payload.guestTier === 'Titanium Elite' && events[3]?.payload.suite === 'Grand Suite 612');

  // ─── The orchestrator: ports, idempotency, failures ──────────────────────
  const saved: ArrivalUpdate[] = [];
  const calls: string[] = [];
  const ports = (fail?: string): ContinuityPorts => ({
    find: async (key) => saved.find((x) => x.key === key) ?? null,
    contexts: async () => [ctx],
    transfer: { retime: async () => (calls.push('transfer'), fail === 'transfer' ? Promise.reject(new Error('down')) : 'confirmed') },
    experiences: { requestChange: async () => (calls.push('venue'), 'requested') },
    embarkation: { notify: async () => (calls.push('embarkation'), 'notified') },
    crew: { alert: async () => (calls.push('crew'), 'notified') },
    publish: async () => undefined,
    save: async (x) => {
      const y = { ...x, id: `s${saved.length + 1}` };
      saved.push(y);
      return y;
    },
    audit: async () => undefined,
  });
  const [first] = await handleFlightUpdate(ports(), obs(120), { now: NOW });
  check('orchestrator: adjusted, every team told once', first?.status === 'adjusted' && calls.join() === 'transfer,venue,embarkation' && first.update?.headline === "We've adjusted your arrival arrangements.", { first, calls });
  const [again] = await handleFlightUpdate(ports(), obs(120, { observationId: 'repeat' }), { now: NOW });
  check('orchestrator: the same estimate again changes nothing', again?.status === 'duplicate' && calls.length === 3);
  saved.length = 0;
  calls.length = 0;
  const [failed] = await handleFlightUpdate(ports('transfer'), obs(120), { now: NOW });
  check('orchestrator: a failing port never stops the others, and a person takes it', calls.join() === 'transfer,venue,embarkation,crew' && failed?.outcomes?.[0] === 'failed', { calls, failed });
  check('orchestrator: the guest is not told it is done', failed?.update?.headline === "We're adjusting your arrival arrangements." && /Elena is arranging your driver for 12:00 personally\./.test(failed.update.steps.find((x) => x.kind === 'transfer-updated')!.detail));

  // ─── The mock pipeline, end to end ───────────────────────────────────────
  const m = services();
  const continuity = new MockContinuityService(m);
  check('before: no update, flight on schedule', (await continuity.getArrivalUpdate(R)) === null && (await m.travel.getFlightStatus('AA 7412', '2027-05-14'))?.status === 'scheduled');
  let heard = 0;
  continuity.subscribe(R, () => (heard += 1));
  const emitted = m.travel.simulateDelay('dev_flt_in', 120);
  await continuity.settled();
  check('the mock source says what it is', emitted.source === MOCK_FLIGHT_SOURCE && emitted.simulated && emitted.estimatedArrival === '2027-05-15T11:10:00+02:00');
  check('the source remembers the latest observation', (await m.travel.getFlightStatus('AA 7412', '2027-05-14'))?.observationId === emitted.observationId);
  const live = (await continuity.getArrivalUpdate(R))!;
  check('the guest’s update, live', live?.headline === "We've adjusted your arrival arrangements." && heard === 1 && live.steps.length === 6, live);
  const overview = await m.voyage.getOverview(R);
  const inbound = overview.flights.find((f) => f.direction === 'inbound')!;
  check('the flight is recorded as delayed, with the estimate', inbound.status === 'delayed' && inbound.estimatedArrival === '2027-05-15T11:10:00+02:00');
  check('the embarkation window and luggage moved, with a note', overview.embarkation.arrivalWindowStart === '2027-05-15T15:30:00+02:00' && overview.embarkation.luggage?.deliveredBy === '2027-05-15T17:30:00+02:00' && /expects you between 15:30 and 16:00/.test(overview.embarkation.notes[0] ?? ''));
  const bookings = await m.experience.listBookings(R);
  const transfer = bookings.find((b) => b.id === 'dev_bkg_transfer_bcn')!;
  const sagrada = bookings.find((b) => b.id === 'dev_bkg_sagrada')!;
  check('the transfer is re-timed and confirmed by the (mock) operator', transfer.start === '2027-05-15T12:00:00+02:00' && transfer.end === '2027-05-15T15:30:00+02:00' && transfer.status === 'confirmed' && /12:00/.test(transfer.note ?? ''));
  check('the visit is a change request, for the team to confirm', sagrada.start === '2027-05-15T12:45:00+02:00' && sagrada.status === 'in_progress');
  check('the events were published, in order', continuity.events.map((e) => e.type).join() === 'flight.delayed,transfer.rescheduled,experience.change_requested,embarkation.changed');
  m.travel.simulateDelay('dev_flt_in', 120);
  await continuity.settled();
  check('the same delay reported again: nothing moves twice', (await m.experience.listBookings(R)).find((b) => b.id === 'dev_bkg_transfer_bcn')?.start === '2027-05-15T12:00:00+02:00' && continuity.events.length === 4 && heard === 1);
  check('the fixtures are untouched', d.voyage.embarkation.arrivalWindowStart === '2027-05-15T13:30:00+02:00' && d.voyage.flights[0]!.status === 'scheduled' && d.experiences.bookings.find((b) => b.id === 'dev_bkg_transfer_bcn')?.start === '2027-05-15T10:00:00+02:00');
  const fresh = await new MockVoyageService().getOverview(R);
  check('another instance still sees the original schedule', fresh.embarkation.arrivalWindowStart === '2027-05-15T13:30:00+02:00');

  // ─── Home and the view models ────────────────────────────────────────────
  const recognition = await m.loyalty.getRecognition(G, IDS.voyage);
  const profile = await m.profile.getProfile(G);
  const home = buildHomeViewModel(
    { overview, recognition, profile },
    { bookings: { ok: true, value: bookings }, schedules: { ok: true, value: [] }, catalogue: { ok: true, value: [] }, alerts: { ok: true, value: [] }, recommendations: { ok: true, value: [] } } as never,
    await m.voyage.getJourneyPhase(R, NOW),
    NOW,
  );
  check('Home: the transfer at 12:00, the flight’s new time', home.transfer?.whenLabel.includes('12:00') === true && home.transfer.flight?.status === 'Now landing 11:10, and your driver knows', home.transfer);
  check('Home: the new arrival window', home.embarkation?.windowLabel === '15:30 – 16:00', home.embarkation?.windowLabel);
  const card = arrivalCard(live);
  check('card: the headline and six lines, with the times', card.headline === "We've adjusted your arrival arrangements." && card.lines.length === 6 && card.lines.map((l) => l.value ?? '').join() === '11:10,,,12:00,15:30,', card.lines);
  check('card: says the flight status is simulated', card.demoNote === 'Demonstration: this flight status is simulated. No flight-data service is connected.');
  const vm = buildArrivalModel(live);
  check('model: done and requested, in words', vm.steps.find((x) => x.kind === 'transfer-updated')?.status?.label === 'Done' && vm.alsoAffected[0]?.status.label === 'Requested' && vm.ambassador === 'Elena');

  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✘ Continuity: ${failures.length} failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`✔ Continuity: all ${passed} checks passed.`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
