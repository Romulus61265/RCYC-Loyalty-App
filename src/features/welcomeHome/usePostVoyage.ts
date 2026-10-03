/** Data access after the voyage: the only place these screens touch services. */
import { useCallback, useState } from 'react';
import type { FeedbackPatch, VoyageFeedback } from '@/domain';
import { toAppError, type AppError } from '@/core/errors';
import { useAsync } from '@/hooks/useAsync';
import { useJourney } from '@/hooks/useJourney';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useServices } from '@/services/ServiceProvider';
import { welcomeHomeCard } from './welcomeHomeModel';

export function useRecap() {
  const services = useServices();
  const { guestId, reservationId } = useJourney();
  const state = useAsync(() => services.postVoyage.getRecap(guestId, reservationId), [guestId, reservationId]);
  useRefreshOnFocus(state.reload);
  return state;
}

/** For Home: only once the voyage is over (failure is quiet). */
export function useWelcomeHomeCard() {
  const services = useServices();
  const { guestId, reservationId } = useJourney();
  const state = useAsync(() => services.postVoyage.getRecap(guestId, reservationId).catch(() => null), [guestId, reservationId]);
  useRefreshOnFocus(state.reload);
  return state.data ? welcomeHomeCard(state.data) : null;
}

/** The reflections: saved as the guest goes, sent once. */
export function useReflections() {
  const services = useServices();
  const { guestId, reservationId } = useJourney();
  const recap = useRecap();
  const [saved, setSaved] = useState<VoyageFeedback | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | undefined>();
  const current = saved ?? recap.data?.feedback;

  const save = useCallback(
    async (patch: FeedbackPatch) => {
      if (!current || current.status === 'sent') return false;
      setBusy(true);
      setError(undefined);
      try {
        setSaved(await services.postVoyage.saveFeedback(guestId, reservationId, patch, { expectedVersion: current.version }));
        return true;
      } catch (e) {
        setError(toAppError(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [services, guestId, reservationId, current],
  );

  const send = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      setSaved(await services.postVoyage.sendFeedback(guestId, reservationId));
      return true;
    } catch (e) {
      setError(toAppError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, [services, guestId, reservationId]);

  return { recap, feedback: current, save, send, busy, error };
}
