import type { ID, ISODateTime } from './common';
import type { DecidedNotification, NotificationDelivery, NotificationPreferences, NotificationType } from '../../supabase/functions/_shared/notifications/types';

/**
 * Contextual notifications. The engine and its types are shared with the
 * notifications-dispatch Edge Function (supabase/functions/_shared/notifications).
 */
export type { NotificationDelivery, NotificationPreferences, NotificationType };

/** A notification in the guest's inbox. */
export interface InboxNotification {
  /** Stable key (the same event keeps it everywhere: inbox, push, read state). */
  key: string;
  type: NotificationType;
  title: string;
  body: string;
  /** When it became relevant (local time). */
  at: ISODateTime;
  deepLink?: string;
  read: boolean;
  /** How it reaches the guest under their preferences. */
  delivery: Exclude<NotificationDelivery, 'off'>;
}

/** A push still to come, shown so the guest knows what to expect. */
export interface UpcomingNotification {
  key: string;
  type: NotificationType;
  title: string;
  /** When the push will go out (after quiet hours, if it was held). */
  deliverAt: ISODateTime;
  heldForQuietHours: boolean;
}

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export interface NotificationSettings {
  preferences: NotificationPreferences;
  /** From communication preferences: the push channel and quiet hours. */
  pushChannel: boolean;
  quietHours?: { start: string; end: string };
  /** Recommendations follow the privacy choice. */
  personalisedRecommendations: boolean;
}

/** A device registered for push (Expo push token), as the guest sees it. */
export interface PushDevice {
  id: ID;
  platform: 'ios' | 'android' | 'web';
  name?: string;
  registeredAt: ISODateTime;
  enabled: boolean;
}

export type { DecidedNotification };
