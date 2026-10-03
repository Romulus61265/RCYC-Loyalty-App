/**
 * Data access for the Requests screens: the only place they touch services.
 * Lists and details refresh on focus and when the crew update a request.
 */
import { useCallback, useEffect, useState } from 'react';
import type { GuestServiceRequest, NewServiceRequest } from '@/domain';
import { toAppError, type AppError } from '@/core/errors';
import { useAsync } from '@/hooks/useAsync';
import { useJourney } from '@/hooks/useJourney';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useServices } from '@/services/ServiceProvider';
import { buildRequestDetail, buildRequestsList } from './requestsModel';

export function useRequestsList() {
  const services = useServices();
  const { reservationId } = useJourney();
  const state = useAsync(async () => {
    const [active, history] = await Promise.all([services.requests.listActive(reservationId), services.requests.listHistory(reservationId)]);
    return buildRequestsList(active, history);
  }, [reservationId]);
  useRefreshOnFocus(state.reload);
  const { reload } = state;
  useEffect(() => services.requests.subscribe(reservationId, () => reload()), [services, reservationId, reload]);
  return state;
}

export function useRequestDetail(requestId: string) {
  const services = useServices();
  const { reservationId } = useJourney();
  const state = useAsync(async () => buildRequestDetail(await services.requests.get(requestId)), [requestId]);
  useRefreshOnFocus(state.reload);
  const { reload } = state;
  useEffect(
    () =>
      services.requests.subscribe(reservationId, (r) => {
        if (r.id === requestId) reload();
      }),
    [services, reservationId, requestId, reload],
  );

  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();
  const [closeError, setCloseError] = useState<AppError | undefined>();
  const close = useCallback(
    async (done: string) => {
      setClosing(true);
      setCloseError(undefined);
      try {
        await services.requests.close(requestId);
        setNotice(done);
        reload();
      } catch (e) {
        setCloseError(toAppError(e));
      } finally {
        setClosing(false);
      }
    },
    [services, requestId, reload],
  );
  return { ...state, close, closing, notice, closeError };
}

export function useSubmitRequest() {
  const services = useServices();
  const { reservationId } = useJourney();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<AppError | undefined>();
  const submit = useCallback(
    async (input: Omit<NewServiceRequest, 'reservationId'>): Promise<GuestServiceRequest | undefined> => {
      setSubmitting(true);
      setError(undefined);
      try {
        return await services.requests.submit({ ...input, reservationId });
      } catch (e) {
        setError(toAppError(e));
        return undefined;
      } finally {
        setSubmitting(false);
      }
    },
    [services, reservationId],
  );
  return { submit, submitting, error };
}
