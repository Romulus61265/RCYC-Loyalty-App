/**
 * The continuity rules' context for one reservation, read through the other
 * services' contracts (the mock's demonstration pipeline uses it).
 */
import type { FlightStatusUpdate, ID } from '@/domain';
import type { Services } from '@/services/contracts';
import type { ArrivalContext } from '../../../supabase/functions/_shared/continuity/types';

export type ContinuityDeps = Pick<Services, 'profile' | 'loyalty' | 'voyage' | 'experience'>;

const same = (a: string, b: string) => a.replace(/\s/g, '') === b.replace(/\s/g, '');

export async function buildArrivalContext(s: ContinuityDeps, guestId: ID, reservationId: ID, update: FlightStatusUpdate, now: Date): Promise<ArrivalContext | null> {
  const overview = await s.voyage.getOverview(reservationId);
  const flight = overview.flights.find((f) => f.direction === 'inbound' && same(f.flightNumber, update.flightNumber) && f.departure.slice(0, 10) === update.departureDate);
  if (!flight) return null;
  const [profile, membership, bookings] = await Promise.all([s.profile.getProfile(guestId), s.loyalty.getMembership(guestId).catch(() => null), s.experience.listBookings(reservationId)]);
  const day = flight.arrival.slice(0, 10);
  const live = bookings.filter((b) => b.status !== 'cancelled' && b.status !== 'declined');
  const transfer = live.find((b) => b.category === 'transfer' && b.start.slice(0, 10) === day && Date.parse(b.start) >= Date.parse(flight.arrival) - 60 * 60_000);
  const enRoute = transfer?.end
    ? live.filter((b) => b.id !== transfer.id && Date.parse(b.start) >= Date.parse(transfer.start) && Date.parse(b.start) < Date.parse(transfer.end!))
    : [];
  const contact = overview.reservation.suiteAmbassadorContact;
  const ambassador = contact?.name ?? overview.reservation.suiteAmbassador ?? 'Your Suite Ambassador';
  const e = overview.embarkation;
  return {
    now: now.toISOString(),
    reservationId,
    guest: { firstName: profile.guest.preferredName ?? profile.guest.firstName, ...(membership ? { tier: membership.tierLabel } : {}), suiteName: `${overview.suite.name} ${overview.suite.number}` },
    ambassador: { firstName: ambassador.split(' ')[0] ?? ambassador, title: contact?.title ?? 'Suite Ambassador' },
    flight: { id: flight.id, flightNumber: flight.flightNumber, origin: flight.origin, destination: flight.destination, scheduledArrival: flight.arrival, trackedForTransfer: flight.trackedForTransfer },
    ...(transfer ? { transfer: { bookingId: transfer.id, title: transfer.title, venue: transfer.venue, start: transfer.start, ...(transfer.end ? { end: transfer.end } : {}) } } : {}),
    enRoute: enRoute.map((b) => ({ bookingId: b.id, title: b.title, start: b.start, ...(b.end ? { end: b.end } : {}) })),
    embarkation: {
      terminalName: e.terminalName,
      windowStart: e.arrivalWindowStart,
      windowEnd: e.arrivalWindowEnd,
      suiteReadyAt: e.suiteReadyAt,
      allAboard: e.allAboard,
      ...(e.luggage?.deliveredBy ? { luggageDeliveredBy: e.luggage.deliveredBy } : {}),
    },
  };
}
