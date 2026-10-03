// Contextual notifications: contracts.
//
// Self-contained (no imports), so the same engine runs in the app (inbox,
// "coming up") and in the notifications-dispatch Edge Function (push). The
// shapes are structural subsets of the app's domain types.
//
//   guest data ──▶ rules ──▶ candidates (each with a stable key and a moment)
//              ──▶ preferences + quiet hours ──▶ decided (push / in-app / off, when)

export type ISODateTime = string; // local, with offset

export type NotificationType = 'information' | 'reminder' | 'service-update' | 'reservation' | 'itinerary-change' | 'urgent' | 'recommendation';

/** How a type reaches the guest: a push (and the inbox), the inbox only, or not at all. */
export type NotificationDelivery = 'push' | 'in-app' | 'off';

export interface NotificationPreferences {
  delivery: Record<NotificationType, NotificationDelivery>;
  /** How times read in notifications (they are often read on the lock screen). */
  timeFormat: '12h' | '24h';
  /** Reminders at the usual time, or earlier. */
  reminderLead: 'standard' | 'early';
}

// ─── Inputs ────────────────────────────────────────────────────────────────

export interface NotifyGuest {
  firstName: string;
  /** Communication preferences that also govern notifications. */
  pushChannel: boolean;
  quietHours?: { start: string; end: string };
  personalisedRecommendations: boolean;
}

export interface NotifyDay {
  id: string;
  day: number;
  date: string;
  type: string; // embark | port | tender | overnight | sea | disembark
  portName: string;
  arrival?: ISODateTime;
  allAboard?: ISODateTime;
}

export interface NotifyBooking {
  id: string;
  title: string;
  category: string;
  venue: string;
  start: ISODateTime;
  end?: ISODateTime;
  status: string;
}

/** A programme item; `previousStart` and `changedAt` when its time was moved. */
export interface NotifyActivity {
  id: string;
  title: string;
  category?: string;
  location: string;
  start: ISODateTime;
  previousStart?: ISODateTime;
  changedAt?: ISODateTime;
}

export interface NotifyRequest {
  id: string;
  title: string;
  status: 'submitted' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';
  awaitingGuest: boolean;
  team: string;
  person?: string;
  resolutionNotes?: string;
  timeline: { status: NotifyRequest['status']; at: ISODateTime }[];
}

export interface NotifyAlert {
  id: string;
  severity: 'info' | 'notice' | 'action' | 'urgent';
  title: string;
  body: string;
  createdAt: ISODateTime;
  expiresAt?: ISODateTime;
  route?: string;
  actionLabel?: string;
}

export interface NotifyRecommendation {
  experienceId: string;
  recommendation: string;
  category: string;
  destination: string;
  voyageDate: string;
  reason: string;
  /** Only recommendations the guest can act on are worth a notification. */
  actionable: boolean;
}

/** A notification already sent or scheduled by the server (the outbound record). */
export interface StoredNotification {
  id: string;
  type?: NotificationType;
  category: string;
  title: string;
  body: string;
  scheduledFor: ISODateTime;
  deliveredAt?: ISODateTime;
  readAt?: ISODateTime;
  deepLink?: string;
  bypassQuietHours: boolean;
  /** The engine key it was sent for, so it is never generated twice. */
  dedupeKey?: string;
}

export interface NotifyInput {
  guest: NotifyGuest;
  itinerary: NotifyDay[];
  bookings: NotifyBooking[];
  activities: NotifyActivity[];
  requests: NotifyRequest[];
  alerts: NotifyAlert[];
  recommendations: NotifyRecommendation[];
  stored: StoredNotification[];
}

// ─── Output ────────────────────────────────────────────────────────────────

export interface CandidateNotification {
  /** Stable key: the same event always has the same key (dedupe across app and server). */
  key: string;
  type: NotificationType;
  title: string;
  body: string;
  /** When it becomes relevant. */
  at: ISODateTime;
  /** No longer worth showing as live after this. */
  expiresAt?: ISODateTime;
  /** Internal route only (validated). */
  deepLink?: string;
  /** Delivered even in quiet hours (a driver arriving, anything urgent). */
  timeSensitive: boolean;
  source: { kind: 'booking' | 'transfer' | 'activity' | 'request' | 'alert' | 'recommendation' | 'port' | 'stored'; id: string };
  /** For stored notifications: already read on the server. */
  readAt?: ISODateTime;
}

export interface DecidedNotification extends CandidateNotification {
  delivery: NotificationDelivery;
  /** When a push goes out: `at`, or the end of quiet hours. */
  deliverAt: ISODateTime;
  /** Why a push was held or not sent, for audit. */
  reason?: 'quiet-hours' | 'push-disabled' | 'type-off' | 'privacy';
}
