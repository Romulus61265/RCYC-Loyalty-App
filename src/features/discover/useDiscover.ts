/**
 * Data access for Discover: the only place it touches services.
 * Catalogue, destinations, voyage and profile are required; availability,
 * bookings and recommendations each degrade on their own.
 */
import { toAppError } from '@/core/errors';
import { settle } from '@/features/shared/status';
import { useAsync } from '@/hooks/useAsync';
import { useJourney } from '@/hooks/useJourney';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useServices } from '@/services/ServiceProvider';
import { buildDiscoverModel } from './discoverModel';

export function useDiscover() {
  const services = useServices();
  const { guestId, reservationId, voyageId } = useJourney();

  const state = useAsync(async () => {
    const now = services.clock.now();
    const s = <T,>(call: () => Promise<T>) => settle(call, toAppError);
    const [core, availability, bookings, recommendations] = await Promise.all([
      Promise.all([
        services.voyage.getOverview(reservationId),
        services.profile.getProfile(guestId),
        services.experience.listCatalogue(voyageId),
        services.experience.listDestinations(voyageId),
      ]),
      s(() => services.experience.listAvailability(voyageId)),
      s(() => services.experience.listBookings(reservationId)),
      s(() => services.personalization.getRecommendations(guestId, 'discover', { reservationId, limit: 100 })),
    ]);
    const [overview, profile, catalogue, destinations] = core;
    return buildDiscoverModel({ overview, profile, catalogue, destinations }, { availability, bookings, recommendations }, now);
  }, [guestId, reservationId, voyageId]);
  useRefreshOnFocus(state.reload);
  return state;
}
