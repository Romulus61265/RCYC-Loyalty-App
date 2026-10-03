import type { ID, ISODate, ISODateTime } from './common';
import type {
  DisruptionKind,
  GoodwillProposal,
  GoodwillRule,
  RecoveryAlternative,
  RecoveryAssessment,
  RecoverySeverity,
  RecoveryStep,
} from '../../supabase/functions/_shared/recovery/types';

/**
 * Service recovery. The rules and their types are shared with the Edge
 * Functions that record each disruption (supabase/functions/_shared/recovery).
 */
export type { DisruptionKind, GoodwillProposal, GoodwillRule, RecoveryAssessment, RecoverySeverity, RecoveryStep };

/** An alternative as the guest sees it: what accepting it would do stays with the service. */
export type GuestRecoveryAlternative = Omit<RecoveryAlternative, 'proposal'>;

/**
 * What the guest is told about a disruption: calmly, with the reason when it
 * is known, comparable alternatives and a person to help. Never the
 * severity, the crew's brief or any goodwill under consideration.
 */
export interface RecoveryNotice {
  id: ID;
  kind: DisruptionKind;
  occurredAt: ISODateTime;
  eyebrow: string;
  title: string;
  body: string[];
  /** Only when the reason is known and may be shared. */
  explanation?: string;
  signature: string;
  /** What was affected. */
  subject: { title: string; date?: ISODate; bookingId?: ID };
  /** Still open to the guest: what is free, not yet booked, and does not clash. */
  alternatives: GuestRecoveryAlternative[];
  /** The alternative the guest chose, now requested. */
  accepted?: { alternativeId: string; title: string; bookingId?: ID; requestId?: ID };
  assistance: { label: string; requested: boolean; requestId?: ID };
  assurance: string;
  /** Resolved once the guest has chosen, or the crew has closed it. */
  status: 'open' | 'resolved';
}

/** The guest's explicit yes. Without it nothing is requested. */
export interface RecoveryApproval {
  alternativeId: string;
  approved: true;
  /** Required when the alternative is chargeable. */
  acknowledgedCharge?: boolean;
  note?: string;
}

export interface RecoveryAcceptance {
  notice: RecoveryNotice;
  bookingId?: ID;
  requestId?: ID;
}

/** The recorded recovery event, for the crew. */
export interface RecoveryRecord {
  id: ID;
  disruptionKey: string;
  reservationId: ID;
  kind: DisruptionKind;
  source: 'journey-event' | 'detected' | 'crew';
  assessment: RecoveryAssessment;
  steps: RecoveryStep[];
  crewBrief: string[];
  alternativesOffered: string[];
  status: 'open' | 'in-hand' | 'resolved';
  occurredAt: ISODateTime;
  recordedAt: ISODateTime;
  engineVersion: string;
}
