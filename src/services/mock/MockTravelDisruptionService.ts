/**
 * MockTravelDisruptionService: a stand-in flight-status source.
 *
 * No flight-status integration exists. This mock knows the fictional
 * dataset's flights and reports them on schedule until told otherwise:
 * `simulateDelay` emits the observation a real feed would send. Every
 * observation it produces is marked `simulated`, and the app says so.
 */
import type { FlightSegment, FlightStatusUpdate, ID } from '@/domain';
import type { TravelDisruptionService, Unsubscribe } from '@/services/contracts';
import { shift } from '../../../supabase/functions/_shared/continuity/engine';
import { data, latency, mockEventTime, notFound } from './support';

export const MOCK_FLIGHT_SOURCE = 'mock-flight-status';

let seq = 0;

export class MockTravelDisruptionService implements TravelDisruptionService {
  private readonly listeners = new Set<(u: FlightStatusUpdate) => void>();
  private readonly latest = new Map<string, FlightStatusUpdate>();

  constructor(
    private readonly flights: FlightSegment[] = data.voyage.flights,
    private readonly clock: { now: () => Date } = { now: mockEventTime },
  ) {}

  private key(flightNumber: string, date: string) {
    return `${flightNumber.replace(/\s/g, '')}@${date}`;
  }

  getFlightStatus(flightNumber: string, departureDate: string): Promise<FlightStatusUpdate | null> {
    const f = this.flights.find((x) => x.flightNumber.replace(/\s/g, '') === flightNumber.replace(/\s/g, '') && x.departure.slice(0, 10) === departureDate);
    if (!f) return latency(null);
    return latency(this.latest.get(this.key(f.flightNumber, departureDate)) ?? this.observation(f, 'scheduled'));
  }

  subscribe(listener: (u: FlightStatusUpdate) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private observation(f: FlightSegment, status: FlightStatusUpdate['status'], estimatedArrival?: string): FlightStatusUpdate {
    seq += 1;
    return {
      observationId: `mockobs_${seq}`,
      flightNumber: f.flightNumber,
      departureDate: f.departure.slice(0, 10),
      status,
      scheduledArrival: f.arrival,
      ...(estimatedArrival ? { estimatedArrival } : {}),
      observedAt: this.clock.now().toISOString(),
      source: MOCK_FLIGHT_SOURCE,
      simulated: true,
    };
  }

  /** Demonstration: the flight is now expected `minutes` late. Emits once to every listener. */
  simulateDelay(flightId: ID, minutes: number): FlightStatusUpdate {
    const f = this.flights.find((x) => x.id === flightId) ?? notFound('Flight', flightId);
    const update = this.observation(f, 'delayed', shift(f.arrival, minutes));
    this.latest.set(this.key(f.flightNumber, update.departureDate), update);
    for (const l of this.listeners) l(update);
    return update;
  }
}
