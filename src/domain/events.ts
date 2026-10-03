import type { ID, ISODateTime } from './common';
import type { NotificationType } from './notifications';

/**
 * Journey events — the service-continuity backbone. Produced by enterprise
 * systems (flight feeds, shore ops, shipboard PMS, concierge platform),
 * normalised by the integration layer and fanned out to guest + crew apps.
 */
export type JourneyEventType =
  | 'flight.delayed'
  | 'transfer.delayed'
  | 'embarkation.changed'
  | 'dining.cancelled'
  | 'excursion.cancelled'
  | 'weather.disruption'
  | 'itinerary.port_changed'
  | 'service.request_updated'
  | 'medical.assistance_requested'
  | 'occasion.anniversary'
  | 'occasion.birthday';

export type EventSeverity = 'info' | 'notice' | 'action' | 'urgent';

export interface JourneyEvent<TPayload = Record<string, unknown>> {
  id: ID;
  type: JourneyEventType;
  /** Correlates all events touching the same reservation. */
  reservationId: ID;
  guestIds: ID[];
  occurredAt: ISODateTime;
  severity: EventSeverity;
  source: string;
  payload: TPayload;
  /** For idempotent processing across retries. */
  dedupeKey: string;
}

export type NotificationChannel = 'push' | 'email' | 'sms' | 'whatsapp' | 'in-app';

export type NotificationCategory = 'pre-voyage' | 'travel' | 'onboard' | 'reservation' | 'concierge' | 'occasion' | 'post-voyage';

/**
 * A message sent (or scheduled) to the guest through a channel. Distinct
 * from JourneyAlert: alerts are in-app cards that need attention; notifications
 * are the outbound communication history.
 */
export interface GuestNotification {
  id: ID;
  guestId: ID;
  reservationId?: ID;
  channel: NotificationChannel;
  category: NotificationCategory;
  title: string;
  body: string;
  /** In-app route opened when tapped. */
  deepLink?: string;
  scheduledFor: ISODateTime;
  deliveredAt?: ISODateTime;
  readAt?: ISODateTime;
  /** Respect quiet hours unless urgent. */
  bypassQuietHours: boolean;
  /** The guest-facing type (derived from the category when absent). */
  type?: NotificationType;
  /** The engine key it was sent for (contextual notifications are never sent twice). */
  dedupeKey?: string;
}

/** Guest-facing projection of an event. Calm wording, clear next step. */
export interface JourneyAlert {
  id: ID;
  eventId: ID;
  severity: EventSeverity;
  title: string;
  body: string;
  /** What has already been done on the guest's behalf. */
  handled?: string;
  action?: { label: string; route: string };
  createdAt: ISODateTime;
  /** After this moment the alert is no longer relevant and is not shown. */
  expiresAt?: ISODateTime;
  acknowledged: boolean;
}
