// Service recovery: contracts.
//
// Self-contained (no imports), so the same rules run in the app (the
// guest's notice and its alternatives) and in the Edge Functions (the
// recorded recovery event, the crew brief and goodwill proposals). The input
// shapes are structural subsets of the app's domain types.
//
//   disruption ──▶ assess (severity, owner, follow-up) ──▶ plan (steps, message, alternatives, assistance)
//              ──▶ record (crew)  ·  guest notice (guest-safe)  ·  goodwill rules ──▶ proposals (never applied)

export type ISODateTime = string; // with offset
export type ISODate = string;

export type DisruptionKind =
  | 'transfer-delay'
  | 'dining-cancellation'
  | 'excursion-cancellation'
  | 'suite-issue'
  | 'port-change'
  | 'weather-disruption'
  | 'missed-service'
  | 'guest-complaint';

export const DISRUPTION_KINDS: readonly DisruptionKind[] = [
  'transfer-delay',
  'dining-cancellation',
  'excursion-cancellation',
  'suite-issue',
  'port-change',
  'weather-disruption',
  'missed-service',
  'guest-complaint',
];

/** Where it came from: a journey event (an operational system), the guest's own data, or a crew member. */
export type DisruptionSource = 'journey-event' | 'detected' | 'crew';

/** Weather is a cause, too: a cancellation for weather also rules out alternatives on the water that day. */
export type DisruptionCause = 'weather' | 'operational' | 'supplier' | 'safety' | 'guest-feedback' | 'unknown';

/** Something that went wrong, or will, for the party on this reservation. */
export interface Disruption {
  /** Stable and unique: one recovery per disruption, however often it is reported. */
  key: string;
  kind: DisruptionKind;
  reservationId: string;
  guestIds: string[];
  occurredAt: ISODateTime;
  source: DisruptionSource;
  cause: DisruptionCause;
  /** What it touches; the plan reads titles and times from the guest's data. */
  subject: {
    bookingId?: string;
    experienceId?: string;
    requestId?: string;
    portCallId?: string;
    /**
     * A snapshot taken when the disruption is recorded (a cancelled booking
     * leaves the guest's lists), or a supplier's own wording.
     */
    title?: string;
    start?: ISODateTime;
    end?: ISODateTime;
    venue?: string;
    partySize?: number;
  };
  /**
   * Why. `guest` is shown to the guest when present (calm, factual, no blame);
   * `internal` stays with the crew. With no guest reason the plan explains nothing.
   */
  reason?: { guest?: string; internal?: string };
  details?: {
    delayMinutes?: number;
    /** A transfer's new pick-up time. */
    newTime?: ISODateTime;
    /** For a port change. */
    fromPort?: string;
    toPort?: string;
    toPortCallId?: string;
    date?: ISODate;
    /** For a complaint or suite issue: the guest's own words, crew only. */
    quote?: string;
  };
}

/** The guest-safe part of a disruption: what a notice stores and the app plans from. */
export type GuestDisruption = Omit<Disruption, 'reason' | 'details' | 'guestIds'> & {
  reason?: { guest?: string };
  details?: Omit<NonNullable<Disruption['details']>, 'quote'>;
};

// ─── Context ───────────────────────────────────────────────────────────────

export interface RecoveryDay {
  id: string;
  day: number;
  date: ISODate;
  type: string; // embark | port | tender | overnight | sea | disembark
  portName: string;
}

export interface RecoveryBooking {
  id: string;
  experienceId: string;
  title: string;
  category: string;
  venue: string;
  start: ISODateTime;
  end?: ISODateTime;
  partySize: number;
  status: string;
}

export interface RecoveryExperience {
  id: string;
  category: string;
  title: string;
  subtitle?: string;
  portCallId?: string;
  destination?: string;
  durationMinutes?: number;
  inclusive: boolean;
  /** Minor units; shown only on the approval panel. */
  price?: { amountMinor: number; currency: string };
  format: string; // private | small-group | shared | private-or-group
  tags: string[];
}

export interface RecoveryAvailability {
  experienceId: string;
  slots: { start: ISODateTime; end?: ISODateTime; remaining: number }[];
}

export interface RecoveryRequest {
  id: string;
  title: string;
  category: string;
  description: string;
  status: string; // submitted | acknowledged | in_progress | resolved | closed
  createdAt: ISODateTime;
  /** The crew's promise of the next update. */
  nextUpdateBy?: ISODateTime;
  /** The experience it asks for, if any. */
  experienceId?: string;
  /** A tag such as `recovery:<key>:assist` when raised from a recovery. */
  occasionStep?: string;
}

export interface RecoveryContext {
  now: ISODateTime;
  guest: { firstName: string; partySize: number; tier?: string };
  ambassador: { firstName: string; title: string };
  itinerary: RecoveryDay[];
  bookings: RecoveryBooking[];
  catalogue: RecoveryExperience[];
  availability: RecoveryAvailability[];
  requests: RecoveryRequest[];
  /** Celebration dates this voyage (an anniversary dinner matters more). */
  occasionDates: ISODate[];
  /** Recovery events already recorded for this reservation (repeat disruptions escalate). */
  priorRecoveries: number;
}

// ─── Plan ──────────────────────────────────────────────────────────────────

export type RecoverySeverity = 'low' | 'moderate' | 'high' | 'critical';
export const SEVERITIES: readonly RecoverySeverity[] = ['low', 'moderate', 'high', 'critical'];

/** Who owns the recovery on board or ashore. */
export type RecoveryOwner = 'suite-ambassador' | 'concierge' | 'shore-operations' | 'restaurant-manager' | 'housekeeping' | 'guest-services-manager';

export interface RecoveryAssessment {
  severity: RecoverySeverity;
  /** Why the severity is what it is (crew only). */
  factors: string[];
  owner: RecoveryOwner;
  /** Senior attention: the Hotel Director hears of it. */
  escalate: boolean;
  /** The guest hears from a person by then. */
  followUpBy: ISODateTime;
}

/**
 * The playbook. inform → explain (only when the reason is known) →
 * alternatives (when there are any) → assist → record; escalate and follow up
 * are the crew's.
 */
export type RecoveryStepKind = 'inform' | 'explain' | 'alternatives' | 'assist' | 'record' | 'escalate' | 'follow-up';

export interface RecoveryStep {
  kind: RecoveryStepKind;
  /** "Inform the guest calmly". */
  label: string;
  /** What it means here. */
  detail: string;
  audience: 'guest' | 'crew';
  /** Done when the recovery is recorded (the notice is the message); to do otherwise. */
  state: 'done' | 'to-do';
}

/**
 * What accepting an alternative would do. Never carried out by the plan:
 * only the service, on the guest's explicit approval.
 */
export type RecoveryProposal =
  | { kind: 'request-experience'; experienceId: string; start: ISODateTime; partySize: number }
  | { kind: 'service-request'; category: string; description: string; priority: 'routine' | 'priority' | 'urgent' };

export interface RecoveryAlternative {
  /** Stable: `${disruption key}:${experience or kind}`. */
  id: string;
  title: string;
  /** Why it is a fair alternative, in the house voice. */
  detail: string;
  date?: ISODate;
  /** "10:00". */
  time?: string;
  destination?: string;
  experienceId?: string;
  /** "€2,400", "Included". */
  price?: string;
  /** Accepting may lead to a charge, so the guest must acknowledge it. */
  chargeable: boolean;
  proposal: RecoveryProposal;
  /** "Request 10:00". */
  actionLabel: string;
}

export interface RecoveryPlan {
  disruption: Disruption;
  /** What was affected, as the guest knows it. */
  subject: { title: string; date?: ISODate; start?: ISODateTime; bookingId?: string };
  assessment: RecoveryAssessment;
  steps: RecoveryStep[];
  message: { eyebrow: string; title: string; body: string[]; signature: string };
  /** Shown only when the reason is known and the guest may hear it. */
  explanation?: string;
  alternatives: RecoveryAlternative[];
  assistance: { label: string; description: string; category: string; priority: 'routine' | 'priority' | 'urgent' };
  /** Printed under the alternatives. */
  assurance: string;
  /** For the crew: what happened, what to do, by when, and what not to do. */
  crewBrief: string[];
  engineVersion: string;
}

// ─── Goodwill ──────────────────────────────────────────────────────────────

/**
 * Goodwill and compensation are business decisions, not the engine's. Rules
 * are written and approved by authorised people; the engine only matches
 * them and proposes. A proposal is carried out by a person with the
 * authority the rule names, never automatically.
 */
export type GoodwillActionKind = 'gesture' | 'amenity' | 'upgrade' | 'service-credit' | 'refund' | 'loyalty-points';

/** Kinds that move money or value. Off in the MVP, whatever a rule says. */
export const FINANCIAL_ACTIONS: readonly GoodwillActionKind[] = ['service-credit', 'refund', 'loyalty-points'];

export type CrewRole = 'suite_ambassador' | 'concierge_agent' | 'shore_ops' | 'admin';

export interface GoodwillRule {
  id: string;
  version: number;
  /** Only approved rules are matched. */
  status: 'draft' | 'approved' | 'retired';
  name: string;
  appliesTo: DisruptionKind[];
  minSeverity: RecoverySeverity;
  conditions?: {
    /** Only for these Bonvoy tiers. */
    tiers?: string[];
    /** Only when the disruption falls on a celebration day. */
    occasionDay?: boolean;
    /** Only after this many recoveries on the reservation (including this one). */
    minRecoveries?: number;
    /** Only when what was lost was private, or paid for. */
    privateOrPaid?: boolean;
  };
  action: {
    kind: GoodwillActionKind;
    /** "A bottle from the sommelier’s reserve, with a note from the Captain". */
    description: string;
    /** Upper bound for financial actions, in minor units. */
    maxValue?: { amountMinor: number; currency: string };
  };
  approval: {
    /** Who may approve a proposal from this rule (admin always may). */
    role: CrewRole;
    /** At most this many approved per reservation. */
    maxPerReservation: number;
  };
  /** The person who approved the rule, and when. Rules without both are ignored. */
  authorizedBy?: string;
  authorizedAt?: ISODateTime;
  effectiveFrom?: ISODateTime;
  effectiveTo?: ISODateTime;
}

export type GoodwillProposalStatus = 'proposed' | 'approved' | 'declined';

export interface GoodwillProposal {
  /** `${disruption key}:${rule id}@${version}`. */
  id: string;
  disruptionKey: string;
  reservationId: string;
  ruleId: string;
  ruleVersion: number;
  action: GoodwillRule['action'];
  financial: boolean;
  approvalRole: CrewRole;
  /** Why it matched (crew only). */
  rationale: string;
  status: GoodwillProposalStatus;
  proposedAt: ISODateTime;
  decidedAt?: ISODateTime;
  decidedBy?: string;
  note?: string;
}

/** Rules that were looked at and not proposed, and why (for audit). */
export interface GoodwillSkip {
  ruleId: string;
  reason: 'not-approved' | 'not-authorized' | 'not-effective' | 'kind' | 'severity' | 'conditions' | 'financial-disabled' | 'limit';
}

export interface GoodwillPolicy {
  /**
   * Financial goodwill (credits, refunds, points) is never proposed while
   * false. The MVP ships with it false; switching it on is a business
   * decision recorded in configuration, not code.
   */
  financialEnabled: boolean;
}

export const MVP_GOODWILL_POLICY: GoodwillPolicy = { financialEnabled: false };
