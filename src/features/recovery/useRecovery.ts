/** Data access for service recovery: the only place these screens touch services. */
import { useCallback, useEffect, useState } from 'react';
import { toAppError, type AppError } from '@/core/errors';
import { useAsync } from '@/hooks/useAsync';
import { useJourney } from '@/hooks/useJourney';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useServices } from '@/services/ServiceProvider';
import { buildRecoveryModel, recoveryCard } from './recoveryModel';

/** The newest open notice, for Home (none is fine; failure is quiet). */
export function useOpenRecovery() {
  const services = useServices();
  const { guestId, reservationId } = useJourney();
  const state = useAsync(async () => {
    const notices = await services.recovery.listNotices(guestId, reservationId).catch(() => []);
    const open = notices.find((n) => n.status === 'open');
    return open ? recoveryCard(open) : null;
  }, [guestId, reservationId]);
  useRefreshOnFocus(state.reload);
  const { reload } = state;
  useEffect(() => services.recovery.subscribe(reservationId, reload), [services, reservationId, reload]);
  return state.data ?? null;
}

export function useRecovery(id: string) {
  const services = useServices();
  const { guestId, reservationId } = useJourney();
  const state = useAsync(async () => {
    const [notice, profile] = await Promise.all([services.recovery.getNotice(guestId, reservationId, id), services.profile.getProfile(guestId)]);
    return buildRecoveryModel(notice, 1 + profile.companions.length);
  }, [guestId, reservationId, id]);
  useRefreshOnFocus(state.reload);
  const { reload } = state;

  const [busy, setBusy] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, AppError>>({});
  const [sent, setSent] = useState<string | undefined>();
  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      setBusy(key);
      setErrors((e) => {
        const { [key]: _gone, ...rest } = e;
        return rest;
      });
      try {
        await fn();
        setSent(key);
        reload();
        return true;
      } catch (e) {
        setErrors((x) => ({ ...x, [key]: toAppError(e) }));
        return false;
      } finally {
        setBusy(undefined);
      }
    },
    [reload],
  );
  /** Only ever called from the guest's own confirmation. */
  const accept = useCallback(
    (alternativeId: string, opts: { acknowledgedCharge?: boolean; note?: string }) =>
      run(alternativeId, () => services.recovery.acceptAlternative(guestId, reservationId, id, { alternativeId, approved: true, ...opts })),
    [run, services, guestId, reservationId, id],
  );
  const askForHelp = useCallback((note?: string) => run('assist', () => services.recovery.requestAssistance(guestId, reservationId, id, note)), [run, services, guestId, reservationId, id]);
  return { ...state, accept, askForHelp, busy, errors, sent };
}
