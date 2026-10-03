/**
 * The delayed-flight wiring: from a flight-status observation to a
 * FLIGHT_DELAYED event, and the handlers that react to it, in order.
 *
 *   TravelDisruptionService ──▶ FLIGHT_DELAYED
 *     1. VoyageEventHandler        the flight carries its new estimate
 *     2. TravelDisruptionHandler   the rules decide what moves
 *          ├─▶ TRANSFER_DELAYED    → TransferEventHandler (TransferService)
 *          └─▶ EMBARKATION_UPDATED → VoyageEventHandler (VoyageService)
 *     3. NotificationEventHandler  "We've adjusted your arrival arrangements." (NotificationService)
 *     4. ConciergeEventHandler     the Suite Ambassador writes in the thread (ConciergeService)
 */
import type { FlightStatusUpdate, ID, NewInternalEvent } from '@/domain';
import type { ContinuityService, EventService, GuestProfileService, TransferService, Unsubscribe } from '@/services/contracts';
import { ConciergeEventHandler, type ConciergeBriefing } from './handlers/ConciergeEventHandler';
import { NotificationEventHandler, type NotificationOutbox } from './handlers/NotificationEventHandler';
import { TransferEventHandler } from './handlers/TransferEventHandler';
import { TravelDisruptionHandler, type ContinuityPipeline } from './handlers/TravelDisruptionHandler';
import { VoyageEventHandler, type VoyageUpdates } from './handlers/VoyageEventHandler';

/** A delay observation as an event for one reservation (null for anything that is not a delay). */
export function flightDelayedEvent(update: FlightStatusUpdate, who: { guest_id: ID; voyage_id: ID; reservation_id: ID }): NewInternalEvent<'FLIGHT_DELAYED'> | null {
  if (update.status !== 'delayed' || !update.estimatedArrival) return null;
  return {
    event_type: 'FLIGHT_DELAYED',
    ...who,
    source: update.source,
    timestamp: update.observedAt,
    payload: {
      flight_number: update.flightNumber,
      departure_date: update.departureDate,
      scheduled_arrival: update.scheduledArrival,
      estimated_arrival: update.estimatedArrival,
      delay_minutes: Math.round((Date.parse(update.estimatedArrival) - Date.parse(update.scheduledArrival)) / 60_000),
      observation_id: update.observationId,
      simulated: update.simulated,
    },
    // The same estimate for the same flight is one event, however often the source repeats it.
    dedupe_key: `FLIGHT_DELAYED:${who.reservation_id}:${update.flightNumber.replace(/\s/g, '')}:${update.estimatedArrival}`,
  };
}

export interface FlightDelayDeps {
  voyage: VoyageUpdates;
  continuity: ContinuityPipeline & Pick<ContinuityService, 'getArrivalUpdate'>;
  transfers: TransferService;
  outbox: NotificationOutbox;
  concierge: ConciergeBriefing;
  profile: Pick<GuestProfileService, 'getProfile'>;
  ambassador: (reservationId: ID) => Promise<{ firstName: string; title: string }>;
}

export function registerFlightDelayHandlers(events: EventService, d: FlightDelayDeps, reservationId: ID): Unsubscribe {
  const offs = [
    events.register(new VoyageEventHandler(d.voyage)),
    events.register(new TravelDisruptionHandler(d.continuity)),
    events.register(new TransferEventHandler(d.transfers)),
    events.register(new NotificationEventHandler(d.continuity, d.outbox)),
    events.register(new ConciergeEventHandler(d.continuity, d.concierge, { profile: d.profile, ambassador: () => d.ambassador(reservationId) })),
  ];
  return () => offs.forEach((off) => off());
}
