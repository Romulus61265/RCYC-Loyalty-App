// Shoreside-to-yacht continuity: contracts.
//
// Self-contained (no imports), so the same rules run in the app (the mock
// demonstration) and in the Edge Functions. The input shapes are structural
// subsets of the app's domain types.
//
//   flight-status source ──▶ FlightStatusUpdate ──▶ flight.delayed (journey event)
//        ──▶ plan (rules) ──▶ actions, each through a port to the team that owns it
//        ──▶ derived events (transfer.rescheduled, experience.change_requested, embarkation.changed)
//        ──▶ ArrivalUpdate (what the guest reads) · audit

export type ISODateTime = string; // with offset

/**
 * One observation from a flight-status source. Sources are adapters behind
 * TravelDisruptionService; the only one that exists today is the mock.
 */
export interface FlightStatusUpdate {
  /** The source's own id for this observation (idempotency). */
  observationId: string;
  flightNumber: string;
  /** Local date of the scheduled departure, as airlines key flights. */
  departureDate: string;
  status: 'scheduled' | 'delayed' | 'departed' | 'landed' | 'cancelled' | 'diverted';
  scheduledArrival: ISODateTime;
  estimatedArrival?: ISODateTime;
  observedAt: ISODateTime;
  /** Which adapter produced it, e.g. "mock-flight-status". */
  source: string;
  /** True for demonstration data: the guest is told so. */
  simulated: boolean;
}

/** What the rules need to know about the guest's arrival day. */
export interface ArrivalContext {
  now: ISODateTime;
  reservationId: string;
  guest: { firstName: string; tier?: string; suiteName?: string };
  ambassador: { firstName: string; title: string };
  flight: { id: string; flightNumber: string; origin: string; destination: string; scheduledArrival: ISODateTime; trackedForTransfer: boolean };
  /** The private transfer meeting this flight, if booked. */
  transfer?: { bookingId: string; title: string; venue: string; start: ISODateTime; end?: ISODateTime };
  /** Bookings on the way to the yacht (inside the transfer), e.g. a private visit en route. */
  enRoute: { bookingId: string; title: string; start: ISODateTime; end?: ISODateTime }[];
  embarkation: { terminalName: string; windowStart: ISODateTime; windowEnd: ISODateTime; suiteReadyAt: ISODateTime; allAboard: ISODateTime; luggageDeliveredBy?: ISODateTime };
}

/** Below this, the driver simply waits: nothing is rearranged. */
export const DELAY_THRESHOLD_MINUTES = 20;
/** Never meet a guest sooner than this after landing (passport control, luggage). */
export const MIN_MEET_MINUTES = 45;
/** The yacht wants this much time before all aboard. */
export const ALL_ABOARD_MARGIN_MINUTES = 60;

export type ContinuityActionKind = 'retime-transfer' | 'request-experience-change' | 'notify-embarkation' | 'alert-crew';

export type ContinuityAction =
  | { kind: 'retime-transfer'; bookingId: string; start: ISODateTime; end?: ISODateTime }
  | { kind: 'request-experience-change'; bookingId: string; title: string; start: ISODateTime }
  | { kind: 'notify-embarkation'; windowStart: ISODateTime; windowEnd: ISODateTime; luggageDeliveredBy?: ISODateTime }
  | { kind: 'alert-crew'; reason: 'all-aboard-at-risk' | 'no-transfer' | 'flight-cancelled'; detail: string };

/** The rules' decision for one delay. Pure. */
export interface ArrivalPlan {
  /** Stable: one plan per flight and estimated arrival. */
  key: string;
  reservationId: string;
  flightId: string;
  delayMinutes: number;
  newArrival: ISODateTime;
  /** Nothing to rearrange (a short delay): the driver waits. */
  minor: boolean;
  newPickup?: ISODateTime;
  /** At the yacht terminal, by about. */
  atTerminal?: ISODateTime;
  window?: { start: ISODateTime; end: ISODateTime };
  allAboardAtRisk: boolean;
  actions: ContinuityAction[];
}

/** What a team's port reported: done, asked for (a person will confirm), told, or failed. */
export type ActionOutcome = 'confirmed' | 'requested' | 'notified' | 'failed';

export interface ExecutedAction {
  action: ContinuityAction;
  outcome: ActionOutcome;
  /** Who did it, for the guest: "your driver", "the embarkation team". */
  by: string;
}

export type ArrivalStepKind = 'flight-delay' | 'transfer-updated' | 'embarkation-notified' | 'transfer-time' | 'arrival-estimate' | 'concierge';

export interface ArrivalStep {
  kind: ArrivalStepKind;
  label: string;
  detail: string;
  /** done: it has happened; pending: asked for, a person confirms; info: for the guest's knowledge. */
  state: 'done' | 'pending' | 'info';
  /** "12:00" for the times that matter. */
  value?: string;
}

/** What the guest reads. Guest-safe: no internal detail, no supplier names. */
export interface ArrivalUpdate {
  id: string;
  key: string;
  reservationId: string;
  flightNumber: string;
  /** "We've adjusted your arrival arrangements." only when every change is done. */
  headline: string;
  intro: string;
  steps: ArrivalStep[];
  /** Other plans that move with the arrival (a visit en route), each as requested. */
  alsoAffected: { title: string; detail: string; state: 'done' | 'pending' }[];
  /** For the crew to handle with the guest personally (all aboard at risk). */
  attention?: string;
  /** Demonstration data from a simulated source. */
  simulated: boolean;
  createdAt: ISODateTime;
}

/** Events derived from the delay, correlated to it (for the crew consoles and audit). */
export interface ContinuityEvent {
  type: 'flight.delayed' | 'transfer.rescheduled' | 'experience.change_requested' | 'embarkation.changed' | 'continuity.crew_alert';
  reservationId: string;
  /** The flight observation that started it all. */
  correlationId: string;
  /** The event that caused this one. */
  causationId: string;
  dedupeKey: string;
  occurredAt: ISODateTime;
  severity: 'info' | 'notice' | 'action' | 'urgent';
  source: string;
  payload: Record<string, unknown>;
}
