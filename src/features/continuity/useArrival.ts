/** Data access for arrival updates: the only place these screens touch services. */
import { useEffect } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { useJourney } from '@/hooks/useJourney';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useServices } from '@/services/ServiceProvider';
import { arrivalCard, buildArrivalModel } from './arrivalModel';

/** The latest arrival update, live (none is fine; failure is quiet). */
function useLatestArrival() {
  const services = useServices();
  const { reservationId } = useJourney();
  const state = useAsync(() => services.continuity.getArrivalUpdate(reservationId).catch(() => null), [reservationId]);
  useRefreshOnFocus(state.reload);
  const { reload } = state;
  useEffect(() => services.continuity.subscribe(reservationId, reload), [services, reservationId, reload]);
  return state;
}

export function useArrivalCard() {
  const { data } = useLatestArrival();
  return data ? arrivalCard(data) : null;
}

export function useArrival() {
  const state = useLatestArrival();
  return { ...state, data: state.data ? buildArrivalModel(state.data) : state.data };
}
