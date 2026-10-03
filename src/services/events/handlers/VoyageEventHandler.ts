/**
 * The voyage record follows the journey:
 *   FLIGHT_DELAYED       → the flight carries its new estimate
 *   EMBARKATION_UPDATED  → the arrival window (and luggage time) move, with a note
 * Registered before the other FLIGHT_DELAYED handlers, so they read the new estimate.
 */
import type { Embarkation, FlightSegment, ID, InternalEvent, ISODateTime } from '@/domain';
import type { EventHandler, HandlerResult, VoyageService } from '@/services/contracts';

/** The voyage record's write side (MockVoyageService in the mock; flight_segments and embarkations on the server). */
export interface VoyageUpdates extends Pick<VoyageService, 'getOverview'> {
  applyFlightStatus(flightId: ID, change: { status: FlightSegment['status']; estimatedArrival?: ISODateTime }): void;
  applyEmbarkationChange(reservationId: ID, change: { arrivalWindowStart: ISODateTime; arrivalWindowEnd: ISODateTime; luggageDeliveredBy?: ISODateTime; note?: string }): void;
}

const same = (a: string, b: string) => a.replace(/\s/g, '') === b.replace(/\s/g, '');

export class VoyageEventHandler implements EventHandler<'FLIGHT_DELAYED' | 'EMBARKATION_UPDATED'> {
  readonly name = 'VoyageEventHandler';
  readonly handles = ['FLIGHT_DELAYED', 'EMBARKATION_UPDATED'] as const;

  constructor(private readonly voyage: VoyageUpdates) {}

  async handle(event: InternalEvent<'FLIGHT_DELAYED' | 'EMBARKATION_UPDATED'>): Promise<HandlerResult> {
    if (!event.reservation_id) return { outcome: 'skipped', detail: 'No reservation' };
    if (event.event_type === 'FLIGHT_DELAYED') {
      const p = (event as InternalEvent<'FLIGHT_DELAYED'>).payload;
      const { flights } = await this.voyage.getOverview(event.reservation_id);
      const f = flights.find((x) => same(x.flightNumber, p.flight_number) && x.departure.slice(0, 10) === p.departure_date);
      if (!f) return { outcome: 'skipped', detail: 'Flight not on this reservation' };
      this.voyage.applyFlightStatus(f.id, { status: 'delayed', estimatedArrival: p.estimated_arrival });
      return { outcome: 'done', detail: `${f.flightNumber} now ${p.estimated_arrival.slice(11, 16)}` };
    }
    const p = (event as InternalEvent<'EMBARKATION_UPDATED'>).payload;
    this.voyage.applyEmbarkationChange(event.reservation_id, {
      arrivalWindowStart: p.window_start,
      arrivalWindowEnd: p.window_end,
      ...(p.luggage_delivered_by ? { luggageDeliveredBy: p.luggage_delivered_by } : {}),
      note: p.reason,
    } satisfies Partial<Embarkation> & { note: string });
    return { outcome: 'done', detail: `Window ${p.window_start.slice(11, 16)}–${p.window_end.slice(11, 16)}` };
  }
}
