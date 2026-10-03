/**
 * FLIGHT_DELAYED → the continuity rules decide what moves. The handler
 * reaches each team by publishing a follow-up event and reading how that
 * team's handler answered:
 *
 *   transfer     → TRANSFER_DELAYED     (TransferEventHandler)
 *   embarkation  → EMBARKATION_UPDATED  (VoyageEventHandler)
 *
 * Visits on the way are asked to move directly (a change request to the
 * venue). The guest's arrival update is saved for ContinuityService.
 */
import type { HandlerRun, InternalEvent } from '@/domain';
import type { EventHandler, HandlerContext, HandlerResult } from '@/services/contracts';
import { hhmm } from '../../../../supabase/functions/_shared/continuity/engine';
import type { ContinuityResult } from '../../../../supabase/functions/_shared/continuity/orchestrator';
import type { ActionOutcome, FlightStatusUpdate } from '../../../../supabase/functions/_shared/continuity/types';
import type { IngestOptions } from '../../mock/MockContinuityService';

export interface ContinuityPipeline {
  ingest(update: FlightStatusUpdate, opts: IngestOptions): Promise<ContinuityResult[]>;
}

/** How a team's handler answered, in the orchestrator's terms. */
function outcomeOf(runs: HandlerRun[], handler: string, done: ActionOutcome): ActionOutcome {
  const run = runs.find((r) => r.handler === handler);
  if (!run || run.outcome === 'failed') throw new Error(`${handler}: ${run?.detail ?? 'no handler'}`);
  return run.outcome === 'done' ? done : 'requested';
}

export class TravelDisruptionHandler implements EventHandler<'FLIGHT_DELAYED'> {
  readonly name = 'TravelDisruptionHandler';
  readonly handles = ['FLIGHT_DELAYED'] as const;

  constructor(private readonly continuity: ContinuityPipeline) {}

  async handle(event: InternalEvent<'FLIGHT_DELAYED'>, ctx: HandlerContext): Promise<HandlerResult> {
    const p = event.payload;
    const update: FlightStatusUpdate = {
      observationId: p.observation_id,
      flightNumber: p.flight_number,
      departureDate: p.departure_date,
      status: 'delayed',
      scheduledArrival: p.scheduled_arrival,
      estimatedArrival: p.estimated_arrival,
      observedAt: event.timestamp,
      source: event.source,
      simulated: p.simulated,
    };
    const envelope = { guest_id: event.guest_id, voyage_id: event.voyage_id, ...(event.reservation_id ? { reservation_id: event.reservation_id } : {}), source: this.name };
    const why = `${p.flight_number} now lands ${hhmm(p.estimated_arrival)}`;
    const results = await this.continuity.ingest(update, {
      recordFlight: false, // VoyageEventHandler has recorded it
      teams: {
        retimeTransfer: async (a, c) => {
          const r = await ctx.emit({
            ...envelope,
            event_type: 'TRANSFER_DELAYED',
            payload: { booking_id: a.bookingId, previous_start: c.transfer?.start ?? a.start, new_start: a.start, ...(a.end ? { new_end: a.end } : {}), reason: `Re-timed for your flight: ${why}; your driver meets you at ${hhmm(a.start)} and is following the flight.` },
            dedupe_key: `${event.event_id}:transfer:${a.bookingId}`,
          });
          return outcomeOf(r.runs, 'TransferEventHandler', 'confirmed');
        },
        notifyEmbarkation: async (a) => {
          const r = await ctx.emit({
            ...envelope,
            event_type: 'EMBARKATION_UPDATED',
            payload: { window_start: a.windowStart, window_end: a.windowEnd, ...(a.luggageDeliveredBy ? { luggage_delivered_by: a.luggageDeliveredBy } : {}), reason: `Your flight is running late: the embarkation team now expects you between ${hhmm(a.windowStart)} and ${hhmm(a.windowEnd)}.` },
            dedupe_key: `${event.event_id}:embarkation`,
          });
          return outcomeOf(r.runs, 'VoyageEventHandler', 'notified');
        },
      },
    });
    const mine = results.find((r) => !event.reservation_id || r.reservationId === event.reservation_id);
    if (!mine || mine.status === 'ignored') return { outcome: 'skipped', detail: 'Not a flight on this reservation' };
    if (mine.status === 'duplicate') return { outcome: 'skipped', detail: 'Already adjusted for this estimate' };
    // The arrival arrangements (transfer, embarkation) decide; plans en route are requests by nature.
    const pending = (mine.update?.steps ?? []).some((s) => (s.kind === 'transfer-updated' || s.kind === 'embarkation-notified') && s.state === 'pending');
    return { outcome: pending ? 'requested' : 'done', detail: mine.update?.headline };
  }
}
