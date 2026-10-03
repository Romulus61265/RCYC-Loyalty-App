import type { ID, ISODateTime, RequestStatus } from './common';
import type { JourneyPhase } from './voyage';

export type ConciergeAuthor = 'guest' | 'ai' | 'human';

export type ConciergeIntent =
  | 'schedule.query'
  | 'dining.modify'
  | 'experience.discover'
  | 'transport.arrange'
  | 'loyalty.benefits'
  | 'occasion.plan'
  | 'service.request'
  | 'medical.assist'
  | 'request.status'
  | 'human.handoff'
  | 'gratitude'
  | 'general';

/**
 * What kind of answer a concierge message is. Information answers from the
 * guest's data; a recommendation suggests something not yet booked; a
 * transactional reply concerns a change, which only a booking service can
 * confirm (the reply never claims it on its own).
 */
export type ConciergeClassification = 'information' | 'recommendation' | 'transactional';

/** Who a conversation is handed to. */
export type EscalationTarget = 'suite-ambassador' | 'concierge-team' | 'medical';

/**
 * Something the concierge offers to do, shown as a button on an action card.
 * The guest's tap is the consent; ConciergeService.performAction carries it out.
 */
export type ConciergeAction =
  | { kind: 'change-booking'; label: string; bookingId: ID; start: ISODateTime }
  | { kind: 'request-experience'; label: string; experienceId: ID; start: ISODateTime; partySize: number; requestId?: ID }
  | { kind: 'service-request'; label: string; type: ServiceRequestType; summary: string; details?: string; priority?: ServiceRequest['priority'] }
  | { kind: 'escalate'; label: string; to: EscalationTarget; reason: EscalationRequest['reason'] }
  /** In-app navigation only (a route such as `/voyage?section=documents`). */
  | { kind: 'open'; label: string; route: string };

/** Rich, structured content an answer can carry alongside prose. */
export type ConciergeAttachment =
  | { kind: 'schedule'; dayNumber: number }
  | { kind: 'experiences'; experienceIds: ID[] }
  | { kind: 'privileges'; privilegeIds: ID[] }
  | { kind: 'service-request'; requestId: ID }
  /** An action card, optionally about one experience, booking or request (for imagery and status). */
  | { kind: 'actions'; title: string; detail?: string; subject?: { experienceId?: ID; bookingId?: ID; requestId?: ID }; actions: ConciergeAction[] }
  /** The outcome of an action: confirmed at once, or received and being arranged. */
  | { kind: 'confirmation'; status: RequestStatus; title: string; detail: string; reference?: string; bookingId?: ID; requestId?: ID }
  /** The conversation has been passed to a person. */
  | { kind: 'handoff'; to: EscalationTarget; team: ServiceRequest['assignedTeam']; agentName: string; expectedResponseMinutes: number; requestId?: ID };

export interface ConciergeMessage {
  id: ID;
  conversationId: ID;
  author: ConciergeAuthor;
  /** Display name for human authors, e.g. "Sophie, Suite Ambassador". */
  authorName?: string;
  body: string;
  createdAt: ISODateTime;
  intent?: ConciergeIntent;
  /** Set on concierge (AI) answers. */
  classification?: ConciergeClassification;
  attachments?: ConciergeAttachment[];
  /** Quick replies the guest can tap. */
  suggestions?: string[];
}

export type ServiceRequestType =
  | 'dining-change'
  | 'transport'
  | 'occasion'
  | 'suite'
  | 'excursion'
  | 'medical'
  | 'general';

export interface ServiceRequest {
  id: ID;
  reservationId: ID;
  type: ServiceRequestType;
  summary: string;
  details?: string;
  status: RequestStatus;
  priority: 'routine' | 'priority' | 'urgent';
  /** Team currently owning it — enables shore/ship continuity. */
  assignedTeam: 'shoreside-concierge' | 'suite-ambassador' | 'guest-services' | 'medical' | 'destination-services';
  assignedTo?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** Expected next update, so the guest is never left wondering. */
  nextUpdateBy?: ISODateTime;
  /** The experience or booking the request is about, when there is one. */
  experienceId?: ID;
  bookingId?: ID;
}

export interface EscalationRequest {
  conversationId: ID;
  reason: 'guest-request' | 'low-confidence' | 'sensitive' | 'complaint' | 'medical';
  preferredChannel: 'chat' | 'call' | 'in-suite-visit';
  note?: string;
  /** The guest's named Suite Ambassador, the concierge team, or medical. Defaults by reason. */
  to?: EscalationTarget;
}

export interface EscalationResult {
  handoffId: ID;
  team: ServiceRequest['assignedTeam'];
  agentName: string;
  expectedResponseMinutes: number;
}

/**
 * Minimised context passed to the AI provider. Contains no raw PII —
 * identifiers are pseudonymous and preferences are summarised.
 */
export interface GuestContext {
  guestRef: ID;
  preferredName: string;
  phase: JourneyPhase;
  tierLabel: string;
  voyageName?: string;
  currentDay?: number;
  currentPort?: string;
  upcomingBookingIds: ID[];
  dietarySummary?: string;
  occasionsThisVoyage: string[];
  locale: string;
}
