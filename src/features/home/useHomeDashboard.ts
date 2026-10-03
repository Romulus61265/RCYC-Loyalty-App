/**
 * Data access for Home. The only place Home touches services.
 *
 * Core data (voyage overview, Bonvoy recognition, profile) must succeed.
 * Everything else is fetched with `allSettled`, so a failing source (say,
 * bookings) leaves the rest of the dashboard intact and its own section
 * shows a calm fallback.
 */
import { useCallback } from 'react';
import { reportError, toAppError } from '@/core/errors';
import { useAsync } from '@/hooks/useAsync';
import { useJourney } from '@/hooks/useJourney';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useServices } from '@/services/ServiceProvider';
import { settle as settleWith } from '@/features/shared/status';
import { buildHomeViewModel, type HomeViewModel } from './homeModel';

const settle = <T,>(call: () => Promise<T>) => settleWith(call, toAppError);

export interface HomeDashboard {
  model: HomeViewModel | undefined;
  loading: boolean;
  error: ReturnType<typeof useAsync>['error'];
  reload: () => void;
  dismissAlert: (alertId: string) => void;
}

export function useHomeDashboard(): HomeDashboard {
  const services = useServices();
  const { guestId, reservationId, voyageId, phase } = useJourney();

  const { data, loading, error, reload } = useAsync(async () => {
    const now = services.clock.now();
    const [core, bookings, schedules, catalogue, alerts, recommendations] = await Promise.all([
      Promise.all([
        services.voyage.getOverview(reservationId),
        services.loyalty.getRecognition(guestId, voyageId),
        services.profile.getProfile(guestId),
      ]),
      settle(() => services.experience.listBookings(reservationId)),
      settle(() => services.experience.listDaySchedules(reservationId)),
      settle(() => services.experience.listCatalogue(voyageId)),
      settle(() => services.journeyEvents.listAlerts(reservationId)),
      settle(() => services.personalization.getRecommendations(guestId, 'home', { reservationId, limit: 3 })),
    ]);
    const [overview, recognition, profile] = core;
    return buildHomeViewModel({ overview, recognition, profile }, { bookings, schedules, catalogue, alerts, recommendations }, phase, now);
  }, [guestId, reservationId, voyageId, phase]);

  useRefreshOnFocus(reload);

  const dismissAlert = useCallback(
    (alertId: string) => {
      void settle(() => services.journeyEvents.acknowledge(alertId)).then((r) => (r.ok ? reload() : reportError(r.error, { source: 'home.dismissAlert' })));
    },
    [services, reload],
  );

  return { model: data, loading, error, reload, dismissAlert };
}
