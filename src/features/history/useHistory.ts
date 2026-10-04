/** Data access for voyage history: the only place these screens touch services. */
import { useAsync } from '@/hooks/useAsync';
import { useJourney } from '@/hooks/useJourney';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useServices } from '@/services/ServiceProvider';

export function useVoyageHistory() {
  const services = useServices();
  const { guestId } = useJourney();
  const state = useAsync(() => services.history.listVoyages(guestId), [guestId]);
  useRefreshOnFocus(state.reload);
  return state;
}

export function usePastVoyage(voyageId: string) {
  const services = useServices();
  const { guestId } = useJourney();
  const state = useAsync(() => services.history.getVoyage(guestId, voyageId), [guestId, voyageId]);
  useRefreshOnFocus(state.reload);
  return state;
}
