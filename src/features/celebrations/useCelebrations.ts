/** Data access for celebrations: the only place these screens touch services. */
import { useCallback, useState } from 'react';
import { toAppError, type AppError } from '@/core/errors';
import { useAsync } from '@/hooks/useAsync';
import { useJourney } from '@/hooks/useJourney';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useServices } from '@/services/ServiceProvider';
import { buildCelebrationModel, celebrationCard } from './celebrationModel';

/** The next celebration on the voyage, for Home (none is fine; failure is quiet). */
export function useNextCelebration() {
  const services = useServices();
  const { guestId, reservationId } = useJourney();
  const state = useAsync(async () => {
    const plans = await services.occasions.listCelebrations(guestId, reservationId).catch(() => []);
    return plans[0] ? celebrationCard(plans[0]) : null;
  }, [guestId, reservationId]);
  useRefreshOnFocus(state.reload);
  return state.data ?? null;
}

export function useCelebration(key: string) {
  const services = useServices();
  const { guestId, reservationId } = useJourney();
  const state = useAsync(async () => {
    const [plan, profile] = await Promise.all([services.occasions.getPlan(guestId, reservationId, key), services.profile.getProfile(guestId)]);
    return buildCelebrationModel(plan, 1 + profile.companions.length);
  }, [guestId, reservationId, key]);
  useRefreshOnFocus(state.reload);
  const { reload } = state;

  const [busy, setBusy] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, AppError>>({});
  const [done, setDone] = useState<Record<string, string>>({});
  /** Only ever called from the guest's own confirmation. */
  const approve = useCallback(
    async (stepId: string, opts: { acknowledgedCharge?: boolean; note?: string }) => {
      setBusy(stepId);
      setErrors((e) => {
        const { [stepId]: _gone, ...rest } = e;
        return rest;
      });
      try {
        const result = await services.occasions.approveStep(guestId, reservationId, key, { stepId, approved: true, ...opts });
        setDone((d) => ({ ...d, [stepId]: result.requestId ?? result.bookingId ?? '' }));
        reload();
        return true;
      } catch (e) {
        setErrors((x) => ({ ...x, [stepId]: toAppError(e) }));
        return false;
      } finally {
        setBusy(undefined);
      }
    },
    [services, guestId, reservationId, key, reload],
  );
  return { ...state, approve, busy, errors, done };
}
