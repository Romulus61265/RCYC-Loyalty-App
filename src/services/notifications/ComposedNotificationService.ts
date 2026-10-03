/**
 * NotificationService over the other services' contracts (both modes): it
 * gathers the guest's data, runs the shared engine, applies preferences and
 * quiet hours, and keeps read state and push devices in a small store.
 *
 * Preferences live with the guest's communication preferences (versioned,
 * Profile-editable, synced in Supabase mode), so there is one source of truth
 * for channels, quiet hours and notification types.
 */
import type { ID, InboxNotification, NotificationPreferences, NotificationSettings, NotificationType, PushDevice, UpcomingNotification } from '@/domain';
import type { NotificationService, Services, Unsubscribe } from '@/services/contracts';
import { ServiceError } from '@/services/contracts';
import { contextualNotifications, defaultPreferencesFor, inbox, NOTIFICATION_TYPES, upcoming } from '../../../supabase/functions/_shared/notifications/engine';
import type { DecidedNotification } from '../../../supabase/functions/_shared/notifications/types';
import { buildNotifyInput } from './buildNotifyInput';
import type { NotificationStateStore } from './state';

type Deps = Pick<Services, 'profile' | 'voyage' | 'experience' | 'requests' | 'journeyEvents' | 'personalization' | 'clock'>;

const DELIVERIES = ['push', 'in-app', 'off'];
const TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,}\]$/;

export class ComposedNotificationService implements NotificationService {
  constructor(
    private readonly s: Deps,
    private readonly state: NotificationStateStore,
  ) {}

  private async settingsFor(guestId: ID): Promise<{ settings: NotificationSettings; version: number }> {
    const v = await this.s.profile.getPreferences(guestId);
    const c = v.preferences.communication;
    const stored = c.notifications;
    const defaults = defaultPreferencesFor(c.language);
    const preferences: NotificationPreferences = stored ? { ...defaults, ...stored, delivery: { ...defaults.delivery, ...stored.delivery, urgent: 'push' } } : defaults;
    return {
      version: v.version,
      settings: { preferences, pushChannel: c.channels.push, ...(c.quietHours ? { quietHours: c.quietHours } : {}), personalisedRecommendations: v.preferences.privacy.personalisedRecommendations },
    };
  }

  private async decided(guestId: ID, reservationId: ID): Promise<DecidedNotification[]> {
    const { profile, voyage, experience, requests, journeyEvents, personalization } = this.s;
    const overview = await voyage.getOverview(reservationId);
    const [p, { settings }, bookings, schedules, active, history, alerts, stored, recommendations] = await Promise.all([
      profile.getProfile(guestId),
      this.settingsFor(guestId),
      experience.listBookings(reservationId).catch(() => []),
      experience.listDaySchedules(reservationId).catch(() => []),
      requests.listActive(reservationId).catch(() => []),
      requests.listHistory(reservationId).catch(() => []),
      journeyEvents.listAlerts(reservationId).catch(() => []),
      journeyEvents.listNotifications(guestId, { includeScheduled: true }).catch(() => []),
      personalization.getPersonalizedRecommendations(guestId, reservationId, { limit: 10 }).catch(() => []),
    ]);
    const input = buildNotifyInput({ profile: p, voyage: overview.voyage, bookings, schedules, requests: [...active, ...history], alerts, recommendations, stored: stored.filter((n) => !n.reservationId || n.reservationId === reservationId) });
    return contextualNotifications(input, settings.preferences);
  }

  async list(guestId: ID, reservationId: ID, opts?: { type?: NotificationType }): Promise<InboxNotification[]> {
    const [all, read] = await Promise.all([this.decided(guestId, reservationId), this.state.readKeys(guestId)]);
    return inbox(all, this.s.clock.now())
      .filter((n) => !opts?.type || n.type === opts.type)
      .map((n) => ({
        key: n.key,
        type: n.type,
        title: n.title,
        body: n.body,
        at: n.at,
        ...(n.deepLink ? { deepLink: n.deepLink } : {}),
        read: Boolean(n.readAt) || read.has(n.key),
        delivery: n.delivery === 'push' ? 'push' : 'in-app',
      }));
  }

  async upcoming(guestId: ID, reservationId: ID, opts?: { limit?: number }): Promise<UpcomingNotification[]> {
    return upcoming(await this.decided(guestId, reservationId), this.s.clock.now())
      .slice(0, opts?.limit ?? 5)
      .map((n) => ({ key: n.key, type: n.type, title: n.title, deliverAt: n.deliverAt, heldForQuietHours: n.reason === 'quiet-hours' }));
  }

  async unreadCount(guestId: ID, reservationId: ID): Promise<number> {
    return (await this.list(guestId, reservationId)).filter((n) => !n.read).length;
  }

  async markRead(guestId: ID, keys: string[]): Promise<void> {
    const clean = [...new Set(keys.filter((k) => typeof k === 'string' && k.length > 0 && k.length <= 200))];
    if (clean.length) await this.state.markRead(guestId, clean, this.s.clock.now());
  }

  async markAllRead(guestId: ID, reservationId: ID): Promise<void> {
    await this.markRead(guestId, (await this.list(guestId, reservationId)).filter((n) => !n.read).map((n) => n.key));
  }

  async getSettings(guestId: ID): Promise<NotificationSettings> {
    return (await this.settingsFor(guestId)).settings;
  }

  async updatePreferences(guestId: ID, patch: Partial<NotificationPreferences>): Promise<NotificationSettings> {
    if (patch.delivery) {
      for (const [type, value] of Object.entries(patch.delivery)) {
        if (!NOTIFICATION_TYPES.includes(type as NotificationType) || !DELIVERIES.includes(value)) throw new ServiceError('validation', 'Unknown notification setting');
        if (type === 'urgent' && value !== 'push') throw new ServiceError('validation', 'Urgent notifications are always sent, for your safety');
      }
    }
    if (patch.timeFormat && !['12h', '24h'].includes(patch.timeFormat)) throw new ServiceError('validation', 'Unknown time format');
    if (patch.reminderLead && !['standard', 'early'].includes(patch.reminderLead)) throw new ServiceError('validation', 'Unknown reminder timing');
    const { settings, version } = await this.settingsFor(guestId);
    const next: NotificationPreferences = {
      ...settings.preferences,
      ...patch,
      delivery: { ...settings.preferences.delivery, ...(patch.delivery ?? {}), urgent: 'push' },
    };
    const v = await this.s.profile.getPreferences(guestId);
    await this.s.profile.updatePreferences(guestId, { communication: { ...v.preferences.communication, notifications: next } }, { expectedVersion: version });
    return this.getSettings(guestId);
  }

  async registerDevice(guestId: ID, registration: { token: string; platform: PushDevice['platform']; name?: string }): Promise<PushDevice> {
    if (!TOKEN.test(registration.token)) throw new ServiceError('validation', 'Not an Expo push token');
    if (!['ios', 'android', 'web'].includes(registration.platform)) throw new ServiceError('validation', 'Unknown platform');
    return this.state.upsertDevice(guestId, { ...registration, ...(registration.name ? { name: registration.name.slice(0, 80) } : {}) }, this.s.clock.now());
  }

  listDevices(guestId: ID): Promise<PushDevice[]> {
    return this.state.listDevices(guestId);
  }

  unregisterDevice(guestId: ID, deviceId: ID): Promise<void> {
    return this.state.removeDevice(guestId, deviceId);
  }

  subscribe(_guestId: ID, reservationId: ID, listener: () => void): Unsubscribe {
    const offRequests = this.s.requests.subscribe(reservationId, () => listener());
    const offEvents = this.s.journeyEvents.subscribe(reservationId, () => listener());
    return () => {
      offRequests();
      offEvents();
    };
  }
}
