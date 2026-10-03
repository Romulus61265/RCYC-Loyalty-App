import type { ID, JourneyPhase } from '@/domain';
import type { VoyageService } from '@/services/contracts';
import { journeyPhase } from '@/services/shared/journeyPhase';
import { data, failIf, latency, mockNow, notFound } from './support';

const { embarkation, pastVoyages, reservation, suite, documents: travelDocuments, flights, voyage, yacht } = data.voyage;

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
    return journeyPhase(embarkation, voyage, now);
  }
}
