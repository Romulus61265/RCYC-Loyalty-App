/**
 * The continuity pipeline in the mock: stands in for the server.
 *
 * It listens to MockTravelDisruptionService and runs the shared orchestrator
 * (the same code the Edge Function runs) with mock ports for each team:
 *
 *   transfer operator  → MockExperienceService.applyOperatorChange (confirms)
 *   venue en route     → ExperienceService.requestChange (requested; the team confirms)
 *   embarkation team   → MockVoyageService.applyEmbarkationChange (notified)
 *   crew               → logged
 *
 * None of these is an integration with a real supplier or system.
 */
import type { ArrivalUpdate, ContinuityEvent, FlightStatusUpdate, ID } from '@/domain';
import type { ContinuityService, Services, Unsubscribe } from '@/services/contracts';
import { logger } from '@/core/logging';
import { hhmm } from '../../../supabase/functions/_shared/continuity/engine';
import { handleFlightUpdate, type ContinuityPorts, type ContinuityResult } from '../../../supabase/functions/_shared/continuity/orchestrator';
import { buildArrivalContext } from '../continuity/buildArrivalContext';
import type { MockExperienceService } from './MockExperienceService';
import type { MockTravelDisruptionService } from './MockTravelDisruptionService';
import type { MockVoyageService } from './MockVoyageService';
import { data, latency } from './support';

interface Deps extends Pick<Services, 'profile' | 'loyalty' | 'clock'> {
  voyage: MockVoyageService;
  experience: MockExperienceService;
  travel: MockTravelDisruptionService;
}

let seq = 0;
const log = logger.child('continuity');

export class MockContinuityService implements ContinuityService {
  private updates: ArrivalUpdate[] = [];
  /** Every event the pipeline published, oldest first (the crew console would read these). */
  readonly events: ContinuityEvent[] = [];
  private readonly listeners = new Set<{ reservationId: ID; fn: () => void }>();
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly s: Deps) {
    s.travel.subscribe((u) => {
      // One observation at a time, in order.
      this.pending = this.pending.then(() => this.ingest(u)).catch((e: unknown) => log.warn('continuity failed', { reason: e instanceof Error ? e.message : 'unknown' }));
    });
  }

  /** Waits for observations already received (tests, and the demo). */
  settled(): Promise<unknown> {
    return this.pending;
  }

  async ingest(update: FlightStatusUpdate): Promise<ContinuityResult[]> {
    const { voyage, experience } = this.s;
    // The flight record learns the new estimate first.
    const flight = data.voyage.flights.find((f) => f.flightNumber === update.flightNumber && f.departure.slice(0, 10) === update.departureDate);
    if (flight && (update.status === 'delayed' || update.status === 'cancelled')) {
      voyage.applyFlightStatus(flight.id, { status: update.status, ...(update.estimatedArrival ? { estimatedArrival: update.estimatedArrival } : {}) });
    }
    const ports: ContinuityPorts = {
      find: async (key) => this.updates.find((u) => u.key === key) ?? null,
      contexts: async (u, now) => {
        const r = data.voyage.reservation;
        const ctx = await buildArrivalContext(this.s, r.leadGuestId, r.id, u, now);
        return ctx ? [ctx] : [];
      },
      transfer: {
        retime: async (a) => {
          await experience.applyOperatorChange(a.bookingId, { start: a.start, ...(a.end ? { end: a.end } : {}), note: `Re-timed for your flight: your driver meets you at ${hhmm(a.start)} and is following the flight.` });
          return 'confirmed';
        },
      },
      experiences: {
        requestChange: async (a) => {
          await experience.requestChange(a.bookingId, { start: a.start, note: `Moved with your delayed flight; the team will confirm ${hhmm(a.start)}.` });
          return 'requested';
        },
      },
      embarkation: {
        notify: async (a, ctx) => {
          voyage.applyEmbarkationChange(ctx.reservationId, {
            arrivalWindowStart: a.windowStart,
            arrivalWindowEnd: a.windowEnd,
            ...(a.luggageDeliveredBy ? { luggageDeliveredBy: a.luggageDeliveredBy } : {}),
            note: `Your flight is running late: the embarkation team now expects you between ${hhmm(a.windowStart)} and ${hhmm(a.windowEnd)}.`,
          });
          return 'notified';
        },
      },
      crew: {
        alert: async (a) => {
          log.info('crew alert', { reason: a.reason });
          return 'notified';
        },
      },
      publish: async (events) => {
        this.events.push(...events);
      },
      save: async (u) => {
        seq += 1;
        const saved = { ...u, id: `arr_${seq}` };
        this.updates.push(saved);
        return saved;
      },
      audit: async (entry) => log.info(entry.action, entry.metadata),
    };
    const results = await handleFlightUpdate(ports, update, { now: this.s.clock.now() });
    for (const r of results) if (r.status === 'adjusted' || r.status === 'minor') this.notify(r.reservationId);
    return results;
  }

  private notify(reservationId: ID) {
    for (const l of this.listeners) if (l.reservationId === reservationId) l.fn();
  }

  getArrivalUpdate(reservationId: ID): Promise<ArrivalUpdate | null> {
    const latest = [...this.updates].reverse().find((u) => u.reservationId === reservationId) ?? null;
    return latency(latest, 120);
  }

  subscribe(reservationId: ID, listener: () => void): Unsubscribe {
    const l = { reservationId, fn: listener };
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
