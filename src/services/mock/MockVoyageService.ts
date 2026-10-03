import type { ID, JourneyPhase } from '@/domain';
import type { VoyageService } from '@/services/contracts';
import { data, failIf, latency, mockNow, notFound } from './support';

const { embarkation, pastVoyages, reservation, suite, documents: travelDocuments, flights, voyage, yacht } = data.voyage;

const DAY = 86_400_000;

export class MockVoyageService implements VoyageService {
  listReservations(_guestId: ID) {
    return latency([reservation]);
  }

  getUpcomingReservation(_guestId: ID) {
    return latency(reservation);
  }

  getPastVoyages(_guestId: ID) {
    return latency(pastVoyages);
  }

  getVoyage(voyageId: ID) {
    const found = [voyage, ...pastVoyages].find((v) => v.id === voyageId);
    return found ? latency(found) : notFound('Voyage', voyageId);
  }

  getYacht(yachtId: ID) {
    return yachtId === yacht.id ? latency(yacht) : notFound('Yacht', yachtId);
  }

  getSuite(suiteId: ID) {
    return suiteId === suite.id ? latency(suite) : notFound('Suite', suiteId);
  }

  getEmbarkation(reservationId: ID) {
    return reservationId === reservation.id ? latency(embarkation) : notFound('Embarkation', reservationId);
  }

  getTravelDocuments(_reservationId: ID) {
    return latency(travelDocuments);
  }

  async getOverview(reservationId: ID) {
    failIf('core', 'voyage overview');
    if (reservationId !== reservation.id) notFound('Reservation', reservationId);
    return latency({ reservation, voyage, yacht, suite, embarkation, documents: travelDocuments, flights });
  }

  async getJourneyPhase(_reservationId: ID, now: Date = mockNow()): Promise<JourneyPhase> {
    const start = Date.parse(embarkation.arrivalWindowStart);
    // Journey ends once the guest has left the yacht on the final morning.
    const lastPort = voyage.itinerary[voyage.itinerary.length - 1];
    const end = Date.parse(lastPort?.arrival ?? `${voyage.endDate}T12:00:00Z`) + 6 * 3_600_000;
    const t = now.getTime();
    if (t < start - DAY) return 'prepare';
    if (t < start) return 'travel-to-embarkation';
    if (t < start + 6 * 3_600_000) return 'embark';
    if (t < end) return 'sail';
    if (t < end + 2 * DAY) return 'return-home';
    if (t < end + 60 * DAY) return 'remember';
    return 'rebook';
  }
}
