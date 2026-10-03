/**
 * Data access for the Voyage area: the only place it touches services.
 * Voyage overview and profile are required; bookings, catalogue,
 * recommendations and the calendar are isolated so one failure affects
 * only the sections that use it.
 */
import { toAppError } from '@/core/errors';
import { settle } from '@/features/shared/status';
import { useAsync } from '@/hooks/useAsync';
import { useJourney } from '@/hooks/useJourney';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useServices } from '@/services/ServiceProvider';
import { buildVoyageViewModel } from './voyageModel';

export function useVoyageArea() {
  const services = useServices();
  const { guestId, reservationId, voyageId } = useJourney();

  const state = useAsync(async () => {
    const now = services.clock.now();
    const s = <T,>(call: () => Promise<T>) => settle(call, toAppError);
    const [core, bookings, catalogue, recommendations, calendar] = await Promise.all([
      Promise.all([services.voyage.getOverview(reservationId), services.profile.getProfile(guestId)]),
      s(() => services.experience.listBookings(reservationId)),
      s(() => services.experience.listCatalogue(voyageId)),
      s(() => services.personalization.getRecommendations(guestId, 'voyage', { reservationId, limit: 20 })),
      s(() => services.schedule.getCalendar(reservationId)),
    ]);
    const [overview, profile] = core;
    return buildVoyageViewModel({ overview, profile }, { bookings, catalogue, recommendations, calendar }, now);
  }, [guestId, reservationId, voyageId]);
  useRefreshOnFocus(state.reload);
  return state;
}
