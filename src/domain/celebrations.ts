import type { ID, ISODate, ISODateTime } from './common';
import type { ServiceRequestCategory, ServiceRequestPriority } from './requests';

/** The celebrations the orchestration knows how to plan. */
export type CelebrationKind = 'birthday' | 'anniversary' | 'honeymoon' | 'milestone-voyage' | 'bonvoy-milestone';

/** A celebration found to fall during this voyage. */
export interface DetectedCelebration {
  /** Stable: `${kind}:${sourceId}`. */
  key: string;
  kind: CelebrationKind;
  /** "20th wedding anniversary", "Your fifth voyage with us". */
  label: string;
  date: ISODate;
  dayNumber?: number;
  /** Where the yacht is that day; undefined at sea. */
  port?: string;
  atSea: boolean;
  /** 'discreet' means quietly; 'private' occasions are never detected. */
  recognition: 'celebrate' | 'discreet';
  /** 20 for a 20th anniversary, 5 for a fifth voyage, 15 for fifteen years with Bonvoy. */
  ordinal?: number;
  /** First names of the people it is for. */
  people: string[];
  source: 'guest-occasion' | 'voyage-history' | 'bonvoy';
  sourceId: string;
}

export type CelebrationStepKind = 'private-dining' | 'wine' | 'suite-amenity' | 'private-shore' | 'spa' | 'captain' | 'concierge';

/**
 * What approving a step would do. Never carried out by the plan itself:
 * only OccasionService.approveStep, with the guest's explicit approval.
 */
export type CelebrationProposal =
  | { kind: 'request-experience'; experienceId: ID; start: ISODateTime; partySize: number }
  | { kind: 'service-request'; category: ServiceRequestCategory; description: string; priority: ServiceRequestPriority };

export interface CelebrationStep {
  /** Stable: `${celebration key}:${kind}`. */
  id: string;
  kind: CelebrationStepKind;
  /** "Private dining". */
  heading: string;
  /** "Dinner on a Private Terrace". */
  title: string;
  /** One or two sentences, in the house voice. */
  detail: string;
  date?: ISODate;
  /** "20:30" when a time is proposed or arranged. */
  time?: string;
  destination?: string;
  experienceId?: ID;
  /** Suggested; or already in hand (booked, requested or arranged), with its status in words. */
  state: 'suggested' | 'in-hand';
  inHand?: { label: string; tone: 'calm' | 'pending' | 'attention'; bookingId?: ID; requestId?: ID };
  proposal?: CelebrationProposal;
  /** The button: "Request 20:30", "Ask Elena to arrange it". */
  actionLabel?: string;
  /** "€1,200", "Included", "The sommelier will confirm the price with you first". */
  price?: string;
  /** Approving may lead to a charge, so the guest must acknowledge it. */
  chargeable: boolean;
}

export interface CelebrationPlan {
  celebration: DetectedCelebration;
  message: { eyebrow: string; title: string; body: string[]; signature: string };
  steps: CelebrationStep[];
  /** Printed under the steps. */
  assurance: string;
}

/** The guest's explicit yes. Without it nothing is requested. */
export interface CelebrationApproval {
  stepId: string;
  approved: true;
  /** Required when the step is chargeable. */
  acknowledgedCharge?: boolean;
  /** Optional words for the team ("No flowers, please"). */
  note?: string;
}

export interface CelebrationApprovalResult {
  step: CelebrationStep;
  requestId?: ID;
  bookingId?: ID;
}
