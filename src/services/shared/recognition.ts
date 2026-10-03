/** Recognition read model shared by LoyaltyService implementations. */
import type { GuestPrivilege, GuestRelationship, LoyaltyMembership, LoyaltyRecognition } from '@/domain';

export function ordinalWord(n: number): string {
  return ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][n - 1] ?? `${n}th`;
}

/** Privileges that apply on a voyage: voyage-specific ones for it, plus standing ones. */
export function privilegesFor<T extends Pick<GuestPrivilege, 'appliesToVoyageId'>>(privileges: T[], voyageId?: string): T[] {
  return privileges.filter((p) => !voyageId || !p.appliesToVoyageId || p.appliesToVoyageId === voyageId);
}

export function buildRecognition(membership: LoyaltyMembership, relationship: GuestRelationship, privileges: GuestPrivilege[]): LoyaltyRecognition {
  const ordinal = relationship.voyagesCompleted + 1;
  return {
    membership,
    relationship,
    privileges,
    recognitionLine: `Welcome back for your ${ordinalWord(ordinal)} voyage with us.`,
  };
}
