import type { ID } from '@/domain';
import type { LoyaltyService } from '@/services/contracts';
import { buildRecognition, privilegesFor } from '@/services/shared/recognition';
import { data, failIf, latency } from './support';

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
    return latency(privilegesFor(privileges, voyageId));
  }

  async getRecognition(guestId: ID, voyageId?: ID) {
    failIf('core', 'loyalty recognition');
    const [membership, relationship, privs] = await Promise.all([
      this.getMembership(guestId),
      this.getRelationship(guestId),
      this.getPrivileges(guestId, voyageId),
    ]);
    return buildRecognition(membership!, relationship, privs);
  }

  linkMembership(_guestId: ID, _authorizationCode: string) {
    return latency(loyaltyMembership, 600);
  }
}
