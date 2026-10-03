/**
 * View models for notifications: the inbox grouped by day, the "coming up"
 * line, and the settings rows. Pure.
 */
import type { InboxNotification, NotificationDelivery, NotificationPreferences, NotificationSettings, NotificationType, UpcomingNotification } from '@/domain';
import { clock, safeRoute } from '../../../supabase/functions/_shared/notifications/engine';
import { formatLongDate } from '@/utils/format';

export const TYPE_INFO: Record<NotificationType, { label: string; icon: string; description: string }> = {
  urgent: { label: 'Urgent', icon: 'alert-circle-outline', description: 'Weather, tenders and your safety.' },
  'itinerary-change': { label: 'Itinerary changes', icon: 'swap-horizontal-outline', description: 'When a time or a port changes.' },
  reminder: { label: 'Reminders', icon: 'alarm-outline', description: 'Before a reservation begins, and all aboard on days ashore.' },
  'service-update': { label: 'Service updates', icon: 'chatbubble-ellipses-outline', description: 'Your requests, and your driver on the way.' },
  reservation: { label: 'Reservations', icon: 'calendar-outline', description: 'Bookings confirmed or changed.' },
  information: { label: 'Information', icon: 'information-circle-outline', description: 'Arrivals in port and helpful notes.' },
  recommendation: { label: 'Recommendations', icon: 'sparkles-outline', description: 'An occasional idea for a coming port day.' },
};

/** Settings order: what matters most first. */
export const TYPE_ORDER: NotificationType[] = ['urgent', 'itinerary-change', 'reminder', 'service-update', 'reservation', 'information', 'recommendation'];

export interface InboxItemModel {
  key: string;
  type: NotificationType;
  typeLabel: string;
  icon: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
  route?: string;
  accessibilityLabel: string;
}

export interface InboxModel {
  unread: number;
  groups: { label: string; items: InboxItemModel[] }[];
  /** Types present, for the filter. */
  types: { value: NotificationType | 'all'; label: string }[];
  upcoming: { key: string; title: string; when: string; held: boolean }[];
}

const dayLabel = (iso: string, nowOffsetDate: string): string => {
  const date = iso.slice(0, 10);
  if (date === nowOffsetDate) return 'Today';
  const y = new Date(Date.parse(`${nowOffsetDate}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  if (date === y) return 'Yesterday';
  return formatLongDate(iso);
};

export function buildInbox(items: InboxNotification[], upcoming: UpcomingNotification[], prefs: NotificationPreferences, now: Date, filter: NotificationType | 'all' = 'all'): InboxModel {
  // "Today" in the guest's current zone: the newest item's offset is a good proxy for where they are.
  const offset = /([+-]\d{2}):(\d{2})$/.exec(items[0]?.at ?? '')?.slice(1) ?? ['+00', '00'];
  const mins = (offset[0]!.startsWith('-') ? -1 : 1) * (Math.abs(Number(offset[0])) * 60 + Number(offset[1]));
  const today = new Date(now.getTime() + mins * 60_000).toISOString().slice(0, 10);
  const shown = items.filter((n) => filter === 'all' || n.type === filter);
  const groups: InboxModel['groups'] = [];
  for (const n of shown) {
    const label = dayLabel(n.at, today);
    const group = groups[groups.length - 1]?.label === label ? groups[groups.length - 1]! : (groups.push({ label, items: [] }), groups[groups.length - 1]!);
    const info = TYPE_INFO[n.type];
    const route = safeRoute(n.deepLink);
    group.items.push({
      key: n.key,
      type: n.type,
      typeLabel: info.label.replace(/s$/, ''),
      icon: info.icon,
      title: n.title,
      body: n.body,
      time: clock(n.at, prefs.timeFormat),
      unread: !n.read,
      ...(route ? { route } : {}),
      accessibilityLabel: `${n.read ? '' : 'Unread. '}${info.label}: ${n.title} ${n.body}`,
    });
  }
  const present = new Set(items.map((n) => n.type));
  return {
    unread: items.filter((n) => !n.read).length,
    groups,
    types: [{ value: 'all', label: 'All' }, ...TYPE_ORDER.filter((t) => present.has(t)).map((t) => ({ value: t, label: TYPE_INFO[t].label }))],
    upcoming: upcoming.slice(0, 3).map((u) => ({
      key: u.key,
      title: u.title,
      when: `${formatLongDate(u.deliverAt)}, ${clock(u.deliverAt, prefs.timeFormat)}${u.heldForQuietHours ? ', after quiet hours' : ''}`,
      held: u.heldForQuietHours,
    })),
  };
}

export interface SettingsRowModel {
  type: NotificationType;
  label: string;
  description: string;
  value: NotificationDelivery;
  locked?: string;
  options: { value: NotificationDelivery; label: string }[];
}

export function buildSettings(s: NotificationSettings): { rows: SettingsRowModel[]; quietLine: string; pushLine?: string } {
  const options: SettingsRowModel['options'] = [
    { value: 'push', label: 'Push' },
    { value: 'in-app', label: 'In the app' },
    { value: 'off', label: 'Off' },
  ];
  const rows = TYPE_ORDER.map((type): SettingsRowModel => {
    const info = TYPE_INFO[type];
    const row: SettingsRowModel = { type, label: info.label, description: info.description, value: s.preferences.delivery[type], options };
    if (type === 'urgent') row.locked = 'Always sent, even in quiet hours.';
    if (type === 'recommendation' && !s.personalisedRecommendations) row.locked = 'Off while personalised recommendations are switched off in Privacy.';
    return row;
  });
  const quietLine = s.quietHours
    ? `Quiet hours ${s.quietHours.start}–${s.quietHours.end}: pushes that can wait arrive at ${s.quietHours.end}. Urgent messages and your driver still reach you.`
    : 'No quiet hours: pushes arrive when they are due.';
  return { rows, quietLine, ...(s.pushChannel ? {} : { pushLine: 'App notifications are switched off in Communication, so everything stays in the app.' }) };
}
