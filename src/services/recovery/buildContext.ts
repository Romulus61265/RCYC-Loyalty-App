/**
 * The recovery engine's context, read through the other services'
 * contracts, so mock and Supabase modes plan from what the guest's own app
 * shows (and the server, reading the same views, records the same plan).
 */
import type { ID } from '@/domain';
import type { Services } from '@/services/contracts';
import { voyageNow } from '../../../supabase/functions/_shared/recovery/engine';
import type { RecoveryContext } from '../../../supabase/functions/_shared/recovery/types';

export type RecoveryDeps = Pick<Services, 'profile' | 'loyalty' | 'voyage' | 'experience' | 'requests' | 'clock'>;

export async function buildRecoveryContext(s: RecoveryDeps, guestId: ID, reservationId: ID, priorRecoveries: number): Promise<RecoveryContext> {
  const overview = await s.voyage.getOverview(reservationId);
  const voyageId = overview.voyage.id;
  const [profile, membership, catalogue, availability, bookings, active, history] = await Promise.all([
    s.profile.getProfile(guestId),
    s.loyalty.getMembership(guestId).catch(() => null),
    s.experience.listCatalogue(voyageId),
    s.experience.listAvailability(voyageId).catch(() => []),
    s.experience.listBookings(reservationId),
    // Not optional: without them, something already requested could be offered again.
    s.requests.listActive(reservationId),
    s.requests.listHistory(reservationId),
  ]);
  const contact = overview.reservation.suiteAmbassadorContact;
  const ambassador = contact?.name ?? overview.reservation.suiteAmbassador ?? 'Your Suite Ambassador';
  const ports = overview.voyage.itinerary;
  const dates = new Set(ports.map((p) => p.date));
  return {
    now: voyageNow(s.clock.now(), ports.map((p) => ({ date: p.date, timeZone: p.timeZone }))),
    guest: {
      firstName: profile.guest.preferredName ?? profile.guest.firstName,
      partySize: Math.max(1, overview.reservation.partyGuestIds.length),
      ...(membership ? { tier: membership.tier } : {}),
    },
    ambassador: { firstName: ambassador.split(' ')[0] ?? ambassador, title: contact?.title ?? 'Suite Ambassador' },
    itinerary: ports.map((p) => ({ id: p.id, day: p.day, date: p.date, type: p.type, portName: p.portName })),
    bookings: bookings.map((b) => ({ id: b.id, experienceId: b.experienceId, title: b.title, category: b.category, venue: b.venue, start: b.start, ...(b.end ? { end: b.end } : {}), partySize: b.partySize, status: b.status })),
    catalogue: catalogue.map((x) => ({
      id: x.id,
      category: x.category,
      title: x.title,
      ...(x.subtitle ? { subtitle: x.subtitle } : {}),
      ...(x.portCallId ? { portCallId: x.portCallId } : {}),
      ...(x.destination ? { destination: x.destination } : {}),
      ...(x.durationMinutes ? { durationMinutes: x.durationMinutes } : {}),
      inclusive: x.inclusive,
      ...(x.price ? { price: { amountMinor: x.price.amountMinor, currency: x.price.currency } } : {}),
      format: x.format,
      tags: x.tags,
    })),
    availability: catalogue.map((x) => ({ experienceId: x.id, slots: (availability.find((a) => a.experienceId === x.id)?.slots ?? []).map((sl) => ({ start: sl.start, ...(sl.end ? { end: sl.end } : {}), remaining: sl.remaining })) })),
    requests: [...active, ...history].map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      description: r.description,
      status: r.status,
      createdAt: r.createdAt,
      ...(r.nextUpdateBy ? { nextUpdateBy: r.nextUpdateBy } : {}),
      ...(r.experienceId ? { experienceId: r.experienceId } : {}),
      ...(r.occasionStep ? { occasionStep: r.occasionStep } : {}),
    })),
    occasionDates: profile.occasions.filter((o) => o.recognition !== 'private' && dates.has(o.date)).map((o) => o.date),
    priorRecoveries,
  };
}
