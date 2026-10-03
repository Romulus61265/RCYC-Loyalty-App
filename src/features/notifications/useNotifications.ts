/** Data access for notifications: the only place these screens touch services. */
import { useCallback, useEffect, useState } from 'react';
import type { NotificationPreferences, NotificationType, PushDevice, PushPermission } from '@/domain';
import { toAppError, type AppError } from '@/core/errors';
import { useAsync } from '@/hooks/useAsync';
import { useJourney } from '@/hooks/useJourney';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useServices } from '@/services/ServiceProvider';
import { buildInbox, buildSettings } from './notificationsModel';

/** The unread count, for the bell on Home (quiet on failure). */
export function useUnreadCount(): number {
  const services = useServices();
  const { guestId, reservationId } = useJourney();
  const state = useAsync(() => services.notifications.unreadCount(guestId, reservationId).catch(() => 0), [guestId, reservationId]);
  useRefreshOnFocus(state.reload);
  const { reload } = state;
  useEffect(() => services.notifications.subscribe(guestId, reservationId, reload), [services, guestId, reservationId, reload]);
  return state.data ?? 0;
}

export function useInbox(filter: NotificationType | 'all') {
  const services = useServices();
  const { guestId, reservationId } = useJourney();
  const state = useAsync(async () => {
    const [items, upcoming, settings] = await Promise.all([
      services.notifications.list(guestId, reservationId),
      services.notifications.upcoming(guestId, reservationId, { limit: 3 }).catch(() => []),
      services.notifications.getSettings(guestId),
    ]);
    return { items, upcoming, settings };
  }, [guestId, reservationId]);
  useRefreshOnFocus(state.reload);
  const { reload } = state;
  useEffect(() => services.notifications.subscribe(guestId, reservationId, reload), [services, guestId, reservationId, reload]);
  const model = state.data ? buildInbox(state.data.items, state.data.upcoming, state.data.settings.preferences, services.clock.now(), filter) : undefined;
  const markRead = useCallback(async (keys: string[]) => {
    await services.notifications.markRead(guestId, keys).catch(() => undefined);
    reload();
  }, [services, guestId, reload]);
  const markAllRead = useCallback(async () => {
    await services.notifications.markAllRead(guestId, reservationId).catch(() => undefined);
    reload();
  }, [services, guestId, reservationId, reload]);
  return { model, loading: state.loading, error: state.error, reload, markRead, markAllRead };
}

export function useNotificationSettings() {
  const services = useServices();
  const { guestId } = useJourney();
  const state = useAsync(async () => {
    const [settings, devices, permission] = await Promise.all([services.notifications.getSettings(guestId), services.notifications.listDevices(guestId).catch(() => [] as PushDevice[]), services.push.permission()]);
    return { settings, devices, permission };
  }, [guestId]);
  useRefreshOnFocus(state.reload);
  const { reload } = state;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<AppError | undefined>();
  const [pushNote, setPushNote] = useState<string | undefined>();
  const update = useCallback(async (patch: Partial<NotificationPreferences>) => {
    setSaving(true);
    setError(undefined);
    try {
      await services.notifications.updatePreferences(guestId, patch);
      reload();
    } catch (e) {
      setError(toAppError(e));
    } finally {
      setSaving(false);
    }
  }, [services, guestId, reload]);
  const enablePush = useCallback(async () => {
    const result: { permission: PushPermission; token?: string } = await services.push.enable();
    if (result.token) {
      await services.notifications.registerDevice(guestId, { token: result.token, platform: services.push.platform });
      setPushNote('Push notifications are on for this device.');
      reload();
    } else {
      setPushNote(result.permission === 'denied' ? 'Notifications are switched off for this app in your device settings.' : 'Push notifications arrive in the iOS and Android apps. Here, everything appears in your notifications.');
    }
  }, [services, guestId, reload]);
  const removeDevice = useCallback(async (id: string) => {
    await services.notifications.unregisterDevice(guestId, id);
    reload();
  }, [services, guestId, reload]);
  const view = state.data ? { ...buildSettings(state.data.settings), settings: state.data.settings, devices: state.data.devices, permission: state.data.permission, supported: services.push.supported } : undefined;
  return { view, loading: state.loading, error: state.error, reload, update, saving, saveError: error, enablePush, pushNote, removeDevice };
}
