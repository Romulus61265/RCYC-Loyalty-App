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
  | 'general';

/** Rich, structured content an answer can carry alongside prose. */
export type ConciergeAttachment =
  | { kind: 'schedule'; dayNumber: number }
  | { kind: 'experiences'; experienceIds: ID[] }
  | { kind: 'privileges'; privilegeIds: ID[] }
  | { kind: 'service-request'; requestId: ID };

export interface ConciergeMessage {
  id: ID;
  conversationId: ID;
  author: ConciergeAuthor;
  /** Display name for human authors, e.g. "Sophie, Suite Ambassador". */
  authorName?: string;
  body: string;
  createdAt: ISODateTime;
  intent?: ConciergeIntent;
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
}

export interface EscalationRequest {
  conversationId: ID;
  reason: 'guest-request' | 'low-confidence' | 'sensitive' | 'complaint' | 'medical';
  preferredChannel: 'chat' | 'call' | 'in-suite-visit';
  note?: string;
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
