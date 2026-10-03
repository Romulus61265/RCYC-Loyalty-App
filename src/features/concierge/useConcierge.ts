/**
 * Data access for Concierge: the only place the screen touches services.
 *
 * The conversation, voyage, profile and catalogue are required. Requests,
 * bookings and loyalty privileges refresh on their own (after each action,
 * when a person replies, and when the tab regains focus), so cards always
 * show live status.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import type { ConciergeAction, ConciergeMessage, EscalationTarget } from '@/domain';
import { reportError, toAppError } from '@/core/errors';
import { settle } from '@/features/shared/status';
import { useAsync } from '@/hooks/useAsync';
import { useJourney } from '@/hooks/useJourney';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useServices } from '@/services/ServiceProvider';
import { actionKey, buildConciergeModel, buildGuestContext } from './conciergeModel';

let localSeq = 0;

/** In-app routes only: never a URL to another site. */
const isAppRoute = (route: string) => route.startsWith('/') && !route.startsWith('//');

export function useConcierge() {
  const services = useServices();
  const { guestId, reservationId, voyageId, phase } = useJourney();

  const core = useAsync(async () => {
    const [conversation, overview, profile, recognition, catalogue, days] = await Promise.all([
      services.concierge.openConversation(reservationId),
      services.voyage.getOverview(reservationId),
      services.profile.getProfile(guestId),
      services.loyalty.getRecognition(guestId, voyageId),
      services.experience.listCatalogue(voyageId),
      services.experience.listDaySchedules(reservationId).catch(() => []),
    ]);
    return { conversation, overview, profile, recognition, catalogue, days };
  }, [guestId, reservationId, voyageId]);

  const side = useAsync(async () => {
    const s = <T,>(call: () => Promise<T>) => settle(call, toAppError);
    const [requests, bookings] = await Promise.all([s(() => services.concierge.listServiceRequests(reservationId)), s(() => services.experience.listBookings(reservationId))]);
    return { requests: requests.ok ? requests.value : null, bookings: bookings.ok ? bookings.value : null };
  }, [reservationId]);
  const refreshSide = side.reload;
  useRefreshOnFocus(refreshSide);

  // Messages added since the conversation was loaded, tied to that load.
  const [appended, setAppended] = useState<{ base: object | undefined; items: ConciergeMessage[] }>({ base: undefined, items: [] });
  const append = useCallback(
    (items: ConciergeMessage[]) => setAppended((prev) => ({ base: core.data, items: prev.base === core.data ? [...prev.items, ...items] : items })),
    [core.data],
  );
  const [performed, setPerformed] = useState<ReadonlySet<string>>(new Set());
  const [busyKey, setBusyKey] = useState<string>();
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string>();

  const conversationId = core.data?.conversation.conversationId;
  useEffect(() => {
    if (!conversationId) return;
    return services.concierge.subscribe(conversationId, (m) => {
      append([m]);
      // A person joining usually moves a request on.
      refreshSide();
    });
  }, [conversationId, services, append, refreshSide]);

  const messages = useMemo(() => {
    if (!core.data) return [];
    const extra = appended.base === core.data ? appended.items : [];
    const seen = new Set(core.data.conversation.messages.map((m) => m.id));
    return [...core.data.conversation.messages, ...extra.filter((m) => !seen.has(m.id))];
  }, [core.data, appended]);

  const send = useCallback(
    async (body: string): Promise<boolean> => {
      const text = body.trim();
      if (!text || sending || !core.data) return false;
      const { conversation, overview, profile, recognition } = core.data;
      setSending(true);
      setNotice(undefined);
      localSeq += 1;
      append([{ id: `local_${localSeq}`, conversationId: conversation.conversationId, author: 'guest', body: text, createdAt: services.clock.now().toISOString() }]);
      try {
        const context = buildGuestContext({ guestId, phase, overview, profile, recognition, bookings: side.data?.bookings ?? [], now: services.clock.now() });
        const replies = await services.concierge.sendMessage(conversation.conversationId, text, context);
        append(replies);
        services.audit.record({ action: 'concierge.message', resource: 'conversation', resourceId: conversation.conversationId, outcome: 'success', metadata: { intent: replies[0]?.intent ?? 'unknown' } });
        refreshSide();
        return true;
      } catch (e) {
        reportError(e, { source: 'concierge.send' });
        setNotice('Your message didn’t reach us. Please try again in a moment.');
        return false;
      } finally {
        setSending(false);
      }
    },
    [sending, core.data, append, services, guestId, phase, side.data, refreshSide],
  );

  const perform = useCallback(
    async (action: ConciergeAction) => {
      if (!core.data || busyKey) return;
      if (action.kind === 'open') {
        if (isAppRoute(action.route)) router.push(action.route as never);
        return;
      }
      const key = actionKey(action);
      const conversation = core.data.conversation.conversationId;
      setBusyKey(key);
      setNotice(undefined);
      try {
        const replies = await services.concierge.performAction(conversation, action);
        setPerformed((prev) => new Set(prev).add(key));
        append(replies);
        services.audit.record({ action: `concierge.action.${action.kind}`, resource: 'conversation', resourceId: conversation, outcome: 'success' });
        refreshSide();
      } catch (e) {
        reportError(e, { source: 'concierge.action' });
        services.audit.record({ action: `concierge.action.${action.kind}`, resource: 'conversation', resourceId: conversation, outcome: 'failure' });
        setNotice(action.kind === 'escalate' ? 'We couldn’t reach the team just now. Please call guest services from your suite telephone.' : 'We couldn’t arrange that just now. Please try again, or ask your Suite Ambassador.');
      } finally {
        setBusyKey(undefined);
      }
    },
    [core.data, busyKey, services, append, refreshSide],
  );

  const escalate = useCallback(
    (to: EscalationTarget, label: string) => perform({ kind: 'escalate', label, to, reason: to === 'medical' ? 'medical' : 'guest-request' }),
    [perform],
  );

  const model = useMemo(() => {
    if (!core.data) return undefined;
    const { overview, catalogue, days, recognition } = core.data;
    return buildConciergeModel(
      { messages, overview, catalogue, days, privileges: recognition.privileges, requests: side.data?.requests ?? [], bookings: side.data?.bookings ?? [], phase },
      { performed, busyKey, sending, now: services.clock.now() },
    );
  }, [core.data, messages, side.data, phase, performed, busyKey, sending, services]);

  return {
    model,
    loading: core.loading && !core.data,
    error: core.error,
    reload: core.reload,
    requestsUnavailable: side.data ? side.data.requests === null : false,
    sending,
    notice,
    send,
    perform,
    escalate,
  };
}
