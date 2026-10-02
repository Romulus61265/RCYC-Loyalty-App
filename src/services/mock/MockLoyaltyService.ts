import type { ID } from '@/domain';
import type { LoyaltyService } from '@/services/contracts';
import { data, latency } from './support';

const { membership: loyaltyMembership, relationship: guestRelationship, privileges } = data.guest;

/**
 * MVP stand-in for Marriott Bonvoy. A future `MarriottBonvoyService` will
 * implement the same contract behind the backend-for-frontend, so no screen
 * changes when the real programme is connected.
 */
export class MockLoyaltyService implements LoyaltyService {
  getMembership(_guestId: ID) {
    return latency(loyaltyMembership);
  }

  getRelationship(_guestId: ID) {
    return latency(guestRelationship);
  }

  getPrivileges(_guestId: ID, voyageId?: ID) {
    return latency(privileges.filter((p) => !voyageId || !p.appliesToVoyageId || p.appliesToVoyageId === voyageId));
  }

  async getRecognition(guestId: ID, voyageId?: ID) {
    const [membership, relationship, privs] = await Promise.all([
      this.getMembership(guestId),
      this.getRelationship(guestId),
      this.getPrivileges(guestId, voyageId),
    ]);
    const ordinal = relationship.voyagesCompleted + 1;
    return {
      membership: membership!,
      relationship,
      privileges: privs,
      recognitionLine: `Welcome back for your ${ordinalWord(ordinal)} voyage with us.`,
    };
  }

  linkMembership(_guestId: ID, _authorizationCode: string) {
    return latency(loyaltyMembership, 600);
  }
}

function ordinalWord(n: number): string {
  return ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][n - 1] ?? `${n}th`;
}
