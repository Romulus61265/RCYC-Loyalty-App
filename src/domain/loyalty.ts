import type { ID, ISODate, SourceRef } from './common';

/**
 * Loyalty is *recognition*, not currency. The programme of record is
 * Marriott Bonvoy; we only project what is meaningful to the guest journey.
 */
export type BonvoyTier = 'member' | 'silver' | 'gold' | 'platinum' | 'titanium' | 'ambassador';

export interface LoyaltyMembership {
  programme: 'marriott-bonvoy';
  /** Masked membership number, e.g. "•••• •••• 4821". */
  memberNumberMasked: string;
  tier: BonvoyTier;
  tierLabel: string;
  /** e.g. "Lifetime Titanium Elite". */
  lifetimeStatus?: string;
  memberSince: ISODate;
  /** Secondary, intentionally de-emphasised in the UI. */
  pointsBalance?: number;
  source: SourceRef;
}

export interface GuestPrivilege {
  id: ID;
  title: string;
  description: string;
  category: 'arrival' | 'suite' | 'dining' | 'wellness' | 'shore' | 'recognition' | 'service';
  /** Why the guest is entitled — shown on request, never as a badge wall. */
  basis: 'bonvoy-tier' | 'voyage-tenure' | 'suite-category' | 'occasion' | 'discretionary';
  appliesToVoyageId?: ID;
}

/** The lifetime relationship with the Yacht Collection itself. */
export interface GuestRelationship {
  guestId: ID;
  voyagesCompleted: number;
  nightsSailed: number;
  firstVoyageDate: ISODate;
  yachtsSailed: string[];
  /** Internal segment. Never displayed to the guest. */
  valueSegment: 'emerging' | 'established' | 'distinguished' | 'founding';
  /** Ambassador assigned for continuity across voyages, when applicable. */
  ambassadorName?: string;
}

export interface LoyaltyRecognition {
  membership: LoyaltyMembership;
  relationship: GuestRelationship;
  privileges: GuestPrivilege[];
  /** One-line, human recognition statement for Home. */
  recognitionLine: string;
}
