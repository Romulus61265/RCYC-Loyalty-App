import type { ID, ISODateTime } from './common';
import type { ServiceRequest } from './concierge';

/** What the guest asks for help with. */
export type ServiceRequestCategory =
  | 'suite'
  | 'dining'
  | 'housekeeping'
  | 'maintenance'
  | 'transportation'
  | 'excursion'
  | 'spa'
  | 'concierge'
  | 'special-assistance'
  | 'other';

/**
 * The guest-facing lifecycle. Underlying request states map onto it (see
 * services/shared/serviceRequests): received → submitted, acknowledged by a
 * person → acknowledged, in progress or awaiting the guest → in progress,
 * completed or confirmed → resolved, then closed (by the guest, by the team,
 * or because it was cancelled or could not be done).
 */
export type ServiceRequestStatus = 'submitted' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';

export type ServiceRequestPriority = ServiceRequest['priority'];

/** A guest service request as the Requests screens show it. */
export interface GuestServiceRequest {
  id: ID;
  /** Who raised it (or the lead guest, for requests raised by the team). */
  guest: { id: ID; name: string };
  voyage: { id: ID; name: string };
  reservationId: ID;
  category: ServiceRequestCategory;
  /** One line, for lists. */
  title: string;
  description: string;
  priority: ServiceRequestPriority;
  status: ServiceRequestStatus;
  /** The underlying team is waiting for the guest's reply. */
  awaitingGuest: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  assignedTeam: { team: ServiceRequest['assignedTeam']; label: string; person?: string };
  resolutionNotes?: string;
  nextUpdateBy?: ISODateTime;
  /** When each status was reached (submitted first). */
  timeline: { status: ServiceRequestStatus; at: ISODateTime }[];
  /** Before work starts the guest may withdraw it; once resolved they may close it. */
  canClose: boolean;
  /** The experience or booking it is about, when there is one. */
  experienceId?: ID;
  bookingId?: ID;
  /** The celebration-plan step it came from. */
  occasionStep?: string;
}

export interface NewServiceRequest {
  reservationId: ID;
  category: ServiceRequestCategory;
  description: string;
  priority?: ServiceRequestPriority;
  /** Set by OccasionService when a celebration step is approved. */
  occasionStep?: string;
}
