import type { Embarkation, FlightSegment, ID, ISODateTime, JourneyPhase } from '@/domain';
import type { VoyageService } from '@/services/contracts';
import { journeyPhase } from '@/services/shared/journeyPhase';
import { data, failIf, latency, mockNow, notFound } from './support';

const { pastVoyages, reservation, suite, documents: travelDocuments, voyage, yacht } = data.voyage;

export class MockVoyageService implements VoyageService {
  // Copies: operator-side changes (a delayed flight, a moved arrival window) stay with this instance.
  private embarkation: Embarkation = structuredClone(data.voyage.embarkation);
  private flights: FlightSegment[] = structuredClone(data.voyage.flights);

  /**
   * Mock-only: what a flight-status source reports, recorded on the
   * flight (in production, the continuity pipeline updates flight_segments).
   */
  applyFlightStatus(flightId: ID, change: { status: FlightSegment['status']; estimatedArrival?: ISODateTime }) {
    const f = this.flights.find((x) => x.id === flightId) ?? notFound('Flight', flightId);
    Object.assign(f, change);
  }

  /** Mock-only: the embarkation team moves the arrival window (and luggage) for a late guest. */
  applyEmbarkationChange(reservationId: ID, change: { arrivalWindowStart: ISODateTime; arrivalWindowEnd: ISODateTime; luggageDeliveredBy?: ISODateTime; note?: string }) {
    if (reservationId !== reservation.id) notFound('Embarkation', reservationId);
    const e = this.embarkation;
    e.arrivalWindowStart = change.arrivalWindowStart;
    e.arrivalWindowEnd = change.arrivalWindowEnd;
    if (change.luggageDeliveredBy && e.luggage) e.luggage = { ...e.luggage, deliveredBy: change.luggageDeliveredBy };
    if (change.note && !e.notes.includes(change.note)) e.notes = [change.note, ...e.notes];
  }
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
    return reservationId === reservation.id ? latency(this.embarkation) : notFound('Embarkation', reservationId);
  }

  getTravelDocuments(_reservationId: ID) {
    return latency(travelDocuments);
  }

  async getOverview(reservationId: ID) {
    failIf('core', 'voyage overview');
    if (reservationId !== reservation.id) notFound('Reservation', reservationId);
    return latency({ reservation, voyage, yacht, suite, embarkation: this.embarkation, documents: travelDocuments, flights: this.flights });
  }

  async getJourneyPhase(_reservationId: ID, now: Date = mockNow()): Promise<JourneyPhase> {
    return journeyPhase(this.embarkation, voyage, now);
  }
}
