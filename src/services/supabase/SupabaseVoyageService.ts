/**
 * Reservations, voyages, yachts, suites, embarkation, documents and flights
 * from Supabase. RLS limits every read to the caller's own party (or the
 * crew serving it), so the guest ID is a filter, not a permission.
 */
import type { Embarkation, FlightSegment, ID, JourneyPhase, Suite, TravelDocument, Voyage, VoyageOverview, VoyageReservation, Yacht } from '@/domain';
import type { VoyageService } from '@/services/contracts';
import { journeyPhase } from '@/services/shared/journeyPhase';
import {
  DOCUMENT_COLUMNS,
  EMBARKATION_COLUMNS,
  FLIGHT_COLUMNS,
  PORT_CALL_COLUMNS,
  RESERVATION_COLUMNS,
  SUITE_COLUMNS,
  VOYAGE_COLUMNS,
  YACHT_COLUMNS,
  toDocument,
  toEmbarkation,
  toFlight,
  toPortCall,
  toReservation,
  toSuite,
  toVoyage,
  toYacht,
  type DocumentRow,
  type EmbarkationRow,
  type FlightRow,
  type PortCallRow,
  type ReservationRow,
  type SuiteRow,
  type VoyageRow,
  type YachtRow,
} from './rows';
import { many, one, uuid, type SupabaseDeps } from './support';

const CLOSED: VoyageReservation['status'][] = ['completed', 'cancelled'];

export class SupabaseVoyageService implements VoyageService {
  constructor(private readonly deps: SupabaseDeps) {}

  private get db() {
    return this.deps.db();
  }

  private async partyReservations(guestId: ID): Promise<{ reservation: VoyageReservation; start: string; end: string }[]> {
    const id = uuid(guestId, 'Guest');
    const rows = await many<ReservationRow & { voyage: { start_date: string; end_date: string } | null }>(
      this.db.from('reservations').select(`${RESERVATION_COLUMNS}, voyage:voyages(start_date, end_date)`),
    );
    return rows
      .map((r) => ({ reservation: toReservation(r), start: r.voyage?.start_date ?? '', end: r.voyage?.end_date ?? '' }))
      .filter((r) => r.reservation.partyGuestIds.includes(id))
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  /** Current and upcoming reservations (past voyages: getPastVoyages). */
  async listReservations(guestId: ID) {
    return (await this.partyReservations(guestId)).filter((r) => !CLOSED.includes(r.reservation.status)).map((r) => r.reservation);
  }

  async getUpcomingReservation(guestId: ID) {
    const today = this.deps.clock.now().toISOString().slice(0, 10);
    const open = (await this.partyReservations(guestId)).filter((r) => !CLOSED.includes(r.reservation.status) && r.end >= today);
    return open[0]?.reservation ?? null;
  }

  async getPastVoyages(guestId: ID): Promise<Voyage[]> {
    const today = this.deps.clock.now().toISOString().slice(0, 10);
    const past = (await this.partyReservations(guestId)).filter((r) => r.reservation.status === 'completed' || (r.reservation.status !== 'cancelled' && r.end < today));
    return Promise.all(past.map((r) => this.getVoyage(r.reservation.voyageId)));
  }

  async getVoyage(voyageId: ID): Promise<Voyage> {
    const id = uuid(voyageId, 'Voyage');
    const [row, ports] = await Promise.all([
      one<VoyageRow>(this.db.from('voyages').select(VOYAGE_COLUMNS).eq('id', id).maybeSingle(), 'Voyage', id),
      many<PortCallRow>(this.db.from('port_calls_local').select(PORT_CALL_COLUMNS).eq('voyage_id', id).order('day')),
    ]);
    return toVoyage(row, ports.map(toPortCall));
  }

  async getYacht(yachtId: ID): Promise<Yacht> {
    const id = uuid(yachtId, 'Yacht');
    return toYacht(await one<YachtRow>(this.db.from('yachts').select(YACHT_COLUMNS).eq('id', id).maybeSingle(), 'Yacht', id));
  }

  async getSuite(suiteId: ID): Promise<Suite> {
    const id = uuid(suiteId, 'Suite');
    return toSuite(await one<SuiteRow>(this.db.from('suites').select(SUITE_COLUMNS).eq('id', id).maybeSingle(), 'Suite', id));
  }

  async getEmbarkation(reservationId: ID): Promise<Embarkation> {
    const id = uuid(reservationId, 'Embarkation');
    return toEmbarkation(await one<EmbarkationRow>(this.db.from('embarkations_local').select(EMBARKATION_COLUMNS).eq('reservation_id', id).maybeSingle(), 'Embarkation', id));
  }

  async getTravelDocuments(reservationId: ID): Promise<TravelDocument[]> {
    const rows = await many<DocumentRow>(this.db.from('travel_documents').select(DOCUMENT_COLUMNS).eq('reservation_id', uuid(reservationId, 'Reservation')).order('due_by', { nullsFirst: false }).order('label'));
    return rows.map(toDocument);
  }

  private async getFlights(reservationId: ID): Promise<FlightSegment[]> {
    const rows = await many<FlightRow>(this.db.from('flight_segments_local').select(FLIGHT_COLUMNS).eq('reservation_id', uuid(reservationId, 'Reservation')).order('departs_at'));
    return rows.map(toFlight);
  }

  private async getReservation(reservationId: ID): Promise<VoyageReservation> {
    const id = uuid(reservationId, 'Reservation');
    return toReservation(await one<ReservationRow>(this.db.from('reservations').select(RESERVATION_COLUMNS).eq('id', id).maybeSingle(), 'Reservation', id));
  }

  async getOverview(reservationId: ID): Promise<VoyageOverview> {
    const reservation = await this.getReservation(reservationId);
    const voyage = await this.getVoyage(reservation.voyageId);
    const [yacht, suite, embarkation, documents, flights] = await Promise.all([
      this.getYacht(voyage.yachtId),
      this.getSuite(reservation.suiteId),
      this.getEmbarkation(reservation.id),
      this.getTravelDocuments(reservation.id),
      this.getFlights(reservation.id),
    ]);
    return { reservation, voyage, yacht, suite, embarkation, documents, flights };
  }

  async getJourneyPhase(reservationId: ID, now: Date = this.deps.clock.now()): Promise<JourneyPhase> {
    const reservation = await this.getReservation(reservationId);
    const [embarkation, voyage] = await Promise.all([this.getEmbarkation(reservation.id), this.getVoyage(reservation.voyageId)]);
    return journeyPhase(embarkation, voyage, now);
  }
}
