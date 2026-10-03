/// <reference types="node" />
/**
 * Internal event model checks.  Run: `npm run check:events`
 *
 * The model (twelve types, the envelope, severities, the journey-event
 * vocabulary); InMemoryEventService (validation, ids and times, handler
 * order, statuses, isolation of failures, duplicates, follow-up events with
 * correlation and causation, the loop guard); and the demonstration: a
 * FLIGHT_DELAYED event running TravelDisruptionHandler, TransferService,
 * VoyageService, NotificationService and ConciergeService, end to end.
 */
import { devDataset as d, IDS } from '@/data/fixtures';
import { DEFAULT_SEVERITY, INTERNAL_EVENT_TYPES, JOURNEY_EVENT_TYPE, type InternalEvent, type NewInternalEvent } from '@/domain';
import { ServiceError, type EventHandler, type TransferService } from '@/services/contracts';
import { flightDelayedEvent, registerFlightDelayHandlers } from '@/services/events/flightDelay';
import { InMemoryEventService, MAX_DEPTH } from '@/services/events/InMemoryEventService';
import { MockConciergeService } from '@/services/mock/MockConciergeService';
import { MockContinuityService } from '@/services/mock/MockContinuityService';
import { MockExperienceService } from '@/services/mock/MockExperienceService';
import { MockLoyaltyService } from '@/services/mock/MockLoyaltyService';
import { MockGuestRecordSource, MockJourneyEventService, MockPersonalizationService } from '@/services/mock/MockMiscServices';
import { MockServiceRequestService } from '@/services/mock/MockServiceRequestService';
import { MockTransferService } from '@/services/mock/MockTransferService';
import { MockTravelDisruptionService } from '@/services/mock/MockTravelDisruptionService';
import { MockVoyageService } from '@/services/mock/MockVoyageService';
import { MockRequestStore } from '@/services/mock/requestStore';
import { ComposedNotificationService } from '@/services/notifications/ComposedNotificationService';
import { MemoryNotificationState } from '@/services/notifications/state';
import { RepositoryGuestProfileService } from '@/services/profile/RepositoryGuestProfileService';
import { MemoryKeyValueStore } from '@/services/repositories/KeyValueStore';
import { LocalPreferencesRepository } from '@/services/repositories/PreferencesRepository';

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : `\n    ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}`}`);
};
async function rejects(p: Promise<unknown>, code: string) {
  try {
    await p;
    return false;
  } catch (e) {
    return e instanceof ServiceError && e.code === code;
  }
}

const NOW = new Date('2027-05-15T07:30:00+02:00');
const clock = { now: () => NOW };
const R = IDS.reservation;
const G = IDS.guest;
const V = IDS.voyage;
const base = { guest_id: G, voyage_id: V, reservation_id: R, source: 'test' };
const requestCreated = (id = 'r1'): NewInternalEvent<'GUEST_REQUEST_CREATED'> => ({ ...base, event_type: 'GUEST_REQUEST_CREATED', payload: { request_id: id, category: 'suite', priority: 'routine' } });

const handler = (name: string, handles: EventHandler['handles'], fn: EventHandler['handle']): EventHandler => ({ name, handles, handle: fn });

/** The mock services and the bus, wired as the registry wires them. */
function world(opts: { transfers?: TransferService } = {}) {
  const profile = new RepositoryGuestProfileService(new MockGuestRecordSource(), new LocalPreferencesRepository(new MemoryKeyValueStore()));
  const voyage = new MockVoyageService();
  const experience = new MockExperienceService();
  const loyalty = new MockLoyaltyService();
  const personalization = new MockPersonalizationService({ profile, loyalty, voyage, experience });
  const requestStore = new MockRequestStore();
  const requests = new MockServiceRequestService({ store: requestStore, voyage });
  const journeyEvents = new MockJourneyEventService();
  const concierge = new MockConciergeService({ voyage, experience, loyalty, profile, personalization, requests: requestStore });
  const travel = new MockTravelDisruptionService(d.voyage.flights, clock);
  const continuity = new MockContinuityService({ profile, loyalty, voyage, experience, travel, clock }, { listen: false });
  const notifications = new ComposedNotificationService({ profile, voyage, experience, requests, journeyEvents, personalization, clock }, new MemoryNotificationState({}));
  const events = new InMemoryEventService(clock);
  registerFlightDelayHandlers(
    events,
    { voyage, continuity, transfers: opts.transfers ?? new MockTransferService(experience), outbox: journeyEvents, concierge, profile, ambassador: async () => ({ firstName: 'Elena', title: 'Suite Ambassador' }) },
    R,
  );
  const published: Promise<unknown>[] = [];
  travel.subscribe((u) => {
    const e = flightDelayedEvent(u, { guest_id: G, voyage_id: V, reservation_id: R });
    if (e) published.push(events.publish(e));
  });
  return { profile, voyage, experience, journeyEvents, concierge, travel, continuity, notifications, events, settled: () => Promise.all(published) };
}

async function main() {
  // ─── The model ───────────────────────────────────────────────────────────
  const WANTED = ['FLIGHT_DELAYED', 'TRANSFER_DELAYED', 'EMBARKATION_UPDATED', 'PORT_CHANGED', 'EXCURSION_CANCELLED', 'DINING_UPDATED', 'SPA_UPDATED', 'GUEST_REQUEST_CREATED', 'GUEST_REQUEST_RESOLVED', 'SPECIAL_OCCASION_DETECTED', 'LOYALTY_MILESTONE', 'SERVICE_FAILURE'];
  check('the twelve event types', JSON.stringify([...INTERNAL_EVENT_TYPES]) === JSON.stringify(WANTED));
  check('a default severity for each', WANTED.every((t) => ['info', 'notice', 'action', 'urgent'].includes(DEFAULT_SEVERITY[t as keyof typeof DEFAULT_SEVERITY])));
  check('each maps to the journey-event vocabulary, uniquely', new Set(WANTED.map((t) => JOURNEY_EVENT_TYPE[t as keyof typeof JOURNEY_EVENT_TYPE])).size === 12 && JOURNEY_EVENT_TYPE.FLIGHT_DELAYED === 'flight.delayed');

  // ─── The bus ─────────────────────────────────────────────────────────────
  const bus = new InMemoryEventService(clock);
  const nothing = await bus.publish(requestCreated());
  const e = nothing.event;
  check('envelope: every field', ['event_id', 'event_type', 'timestamp', 'guest_id', 'voyage_id', 'source', 'payload', 'severity', 'status'].every((k) => k in e) && /^evt_/.test(e.event_id), e);
  check('envelope: time from the clock, default severity, starts its own chain', e.timestamp === NOW.toISOString() && e.severity === 'info' && e.correlation_id === e.event_id && !e.causation_id);
  check('no handler: unhandled', e.status === 'unhandled' && nothing.runs.length === 0);
  check('invalid: unknown type', await rejects(bus.publish({ ...requestCreated(), event_type: 'NOPE' } as never), 'validation'));
  check('invalid: no guest', await rejects(bus.publish({ ...requestCreated(), guest_id: '' }), 'validation'));
  check('invalid: a bad timestamp', await rejects(bus.publish({ ...requestCreated(), timestamp: 'soon' }), 'validation'));

  const order: string[] = [];
  bus.register(handler('A', ['GUEST_REQUEST_CREATED'], async () => (order.push('A'), { outcome: 'done' })));
  const offB = bus.register(handler('B', ['GUEST_REQUEST_CREATED', 'GUEST_REQUEST_RESOLVED'], async () => (order.push('B'), { outcome: 'requested', detail: 'asked' })));
  check('a handler name is registered once', (() => {
    try {
      bus.register(handler('A', ['SPA_UPDATED'], async () => ({ outcome: 'done' })));
      return false;
    } catch (x) {
      return x instanceof ServiceError && x.code === 'conflict';
    }
  })());
  const two = await bus.publish(requestCreated('r2'));
  check('handlers run in registration order; handled', order.join() === 'A,B' && two.event.status === 'handled' && two.runs.map((r) => `${r.handler}:${r.outcome}`).join() === 'A:done,B:requested', two.runs);
  check('only handlers for the type run', (await bus.publish({ ...base, event_type: 'GUEST_REQUEST_RESOLVED', payload: { request_id: 'r2' } })).runs.map((r) => r.handler).join() === 'B');
  offB();
  bus.register(handler('Boom', ['GUEST_REQUEST_CREATED'], async () => {
    throw new Error('down');
  }));
  order.length = 0;
  const partial = await bus.publish(requestCreated('r3'));
  check('one handler fails: the others still run; partially handled', order.join() === 'A' && partial.event.status === 'partially_handled' && partial.runs.find((r) => r.handler === 'Boom')?.outcome === 'failed' && partial.runs.find((r) => r.handler === 'Boom')?.detail === 'down', partial.runs);
  const lone = new InMemoryEventService(clock);
  lone.register(handler('Boom', ['SPA_UPDATED'], async () => Promise.reject(new Error('x'))));
  check('every handler fails: failed', (await lone.publish({ ...base, event_type: 'SPA_UPDATED', payload: { booking_id: 'b', change: 'moved' } })).event.status === 'failed');

  const dd = { ...requestCreated('r4'), dedupe_key: 'request:r4' };
  const firstPub = await bus.publish(dd);
  const again = await bus.publish(dd);
  check('the same dedupe key: one event, nothing runs again', again.duplicate && again.event.event_id === firstPub.event.event_id && (await bus.list({ event_type: 'GUEST_REQUEST_CREATED' })).filter((x) => x.dedupe_key === 'request:r4').length === 1);

  const chain = new InMemoryEventService(clock);
  chain.register(handler('Opener', ['SERVICE_FAILURE'], async (ev, ctx) => {
    await ctx.emit({ ...base, event_type: 'GUEST_REQUEST_CREATED', payload: { request_id: `for:${ev.event_id}`, category: 'concierge', priority: 'priority' } });
    return { outcome: 'done' };
  }));
  chain.register(handler('Ack', ['GUEST_REQUEST_CREATED'], async () => ({ outcome: 'done' })));
  const root = await chain.publish({ ...base, event_type: 'SERVICE_FAILURE', payload: { kind: 'missed-service' } });
  const [child] = await chain.list({ event_type: 'GUEST_REQUEST_CREATED' });
  check('follow-up events: caused by the first, in its chain, processed before emit returns', child?.causation_id === root.event.event_id && child.correlation_id === root.event.event_id && child.status === 'handled' && root.runs[0]?.emitted[0] === child.event_id, { root, child });
  check('list by chain', (await chain.list({ correlation_id: root.event.event_id })).length === 2);
  check('SERVICE_FAILURE defaults to action severity', root.event.severity === 'action');
  const loop = new InMemoryEventService(clock);
  loop.register(handler('Loop', ['SERVICE_FAILURE'], async (_ev, ctx) => {
    await ctx.emit({ ...base, event_type: 'SERVICE_FAILURE', payload: { kind: 'again' } });
    return { outcome: 'done' };
  }));
  const looped = await loop.publish({ ...base, event_type: 'SERVICE_FAILURE', payload: { kind: 'start' } });
  check(`a loop stops at depth ${MAX_DEPTH}, recorded as a failure`, (await loop.list()).length === MAX_DEPTH + 1 && looped.event.status === 'handled' && (await loop.list()).some((x) => x.status === 'failed'), (await loop.list()).map((x) => x.status));
  const heard: string[] = [];
  const offL = bus.subscribe((x) => heard.push(x.event_type));
  await bus.publish(requestCreated('r5'));
  offL();
  await bus.publish(requestCreated('r6'));
  check('subscribers hear each processed event', heard.join() === 'GUEST_REQUEST_CREATED');
  check('runs are kept per event', (await bus.runs(two.event.event_id)).length === 2 && (await bus.get('nope')) === null);

  // ─── The demonstration: FLIGHT_DELAYED ───────────────────────────────────
  const w = world();
  const inboxBefore = (await w.notifications.list(G, R)).length;
  w.travel.simulateDelay('dev_flt_in', 120);
  await w.settled();
  const flight = (await w.events.list({ event_type: 'FLIGHT_DELAYED' }))[0] as InternalEvent<'FLIGHT_DELAYED'> | undefined;
  check('FLIGHT_DELAYED: published from the (mock) flight-status source', flight?.source === 'mock-flight-status' && flight.payload.delay_minutes === 120 && flight.payload.estimated_arrival === '2027-05-15T11:10:00+02:00' && flight.payload.simulated && flight.guest_id === G && flight.voyage_id === V, flight);
  const runs = await w.events.runs(flight!.event_id);
  check('FLIGHT_DELAYED: handled by Voyage, TravelDisruption, Notification, Concierge, in that order', runs.map((r) => `${r.handler}:${r.outcome}`).join() === 'VoyageEventHandler:done,TravelDisruptionHandler:done,NotificationEventHandler:done,ConciergeEventHandler:done' && flight!.status === 'handled', runs);
  const travelRun = runs.find((r) => r.handler === 'TravelDisruptionHandler')!;
  check('TravelDisruptionHandler: the adjusted headline', travelRun.detail === "We've adjusted your arrival arrangements.");
  const transfer = (await w.events.list({ event_type: 'TRANSFER_DELAYED' }))[0] as InternalEvent<'TRANSFER_DELAYED'> | undefined;
  const embark = (await w.events.list({ event_type: 'EMBARKATION_UPDATED' }))[0] as InternalEvent<'EMBARKATION_UPDATED'> | undefined;
  check('…which published TRANSFER_DELAYED and EMBARKATION_UPDATED, caused by it, in its chain', travelRun.emitted.length === 2 && transfer?.causation_id === flight!.event_id && embark?.causation_id === flight!.event_id && transfer.correlation_id === flight!.event_id && embark.correlation_id === flight!.event_id);
  check('TRANSFER_DELAYED: 10:00 → 12:00', transfer?.payload.previous_start === '2027-05-15T10:00:00+02:00' && transfer.payload.new_start === '2027-05-15T12:00:00+02:00' && transfer.source === 'TravelDisruptionHandler');
  check('TransferService (TransferEventHandler) carried it out', (await w.events.runs(transfer!.event_id)).map((r) => `${r.handler}:${r.outcome}`).join() === 'TransferEventHandler:done' && transfer!.status === 'handled');
  check('VoyageService (VoyageEventHandler) moved the window', (await w.events.runs(embark!.event_id)).map((r) => `${r.handler}:${r.outcome}`).join() === 'VoyageEventHandler:done' && embark!.payload.window_start === '2027-05-15T15:30:00+02:00');

  const overview = await w.voyage.getOverview(R);
  const inbound = overview.flights.find((f) => f.direction === 'inbound')!;
  check('effect · voyage: the flight carries its estimate', inbound.status === 'delayed' && inbound.estimatedArrival === '2027-05-15T11:10:00+02:00');
  check('effect · voyage: the window is 15:30–16:00, luggage by 17:30', overview.embarkation.arrivalWindowStart === '2027-05-15T15:30:00+02:00' && overview.embarkation.arrivalWindowEnd === '2027-05-15T16:00:00+02:00' && overview.embarkation.luggage?.deliveredBy === '2027-05-15T17:30:00+02:00');
  const bookings = await w.experience.listBookings(R);
  check('effect · transfer: re-timed to 12:00 and confirmed', bookings.find((b) => b.id === 'dev_bkg_transfer_bcn')?.start === '2027-05-15T12:00:00+02:00' && bookings.find((b) => b.id === 'dev_bkg_transfer_bcn')?.status === 'confirmed');
  check('effect · the visit en route: a change request', bookings.find((b) => b.id === 'dev_bkg_sagrada')?.start === '2027-05-15T12:45:00+02:00' && bookings.find((b) => b.id === 'dev_bkg_sagrada')?.status === 'in_progress');
  check('effect · continuity: the guest’s arrival update', (await w.continuity.getArrivalUpdate(R))?.headline === "We've adjusted your arrival arrangements.");
  const inbox = await w.notifications.list(G, R);
  const told = inbox.find((n) => n.title === "We've adjusted your arrival arrangements.");
  check('effect · notifications: one message in the inbox, opening /arrival', inbox.length === inboxBefore + 1 && told?.deepLink === '/arrival' && told.type === 'itinerary-change' && !told.read, told);
  const { messages } = await w.concierge.openConversation(R);
  const elena = messages.at(-1);
  check('effect · concierge: Elena writes in the thread', elena?.author === 'human' && elena.authorName === 'Elena, Suite Ambassador' && elena.body === 'Alexander, I’m following AA 7412: it now lands at 11:10. Your driver will meet you at 12:00. We expect you at the yacht by about 15:30. The Sagrada Família, privately: we have asked to move it to 12:45, after you land. The team will confirm. If you would rather change anything, just tell me here.', elena?.body);

  // The source repeats itself: nothing happens twice.
  w.travel.simulateDelay('dev_flt_in', 120);
  await w.settled();
  check('the same delay again: one FLIGHT_DELAYED, one message, one concierge note', (await w.events.list({ event_type: 'FLIGHT_DELAYED' })).length === 1 && (await w.notifications.list(G, R)).length === inboxBefore + 1 && (await w.concierge.openConversation(R)).messages.length === messages.length);

  // A transfer operator that is down: the rest still happens, and nobody is told it is done.
  const broken = world({ transfers: { retime: () => Promise.reject(new Error('operator unreachable')) } });
  broken.travel.simulateDelay('dev_flt_in', 120);
  await broken.settled();
  const [bf] = await broken.events.list({ event_type: 'FLIGHT_DELAYED' });
  const [bt] = await broken.events.list({ event_type: 'TRANSFER_DELAYED' });
  const bruns = await broken.events.runs(bf!.event_id);
  check('transfer down: TRANSFER_DELAYED failed', bt?.status === 'failed' && (await broken.events.runs(bt.event_id))[0]?.detail === 'operator unreachable');
  check('transfer down: the delay is still handled, as requested', bf?.status === 'handled' && bruns.find((r) => r.handler === 'TravelDisruptionHandler')?.outcome === 'requested', bruns);
  const bu = await broken.continuity.getArrivalUpdate(R);
  check('transfer down: the guest reads "We’re adjusting", and Elena arranging it', bu?.headline === "We're adjusting your arrival arrangements." && /Elena is arranging your driver for 12:00 personally/.test(bu.steps.find((s) => s.kind === 'transfer-updated')?.detail ?? ''));
  check('transfer down: the window still moved, the message still sent', (await broken.voyage.getOverview(R)).embarkation.arrivalWindowStart === '2027-05-15T15:30:00+02:00' && (await broken.notifications.list(G, R)).some((n) => n.title === "We're adjusting your arrival arrangements."));
  const bmsg = (await broken.concierge.openConversation(R)).messages.at(-1)?.body ?? '';
  check('transfer down: Elena says she has asked, not that it is done', /I have asked for your driver to meet you at 12:00, and will confirm\./.test(bmsg), bmsg);

  // Not a delay: nothing published.
  check('a scheduled observation is not an event', flightDelayedEvent({ ...(await w.travel.getFlightStatus('AA 7419', '2027-05-22'))! }, { guest_id: G, voyage_id: V, reservation_id: R }) === null);

  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\n✘ Events: ${failures.length} failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`✔ Events: all ${passed} checks passed.`);
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
