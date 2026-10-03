import type { ID, ISODateTime } from './common';
import type { EventSeverity, JourneyEventType } from './events';

/**
 * The internal event model: one envelope for everything that happens to a
 * guest's journey, whoever noticed it. Producers publish to EventService;
 * handlers (one per service) react, and may publish follow-up events.
 *
 * Field names are snake_case: this is the wire and storage shape, the same
 * in the app, the Edge Functions and the journey_events table.
 */
export const INTERNAL_EVENT_TYPES = [
  'FLIGHT_DELAYED',
  'TRANSFER_DELAYED',
  'EMBARKATION_UPDATED',
  'PORT_CHANGED',
  'EXCURSION_CANCELLED',
  'DINING_UPDATED',
  'SPA_UPDATED',
  'GUEST_REQUEST_CREATED',
  'GUEST_REQUEST_RESOLVED',
  'SPECIAL_OCCASION_DETECTED',
  'LOYALTY_MILESTONE',
  'SERVICE_FAILURE',
] as const;

export type InternalEventType = (typeof INTERNAL_EVENT_TYPES)[number];

/**
 * Lifecycle: received → processing → handled (every handler succeeded),
 * partially_handled (some failed), failed (all failed) or unhandled (no
 * handler for the type).
 */
export type InternalEventStatus = 'received' | 'processing' | 'handled' | 'partially_handled' | 'failed' | 'unhandled';

/** What each type carries. Ids are the system's own; times carry their local offset. */
export interface InternalEventPayloads {
  FLIGHT_DELAYED: {
    flight_number: string;
    /** Local date of the scheduled departure (how airlines key a flight). */
    departure_date: string;
    scheduled_arrival: ISODateTime;
    estimated_arrival: ISODateTime;
    delay_minutes: number;
    /** The source's id for the observation. */
    observation_id: string;
    /** Demonstration data from a simulated source. */
    simulated: boolean;
  };
  TRANSFER_DELAYED: { booking_id: ID; previous_start: ISODateTime; new_start: ISODateTime; new_end?: ISODateTime; reason: string };
  EMBARKATION_UPDATED: { window_start: ISODateTime; window_end: ISODateTime; luggage_delivered_by?: ISODateTime; reason: string };
  PORT_CHANGED: { port_call_id: ID; from_port: string; to_port: string; date: string; reason?: string };
  EXCURSION_CANCELLED: { booking_id: ID; experience_id?: ID; reason?: string };
  DINING_UPDATED: { booking_id: ID; change: 'confirmed' | 'moved' | 'cancelled'; start?: ISODateTime; reason?: string };
  SPA_UPDATED: { booking_id: ID; change: 'confirmed' | 'moved' | 'cancelled'; start?: ISODateTime; reason?: string };
  GUEST_REQUEST_CREATED: { request_id: ID; category: string; priority: 'routine' | 'priority' | 'urgent' };
  GUEST_REQUEST_RESOLVED: { request_id: ID; resolution?: string };
  SPECIAL_OCCASION_DETECTED: { occasion_key: string; kind: string; date: string };
  LOYALTY_MILESTONE: { programme: 'marriott-bonvoy'; milestone: string; value?: number };
  SERVICE_FAILURE: { kind: string; subject_id?: ID; detail?: string };
}

export interface InternalEvent<T extends InternalEventType = InternalEventType> {
  event_id: ID;
  event_type: T;
  /** When it happened (not when it was received). */
  timestamp: ISODateTime;
  guest_id: ID;
  voyage_id: ID;
  /** Who reported it: "mock-flight-status", "travel-disruption-handler", "crew-console"… */
  source: string;
  payload: InternalEventPayloads[T];
  severity: EventSeverity;
  status: InternalEventStatus;
  // Extensions, for tracing and idempotency:
  /** The reservation it concerns, when there is one. */
  reservation_id?: ID;
  /** The first event of the chain this one belongs to. */
  correlation_id: ID;
  /** The event that caused this one (absent for the first). */
  causation_id?: ID;
  /** Publishing twice with the same key is a no-op. */
  dedupe_key?: string;
}

/** What a producer hands to EventService.publish; the service fills in the rest. */
export type NewInternalEvent<T extends InternalEventType = InternalEventType> = Pick<InternalEvent<T>, 'event_type' | 'guest_id' | 'voyage_id' | 'source' | 'payload'> &
  Partial<Pick<InternalEvent<T>, 'timestamp' | 'severity' | 'reservation_id' | 'dedupe_key'>>;

/** Default severity per type, when the producer gives none. */
export const DEFAULT_SEVERITY: Record<InternalEventType, EventSeverity> = {
  FLIGHT_DELAYED: 'notice',
  TRANSFER_DELAYED: 'notice',
  EMBARKATION_UPDATED: 'notice',
  PORT_CHANGED: 'action',
  EXCURSION_CANCELLED: 'action',
  DINING_UPDATED: 'info',
  SPA_UPDATED: 'info',
  GUEST_REQUEST_CREATED: 'info',
  GUEST_REQUEST_RESOLVED: 'info',
  SPECIAL_OCCASION_DETECTED: 'info',
  LOYALTY_MILESTONE: 'info',
  SERVICE_FAILURE: 'action',
};

/**
 * The same events in the journey_events table's dotted vocabulary, so the
 * internal model and the stored, server-side events stay one stream.
 */
export const JOURNEY_EVENT_TYPE: Record<InternalEventType, JourneyEventType | string> = {
  FLIGHT_DELAYED: 'flight.delayed',
  TRANSFER_DELAYED: 'transfer.delayed',
  EMBARKATION_UPDATED: 'embarkation.changed',
  PORT_CHANGED: 'itinerary.port_changed',
  EXCURSION_CANCELLED: 'excursion.cancelled',
  DINING_UPDATED: 'dining.updated',
  SPA_UPDATED: 'spa.updated',
  GUEST_REQUEST_CREATED: 'service.request_created',
  GUEST_REQUEST_RESOLVED: 'service.request_resolved',
  SPECIAL_OCCASION_DETECTED: 'occasion.detected',
  LOYALTY_MILESTONE: 'loyalty.milestone',
  SERVICE_FAILURE: 'service.failure',
};

/** One handler's run for one event. */
export interface HandlerRun {
  event_id: ID;
  handler: string;
  /** done: carried out · requested: asked of a person · skipped: nothing to do · failed. */
  outcome: 'done' | 'requested' | 'skipped' | 'failed';
  detail?: string;
  /** Follow-up events it published. */
  emitted: ID[];
  started_at: ISODateTime;
  finished_at: ISODateTime;
}
