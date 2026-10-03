/**
 * Journey phase from the embarkation window and the final port call.
 * Shared by every VoyageService implementation so the phase never depends
 * on which backend is connected.
 */
import type { Embarkation, JourneyPhase, Voyage } from '@/domain';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function journeyPhase(embarkation: Pick<Embarkation, 'arrivalWindowStart'>, voyage: Pick<Voyage, 'itinerary' | 'endDate'>, now: Date): JourneyPhase {
  const start = Date.parse(embarkation.arrivalWindowStart);
  // The journey ends once the guest has left the yacht on the final morning.
  const lastPort = voyage.itinerary[voyage.itinerary.length - 1];
  const end = Date.parse(lastPort?.arrival ?? `${voyage.endDate}T12:00:00Z`) + 6 * HOUR;
  const t = now.getTime();
  if (t < start - DAY) return 'prepare';
  if (t < start) return 'travel-to-embarkation';
  if (t < start + 6 * HOUR) return 'embark';
  if (t < end) return 'sail';
  if (t < end + 2 * DAY) return 'return-home';
  if (t < end + 60 * DAY) return 'remember';
  return 'rebook';
}
